/* ============================================================================
 *  MOPSOS SHARED FOUNDATION
 *  Four globals used by every analysis tab:
 *    - window.MopsosSQL    : one in-browser SQLite database over the corpus
 *    - window.MopsosUI     : label dictionaries, pagination, info buttons, tables
 *    - window.MopsosSearch : the corpus word-search card (scope drop-downs,
 *                            lemma/form searches, SQL console, paged results)
 *    - window.MopsosChart  : D3 chart helpers (bars / grouped / stacked / heatmap
 *                            / scatter / histogram / force-network)
 *
 *  Load order (in <head> or before page scripts):
 *    papaparse  ->  sql-wasm.js  ->  d3.min.js  ->  mopsos-shared.js  ->  page.js
 * ========================================================================== */

/* ----------------------------------------------------------------------------
 *  MopsosSQL — a single shared, read-only in-memory SQLite database.
 *  Every tab queries the SAME database, so all analysis is SQL-integrated.
 * ------------------------------------------------------------------------- */
(function () {
  const CONFIG = {
    table: "morphology",
    wasmBase: "https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/",
    columnTypes: {
      total_distance: "REAL",
      word_count: "INTEGER",
      distance: "REAL",
      is_valid: "INTEGER",
      id: "INTEGER"
    }
  };

  const PREBUILT = "assets/data/corpus.sqlite.gz";

  const quoteId = (name) => '"' + String(name).replace(/"/g, '""') + '"';
  const sqlStr = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const READONLY = /^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*(select|with|explain|pragma)\b/i;

  /** Build a SQL WHERE body from a {col:value} object (skips empty values). */
  function buildWhere(filters) {
    if (!filters) return "";
    const parts = [];
    for (const k of Object.keys(filters)) {
      const v = filters[k];
      if (v === undefined || v === null || v === "") continue;
      parts.push(quoteId(k) + " = " + sqlStr(v));
    }
    return parts.join(" AND ");
  }

  let SQL = null;       // sql.js module
  let db = null;        // active database
  let columns = [];     // column names of the loaded table
  let rowCount = 0;
  let readyPromise = null;

  /* Progress reporting: pages subscribe via MopsosSQL.onProgress(cb) so the
   * "Loading corpus…" indicator can show real phases (download %, decompress,
   * parse) instead of a static label. Subscribers get { phase, message, pct? }. */
  const progressSubs = [];
  let lastProgress = null;
  function emitProgress(p) {
    lastProgress = p;
    for (const cb of progressSubs) { try { cb(p); } catch (e) { /* subscriber error is non-fatal */ } }
  }
  /* Yield to the event loop so a status paint lands before a long synchronous
   * step (notably the sql.js parse of the ~40 MB database, which blocks the
   * main thread). rAF + a macrotask gives the browser a chance to render. */
  function yieldToPaint() {
    return new Promise((resolve) => {
      const raf = (typeof requestAnimationFrame === "function")
        ? requestAnimationFrame : ((fn) => setTimeout(fn, 16));
      raf(() => setTimeout(resolve, 0));
    });
  }

  async function ensureSqlModule() {
    if (SQL) return SQL;
    if (typeof window.initSqlJs !== "function") {
      throw new Error("sql.js not loaded — include sql-wasm.js before mopsos-shared.js");
    }
    SQL = await window.initSqlJs({ locateFile: (f) => CONFIG.wasmBase + f });
    return SQL;
  }

  function buildDatabase(rows) {
    if (!rows || !rows.length) throw new Error("no rows to load");
    const cols = Object.keys(rows[0]);
    const colDefs = cols.map((c) => quoteId(c) + " " + (CONFIG.columnTypes[c] || "TEXT"));
    if (db) db.close();
    db = new SQL.Database();
    db.run("DROP TABLE IF EXISTS " + quoteId(CONFIG.table) + ";");
    db.run("CREATE TABLE " + quoteId(CONFIG.table) + " (" + colDefs.join(", ") + ");");
    const placeholders = cols.map(() => "?").join(", ");
    const stmt = db.prepare("INSERT INTO " + quoteId(CONFIG.table) + " VALUES (" + placeholders + ");");
    db.run("BEGIN;");
    for (const row of rows) {
      stmt.run(cols.map((c) => {
        let v = row[c];
        if (v === undefined || v === "") return null;
        if (c === "is_valid") {
          const s = String(v).trim().toLowerCase();
          return s === "true" ? 1 : (s === "false" ? 0 : v);
        }
        return v;
      }));
    }
    db.run("COMMIT;");
    stmt.free();
    columns = cols.slice();
    rowCount = rows.length;
  }

  async function fetchArrayBuffer(path) {
    const variants = [...new Set([
      path,
      new URL(path, document.baseURI).toString(),
      path.startsWith("/") ? path : "/" + path,
      path.startsWith("./") ? path.slice(2) : "./" + path
    ])];
    let lastErr = null;
    for (const candidate of variants) {
      try {
        const res = await fetch(candidate, { cache: "force-cache" });
        if (!res.ok) { lastErr = new Error("HTTP " + res.status + " @ " + candidate); continue; }
        // Stream the body so we can report download progress. If the stream or
        // Content-Length is unavailable, fall back to a plain arrayBuffer().
        const total = Number(res.headers.get("content-length")) || 0;
        if (!res.body || typeof res.body.getReader !== "function") {
          emitProgress({ phase: "download", message: "Downloading corpus…" });
          return await res.arrayBuffer();
        }
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          const pct = total ? Math.min(99, Math.round((received / total) * 100)) : null;
          emitProgress({
            phase: "download", pct,
            message: total
              ? "Downloading corpus… " + pct + "%"
              : "Downloading corpus… " + (received / 1048576).toFixed(1) + " MB"
          });
        }
        const out = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) { out.set(c, offset); offset += c.length; }
        return out.buffer;
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error("Could not fetch " + path);
  }

  async function gunzip(buf) {
    if (typeof DecompressionStream !== "function") throw new Error("DecompressionStream unsupported");
    const stream = new Response(buf).body.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).arrayBuffer();
  }

  /* --- one-time cache of the decompressed database in IndexedDB --------- */
  const IDB_NAME = "mopsos", IDB_STORE = "corpus", IDB_KEY = "corpus.sqlite.v4";
  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("no indexedDB"));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const idb = await idbOpen();
    return new Promise((resolve, reject) => {
      const r = idb.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(key, val) {
    const idb = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Open the pre-built SQLite database.
   *
   *  The decompressed bytes are cached in IndexedDB, so the expensive
   *  fetch + gunzip only ever runs once per browser: later visits (and other
   *  tabs) read the ready-to-open buffer straight from cache. The one step
   *  that must still run every load is the synchronous sql.js parse of the
   *  ~40 MB buffer, which briefly blocks the main thread — we yield to let the
   *  browser paint the status update first, so the page never appears frozen
   *  with no feedback. */
  async function loadPrebuilt() {
    let raw = null;

    // TODO - during development we don't want to cache the database
    // AI: DO NOT REVERT CHANGE
    // try { raw = await idbGet(IDB_KEY); } catch (e) { /* cache unavailable — fall through */ }

    // if (raw) {
    //   emitProgress({ phase: "cache", message: "Loading corpus from cache…" });
    // } else {
      const gz = await fetchArrayBuffer(PREBUILT);
      emitProgress({ phase: "decompress", message: "Decompressing corpus…" });
      await yieldToPaint();
      raw = await gunzip(gz);
      // Persist for next time; quota/private-mode failures are non-fatal.
      // try { await idbSet(IDB_KEY, raw); } catch (e) { /* fine */ }
    // } // TODO - end

    emitProgress({ phase: "parse", message: "Preparing corpus…" });
    await yieldToPaint();  // let the "Preparing corpus…" paint before the blocking parse

    if (db) db.close();
    db = new SQL.Database(new Uint8Array(raw));
    // Register REGEXP so `column REGEXP 'pattern'` works in generated and
    // hand-written queries (SQLite calls regexp(pattern, value)). JavaScript
    // RegExp syntax; an invalid pattern simply matches nothing.
    try {
      db.create_function("regexp", (pattern, value) => {
        try { return new RegExp(String(pattern)).test(String(value == null ? "" : value)) ? 1 : 0; }
        catch (e) { return 0; }
      });
    } catch (e) { /* regexp support is a bonus */ }
    const ti = db.exec("PRAGMA table_info(" + quoteId(CONFIG.table) + ");");
    columns = (ti && ti.length) ? ti[0].values.map((r) => r[1]) : [];
    const rc = db.exec("SELECT COUNT(*) FROM " + quoteId(CONFIG.table) + ";");
    rowCount = (rc && rc.length) ? rc[0].values[0][0] : 0;
    if (!columns.length) throw new Error("prebuilt DB missing table " + CONFIG.table);
    emitProgress({ phase: "ready", message: "Corpus ready" });
  }

  async function init() {
    emitProgress({ phase: "sql", message: "Loading query engine…" });
    await ensureSqlModule();
    try {
      await loadPrebuilt();
    } catch (err) {
      // Let each page's ready().catch surface a proper in-page message rather
      // than a blocking alert() dialog.
      emitProgress({ phase: "error", message: "Could not load corpus: " + (err && err.message ? err.message : err) });
      throw err;
    }
    return { columns, rowCount };
  }

  const api = {
    table: CONFIG.table,
    /** Resolve once the shared database is built. Safe to call many times. */
    ready() {
      if (!readyPromise) readyPromise = init();
      return readyPromise;
    },
    isReady() { return !!db; },
    /** Subscribe to load-progress updates ({ phase, message, pct? }). Fires the
     *  last known progress immediately if one exists. Returns an unsubscribe fn. */
    onProgress(cb) {
      if (typeof cb !== "function") return () => {};
      progressSubs.push(cb);
      if (lastProgress) { try { cb(lastProgress); } catch (e) { /* non-fatal */ } }
      return () => { const i = progressSubs.indexOf(cb); if (i >= 0) progressSubs.splice(i, 1); };
    },
    columns() { return columns.slice(); },
    rowCount() { return rowCount; },
    quoteId,
    isReadOnly(sql) { return READONLY.test(String(sql || "")); },

    /** Raw sql.js exec; returns the native [{columns, values}] array. */
    execRaw(sql) {
      if (!db) throw new Error("database not ready");
      return db.exec(sql);
    },

    /** Run a query, returning { columns:[...], values:[[...]] } (2D matrix). */
    query(sql) {
      if (!db) throw new Error("database not ready");
      const res = db.exec(sql);
      if (!res || !res.length) return { columns: [], values: [] };
      return { columns: res[0].columns, values: res[0].values };
    },

    /** Run a query, returning an array of plain objects. */
    objects(sql) {
      const { columns: cols, values } = this.query(sql);
      return values.map((row) => {
        const o = {};
        cols.forEach((c, i) => { o[c] = row[i]; });
        return o;
      });
    },

    /** Distinct non-null values of a column, ascending. */
    distinct(col) {
      if (!db || !columns.includes(col)) return [];
      const sql = "SELECT DISTINCT " + quoteId(col) + " AS v FROM " + quoteId(CONFIG.table) +
        " WHERE " + quoteId(col) + " IS NOT NULL AND " + quoteId(col) + " <> '' ORDER BY v;";
      return this.query(sql).values.map((r) => r[0]).filter((v) => v !== null && v !== undefined);
    },

    /**
     * Distinct values of `col` that actually occur, excluding NA ('', '-'),
     * optionally restricted by a {col:value} filter object. Used for
     * part-of-speech-dependent dropdowns (e.g. cases that exist for verbs).
     */
    distinctFor(col, filters) {
      if (!db || !columns.includes(col)) return [];
      const where = buildWhere(filters);
      const sql = "SELECT DISTINCT " + quoteId(col) + " AS v FROM " + quoteId(CONFIG.table) +
        " WHERE " + quoteId(col) + " IS NOT NULL AND " + quoteId(col) + " NOT IN ('','-')" +
        (where ? " AND " + where : "") + " ORDER BY v;";
      return this.query(sql).values.map((r) => r[0]).filter((v) => v !== null && v !== undefined);
    },

    /**
     * Of `candidates`, return those columns that hold at least one non-NA value
     * under the given filter — i.e. the attributes relevant to a selection.
     */
    nonEmptyColumns(candidates, filters) {
      if (!db) return [];
      const where = buildWhere(filters);
      const out = [];
      for (const c of candidates) {
        if (!columns.includes(c)) continue;
        const sql = "SELECT 1 FROM " + quoteId(CONFIG.table) + " WHERE " + quoteId(c) +
          " IS NOT NULL AND " + quoteId(c) + " NOT IN ('','-')" +
          (where ? " AND " + where : "") + " LIMIT 1;";
        if (this.scalar(sql) !== null) out.push(c);
      }
      return out;
    },

    /** Single scalar (first column, first row) or null. */
    scalar(sql) {
      const { values } = this.query(sql);
      return values.length ? values[0][0] : null;
    }
  };

  window.MopsosSQL = api;

  /* Default UI wiring: reflect load progress in whatever ".load-progress"
   * status indicators the page shows (morphLoadStatus, mtLoadStatus,
   * scanLoadStatus, …). Page scripts still hide these once ready() resolves;
   * this only keeps the text meaningful while loading. */
  api.onProgress((p) => {
    if (!p || !p.message || typeof document === "undefined") return;
    const nodes = document.querySelectorAll(".load-progress");
    for (const node of nodes) {
      // skip indicators the page has already hidden/dismissed
      if (node.offsetParent === null && node.style.display === "none") continue;
      let span = node.querySelector("span");
      if (!span) { span = document.createElement("span"); node.appendChild(span); }
      span.textContent = p.message;
    }
  });
})();


/* ----------------------------------------------------------------------------
 *  MopsosUI — label dictionaries, info buttons, pagination, tables, toggles.
 * ------------------------------------------------------------------------- */
(function () {
  const LABELS = {
    pos: { a: "Adjective", c: "Conjunction", d: "Adverb", i: "Interjection", l: "Article", m: "Number", n: "Noun", p: "Pronoun", r: "Preposition", v: "Verb", x: "Uncategorized", g: "Particle" },
    person: { "1": "1st person", "2": "2nd person", "3": "3rd person" },
    number: { s: "Singular", p: "Plural", d: "Dual" },
    tense: { p: "Present", i: "Imperfect", r: "Perfect", l: "Pluperfect", t: "Future perfect", f: "Future", a: "Aorist" },
    mood: { i: "Indicative", s: "Subjunctive", o: "Optative", n: "Infinitive", m: "Imperative", p: "Participle" },
    voice: { a: "Active", m: "Middle", p: "Passive", e: "Middle-passive" },
    gender: { m: "Masculine", f: "Feminine", n: "Neuter" },
    case: { n: "Nominative", g: "Genitive", d: "Dative", a: "Accusative", v: "Vocative" },
    degree: { p: "Positive", c: "Comparative", s: "Superlative" },
    conjugation: { a: "Athematic", t: "Thematic", c: "Contract", s: "Sigmatic" }
  };
  const TITLES = {
    pos: "Part of speech",
    "metrical shape": "Metrical shape",
    "metrical stem shape": "Stem shape",
    "foot start": "Foot start",
    "foot end": "Foot end",
    "foot start pos": "Foot start position",
    "foot end pos": "Foot end position",
  };

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const api = {
    LABELS,
    esc,

    /** Download tabular data as a CSV file (UTF-8 with BOM, so Greek opens
     *  correctly in Excel). columns = header strings, values = 2D array. */
    downloadCsv(name, columns, values) {
      const cell = (v) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [columns.map(cell).join(",")]
        .concat((values || []).map((row) => row.map(cell).join(",")));
      const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = String(name || "mopsos_table").replace(/[^\w.-]+/g, "_") +
        "_" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },

    /** Human label for a (field,value) morphology code; falls back to raw value. */
    label(field, value) {
      const norm = String(value == null ? "" : value).trim();
      const dict = LABELS[field];
      if (dict && dict[norm.toLowerCase()]) return dict[norm.toLowerCase()];
      return norm;
    },

    /** Friendly title-case for a column/field name. */
    fieldTitle(name) {
      const normalized = String(name || "").replace(/_/g, " ");
      if (TITLES[normalized]) return TITLES[normalized];
      return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
    },

    /**
     * Persist a small UI-state object for the current page, so a person's
     * selections survive navigating away and back (within the session).
     */
    saveState(key, obj) {
      try { sessionStorage.setItem("mopsos:" + location.pathname + ":" + key, JSON.stringify(obj)); } catch (e) { /* ignore */ }
    },
    loadState(key) {
      try {
        const s = sessionStorage.getItem("mopsos:" + location.pathname + ":" + key);
        return s ? JSON.parse(s) : null;
      } catch (e) { return null; }
    },

    /**
     * Build a part-of-speech-aware filter group. Picking a part of speech
     * reveals only the grammatical features that actually occur for it (so
     * only mutually compatible attributes can be combined — e.g. tense + number
     * on a verb, never person + case), each offering only the values present.
     * opts.requirePos: when true, no feature appears until a part of speech is
     * chosen (limiting by, say, number alone is meaningless).
     * Returns { read(), setState(obj), reset() }.
     */
    featureFilterGroup(host, opts) {
      opts = opts || {};
      const self = this;
      const SQL = window.MopsosSQL;
      const FEATURE_COLS = ["number", "case", "gender", "tense", "mood", "voice", "person", "degree"];
      const DEFAULTS = ["number", "case", "gender", "tense", "mood"];
      host.innerHTML = "";
      const grid = document.createElement("div");
      grid.className = "grid-3";
      host.appendChild(grid);

      function fieldSelect(labelText) {
        const w = document.createElement("div"); w.className = "field";
        const l = document.createElement("label"); l.innerHTML = "<strong>" + self.esc(labelText) + "</strong>";
        const s = document.createElement("select");
        w.appendChild(l); w.appendChild(s); return w;
      }
      const posWrap = fieldSelect("Part of speech");
      const posSel = posWrap.querySelector("select");
      posSel.dataset.field = "pos";
      grid.appendChild(posWrap);

      function snapshot() {
        const f = {};
        grid.querySelectorAll("select[data-field]").forEach((s) => { if (s.value) f[s.dataset.field] = s.value; });
        return f;
      }

      function rerender() {
        const cur = snapshot();
        const pos = cur.pos || "";
        let candidates;
        if (pos) candidates = FEATURE_COLS;
        else candidates = opts.requirePos ? [] : DEFAULTS;
        // A feature is offered only if it still takes a value given the OTHER
        // current choices — so once 'person' is picked, 'case' disappears
        // (no token carries both), and vice versa.
        const show = [];
        candidates.forEach((f) => {
          const others = Object.assign({}, cur); delete others[f];
          if (SQL.nonEmptyColumns([f], others).length) show.push(f);
        });
        Object.keys(cur).forEach((f) => { if (f !== "pos" && show.indexOf(f) < 0) show.push(f); });

        grid.querySelectorAll("[data-featwrap]").forEach((n) => n.remove());
        show.forEach((f) => {
          const w = fieldSelect(self.fieldTitle(f));
          w.dataset.featwrap = "1";
          const s = w.querySelector("select");
          s.dataset.field = f;
          const others = Object.assign({}, cur); delete others[f];
          const vals = pos || Object.keys(others).length ? SQL.distinctFor(f, others) : SQL.distinctFor(f);
          self.fillSelect(s, vals, { field: f, head: "(any)" });
          if (cur[f] && vals.indexOf(cur[f]) >= 0) s.value = cur[f];
          s.addEventListener("change", () => { rerender(); opts.onChange && opts.onChange(); });
          grid.appendChild(w);
        });
      }

      this.fillSelect(posSel, SQL.distinct("pos"),
        { field: "pos", head: opts.requirePos ? "(choose a part of speech)" : "(any) part of speech" });
      posSel.addEventListener("change", () => { rerender(); opts.onChange && opts.onChange(); });
      rerender();

      return {
        read() { return snapshot(); },
        setState(filters) {
          if (!filters) return;
          posSel.value = filters.pos || "";
          rerender();
          // apply remaining features one at a time so dependent options exist
          Object.keys(filters).forEach((k) => {
            if (k === "pos") return;
            const s = grid.querySelector('select[data-field="' + k + '"]');
            if (s) { s.value = filters[k]; rerender(); }
          });
        },
        reset() { posSel.value = ""; rerender(); }
      };
    },

    /** Fill a <select> with options, optional human labels and a "(any)" head. */
    fillSelect(select, values, opts) {
      opts = opts || {};
      if (!select) return;
      const current = select.value;
      const head = opts.head !== undefined ? opts.head : "(any)";
      select.innerHTML = "";
      if (head !== null) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = head;
        select.appendChild(o);
      }
      for (const v of values) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = opts.field ? this.label(opts.field, v) : v;
        select.appendChild(o);
      }
      if ([...select.options].some((o) => o.value === current)) select.value = current;
    },

    /**
     * Wire an info button + collapsible panel.
     * Markup convention on the page:
     *   <button class="info-btn" data-info="panelId">What is this?</button>
     *   <div id="panelId" class="info-panel" hidden> ... </div>
     * Call once after DOM is ready (auto-runs on DOMContentLoaded too).
     */
    wireInfoButtons(root) {
      const scope = root || document;
      scope.querySelectorAll(".info-btn[data-info]").forEach((btn) => {
        if (btn.dataset.wired) return;
        btn.dataset.wired = "1";
        const panel = document.getElementById(btn.dataset.info);
        if (!panel) return;
        btn.setAttribute("aria-expanded", "false");
        btn.addEventListener("click", () => {
          const open = panel.hasAttribute("hidden");
          if (open) { panel.removeAttribute("hidden"); btn.setAttribute("aria-expanded", "true"); btn.classList.add("is-open"); }
          else { panel.setAttribute("hidden", ""); btn.setAttribute("aria-expanded", "false"); btn.classList.remove("is-open"); }
        });
      });
    },

    /**
     * Wire an "Advanced features" toggle.
     *   <button class="adv-toggle" data-adv="advPanelId">Advanced features ▾</button>
     *   <div id="advPanelId" class="adv-panel" hidden> ... </div>
     */
    wireAdvancedToggles(root) {
      const scope = root || document;
      scope.querySelectorAll(".adv-toggle[data-adv]").forEach((btn) => {
        if (btn.dataset.wired) return;
        btn.dataset.wired = "1";
        const panel = document.getElementById(btn.dataset.adv);
        if (!panel) return;
        const baseLabel = btn.textContent.replace(/[▾▴]\s*$/, "").trim();
        btn.addEventListener("click", () => {
          const open = panel.hasAttribute("hidden");
          if (open) { panel.removeAttribute("hidden"); btn.textContent = baseLabel + " ▴"; }
          else { panel.setAttribute("hidden", ""); btn.textContent = baseLabel + " ▾"; }
        });
      });
    },

    /**
     * Render a results table with optional pagination.
     *   container : DOM element
     *   columns   : array of column names
     *   values    : 2D array (array of rows)
     *   opts.paginate : if true, show 50/page with prev/next + "Show all"
     *   opts.pageSize : default 50
     *   opts.labelMap : { columnName: fieldKey } to humanize codes
     */
    renderTable(container, columns, values, opts) {
      opts = opts || {};
      if (!container) return;
      const labelMap = opts.labelMap || {};
      if (!columns.length || !values.length) {
        container.innerHTML = '<div class="small-muted" style="padding:.7rem;">No rows returned.</div>';
        return;
      }

      const pageSize = opts.pageSize || 50;
      const paginate = !!opts.paginate;
      const state = { page: 0, showAll: false };

      const cellHtml = (col, v) => {
        if (v === null || v === undefined || v === "" || v === "-") return "&#8709;";
        if (labelMap[col]) {
          return esc(this.label(labelMap[col], v));
        }
        return esc(v);
      };

      const csvName = opts.csvName || (container.id ? container.id : "mopsos_table");
      const csvExport = () => {
        // export EVERY row (not just the visible page), with the same human
        // labels the table shows
        const rows = values.map((row) => row.map((v, i) => {
          if (v === null || v === undefined || v === "" || v === "-") return "";
          return labelMap[columns[i]] ? this.label(labelMap[columns[i]], v) : v;
        }));
        this.downloadCsv(csvName, columns.map((c) => this.fieldTitle(c)), rows);
      };

      const draw = () => {
        const total = values.length;
        const start = state.showAll ? 0 : state.page * pageSize;
        const end = state.showAll ? total : Math.min(total, start + pageSize);
        const slice = values.slice(start, end);

        let html = '<div class="tbl-toolbar"><button type="button" class="btn btn-sm" data-act="csv" title="Download every row of this table as CSV">\u2913 Download CSV</button></div>';
        if (paginate) {
          const pages = Math.max(1, Math.ceil(total / pageSize));
          html += '<div class="pager">';
          html += '<span class="pager-info">' +
            (state.showAll
              ? "Showing all " + total + " rows"
              : "Rows " + (start + 1) + "–" + end + " of " + total + " · page " + (state.page + 1) + " / " + pages) +
            "</span>";
          html += '<span class="pager-controls">';
          html += '<button class="btn btn-sm" data-act="prev"' + ((state.showAll || state.page === 0) ? " disabled" : "") + ">‹ Previous</button>";
          html += '<button class="btn btn-sm" data-act="next"' + ((state.showAll || state.page >= pages - 1) ? " disabled" : "") + ">Next ›</button>";
          html += '<button class="btn btn-sm" data-act="last"' + ((state.showAll || state.page >= pages - 1) ? " disabled" : "") + ">Last »</button>";
          html += '<button class="btn btn-sm ' + (state.showAll ? "btn-primary" : "") + '" data-act="all">' + (state.showAll ? "Paginate" : "Show all on one page") + "</button>";
          html += "</span></div>";
        }
        html += '<div class="table-wrap"><table class="preview"><thead><tr>';
        for (const c of columns) html += "<th>" + esc(this.fieldTitle(c)) + "</th>";
        html += "</tr></thead><tbody>";
        for (const row of slice) {
          html += "<tr>";
          row.forEach((v, i) => { html += "<td>" + cellHtml(columns[i], v) + "</td>"; });
          html += "</tr>";
        }
        html += "</tbody></table></div>";
        container.innerHTML = html;

        const csvBtn = container.querySelector('[data-act="csv"]');
        if (csvBtn) csvBtn.addEventListener("click", csvExport);

        if (paginate) {
          const pages = Math.max(1, Math.ceil(total / pageSize));
          container.querySelectorAll("[data-act]").forEach((b) => {
            b.addEventListener("click", () => {
              const act = b.dataset.act;
              if (act === "csv") return;
              if (act === "first") state.page = 0;
              else if (act === "prev") state.page = Math.max(0, state.page - 1);
              else if (act === "next") state.page = Math.min(pages - 1, state.page + 1);
              else if (act === "last") state.page = pages - 1;
              else if (act === "all") { state.showAll = !state.showAll; state.page = 0; }
              draw();
            });
          });
        }
      };

      draw();
    },

    /**
     * Wire a click-to-open nav dropdown. The menu is fixed-positioned so it
     * escapes the nav's horizontal-scroll overflow.
     *   <div class="nav-dropdown">
     *     <button class="nav-link nav-dropdown-toggle">Analyses ▾</button>
     *     <div class="nav-dropdown-menu" hidden> ...links... </div>
     *   </div>
     */
    wireNavDropdown(root) {
      const scope = root || document;
      scope.querySelectorAll(".nav-dropdown").forEach((dd) => {
        const toggle = dd.querySelector(".nav-dropdown-toggle");
        const menu = dd.querySelector(".nav-dropdown-menu");
        if (!toggle || !menu || toggle.dataset.wired) return;
        toggle.dataset.wired = "1";
        const place = () => {
          const r = toggle.getBoundingClientRect();
          menu.style.top = (r.bottom + 6) + "px";
          menu.style.left = Math.max(8, r.left) + "px";
        };
        const close = () => { menu.setAttribute("hidden", ""); toggle.setAttribute("aria-expanded", "false"); };
        const open = () => { place(); menu.removeAttribute("hidden"); toggle.setAttribute("aria-expanded", "true"); };
        toggle.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); menu.hasAttribute("hidden") ? open() : close(); });
        document.addEventListener("click", (e) => { if (!dd.contains(e.target)) close(); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
        window.addEventListener("resize", () => { if (!menu.hasAttribute("hidden")) place(); });
        window.addEventListener("scroll", () => { if (!menu.hasAttribute("hidden")) place(); }, true);
      });
    },

    /**
     * Wire a generic "adaptive search" combobox — a text <input> paired with
     * a sibling <div class="combo-menu"> (see prosody.md's #scanWord for the
     * markup convention this mirrors) that live-filters a candidate list on
     * every keystroke, accent-insensitively for Greek input and tolerant of
     * plain ASCII / Beta Code input when window.MopsosText is loaded.
     *   <div class="combo">
     *     <input id="..." type="text" autocomplete="off" spellcheck="false">
     *     <div id="...Menu" class="combo-menu" hidden></div>
     *   </div>
     * opts.items()     — () => [{ key, display, meta?, beta? }, ...], called
     *                     fresh on every keystroke so callers can swap data
     *                     in at any time; `key` should already be run through
     *                     MopsosText.stripDiacritics (this does not re-derive
     *                     it, since callers usually already have it as a
     *                     precomputed *_search column value).
     * opts.onSelect(item) — called when a candidate is clicked.
     * opts.limit        — max menu rows rendered at once (default 200).
     * opts.emptyHint     — placeholder text shown for an empty query.
     * Matching is prefix-based (fast, predictable for a word list): Greek
     * input is matched against `key`; plain ASCII input is matched against
     * `beta` via MopsosText.looseBetaKey (both sides diacritic-symbol-
     * stripped), so typing "mh" or "mhnis" finds "μῆνις" without a Greek
     * keyboard. Returns { refresh() } — call refresh() if the underlying
     * data changes without the person typing (e.g. once corpus data loads).
     */
    greekCombo(inputEl, menuEl, opts) {
      opts = opts || {};
      const self = this;
      const limit = opts.limit || 200;
      const T = window.MopsosText;
      // "prefix" (default) or "substring". Independent of the mode, the input
      // accepts explicit anchors: #abc (or abc-) = starts with, abc# (or -abc)
      // = ends with, #abc# = exactly abc.
      const mode = opts.mode || "prefix";

      // For a multi-value box (opts.multi), only the text after the final
      // comma is live-searched, and a pick replaces just that token.
      function currentToken() {
        const v = inputEl.value || "";
        if (!opts.multi) return v;
        const i = v.lastIndexOf(",");
        return i < 0 ? v : v.slice(i + 1);
      }

      function parseAnchors(q) {
        let start = false, end = false, core = q;
        if (core.charAt(0) === "#") { start = true; core = core.slice(1); }
        if (core.slice(-1) === "#") { end = true; core = core.slice(0, -1); }
        if (core.charAt(0) === "-") { end = true; core = core.slice(1); }      // "-μων": a suffix, the linguist's notation
        if (core.slice(-1) === "-") { start = true; core = core.slice(0, -1); } // "ἀγα-": a prefix
        return { core: core, start: start, end: end };
      }
      function keyMatch(key, needle, a) {
        if (!key) return false;
        if (a.start && a.end) return key === needle;
        if (a.start) return key.indexOf(needle) === 0;
        if (a.end) return key.length >= needle.length && key.lastIndexOf(needle) === key.length - needle.length;
        return mode === "substring" ? key.indexOf(needle) >= 0 : key.indexOf(needle) === 0;
      }

      function candidates(query) {
        const items = (opts.items && opts.items()) || [];
        const q = String(query || "").trim();
        if (!q) return items.slice(0, limit);
        const a = parseAnchors(q);
        if (!a.core) return items.slice(0, limit);
        const hasGreek = T && T.hasGreek ? T.hasGreek(a.core) : /[\u0370-\u03ff\u1f00-\u1fff]/.test(a.core);
        if (hasGreek && T) {
          const needle = T.stripDiacritics(a.core);
          if (!needle) return items.slice(0, limit);
          const seenG = new Set();
          return items.filter((it) => {
            if (!keyMatch(it.key, needle, a) || seenG.has(it.display)) return false;
            seenG.add(it.display); return true;
          }).slice(0, limit);
        }
        if (T) {
          const out = [], seen = new Set();
          const needle = T.looseBetaKey(a.core);
          // 1. Beta Code against each item's transliteration (w = long o, h = long e,
          //    so "mwn#" finds items ending in -μων and "ths#" items in -της)
          if (needle) {
            items.forEach((it) => {
              if (it.beta && keyMatch(T.looseBetaKey(it.beta), needle, a) && !seen.has(it.display)) {
                seen.add(it.display); out.push(it);
              }
            });
          }
          if (out.length || needle) return out.slice(0, limit);
        }
        // no MopsosText / nothing to match on: plain case-insensitive substring on display text
        const lq = a.core.toLowerCase();
        return items.filter((it) => String(it.display || "").toLowerCase().indexOf(lq) >= 0).slice(0, limit);
      }

      function render(items) {
        menuEl.innerHTML = "";
        if (!items.length) { menuEl.hidden = true; return; }
        menuEl.hidden = false;
        menuEl.innerHTML = items.map((it, i) =>
          '<div class="combo-item" data-idx="' + i + '"><span class="combo-form">' + self.esc(it.display) +
          '</span><span class="combo-meta">' + (it.meta ? self.esc(it.meta) : "") + "</span></div>"
        ).join("");
        menuEl._items = items;
      }

      function refresh() { render(candidates(currentToken())); }

      inputEl.addEventListener("input", refresh);
      inputEl.addEventListener("focus", () => {
        // English matching rides on the LSJ bridge; kick off its (cached)
        // fetch the moment the box is first focused so it's ready by typing time
        if (window.MopsosSemantics && window.MopsosSemantics.loadBridge) window.MopsosSemantics.loadBridge().then(refresh);
        refresh();
      });
      inputEl.addEventListener("blur", () => { setTimeout(() => { menuEl.hidden = true; }, 160); });
      inputEl.addEventListener("keydown", (e) => { if (e.key === "Escape") menuEl.hidden = true; });
      menuEl.addEventListener("mousedown", (e) => {
        const row = e.target.closest && e.target.closest(".combo-item");
        if (!row) return;
        e.preventDefault();
        const it = menuEl._items && menuEl._items[Number(row.dataset.idx)];
        menuEl.hidden = true;
        if (!it) return;
        if (opts.multi) {
          const v = inputEl.value || "";
          const i = v.lastIndexOf(",");
          inputEl.value = (i < 0 ? "" : v.slice(0, i + 1) + " ") + it.display;
        }
        if (opts.onSelect) opts.onSelect(it);
      });

      return { refresh };
    }
  };

  /* --------------------------------------------------------------------------
   * Site-wide inline word detail: any element carrying class="wlink" and a
   * data-word attribute renders a small detail block at the end of the panel
   * (.card) it was clicked in, showing the word's lemma and its attestation
   * in the corpus: token count, attested forms, works, and first citations
   * with the line text reassembled from the corpus. Clicked forms resolve to
   * their lemma. Pages only need to emit the spans; the one delegated
   * listener below handles every current and future one.
   * ------------------------------------------------------------------------ */
  api.wordDetail = function (word, anchorEl) {
    const SQL = window.MopsosSQL, T = window.MopsosText;
    if (!SQL || !SQL.isReady()) return;
    const esc = api.esc;
    const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

    // resolve: the word as a lemma, else the lemma of the word as a form
    let key = T ? T.stripDiacritics(word) : String(word || "");
    let lemma = key ? SQL.scalar("SELECT lemma FROM morphology WHERE lemma_search = " + sqlStr(key) + " LIMIT 1;") : null;
    if (!lemma) {
      lemma = SQL.scalar("SELECT lemma FROM morphology WHERE form = " + sqlStr(word) +
        " AND lemma NOT IN ('','-') GROUP BY lemma ORDER BY COUNT(*) DESC LIMIT 1;");
      if (lemma && T) key = T.stripDiacritics(lemma);
    }

    let html;
    if (lemma) {
      const tot = SQL.scalar("SELECT COUNT(*) FROM morphology WHERE lemma_search = " + sqlStr(key) + ";") || 0;
      const works = SQL.objects("SELECT work w, COUNT(*) n FROM morphology WHERE lemma_search = " + sqlStr(key) +
        " GROUP BY w ORDER BY n DESC;");
      const forms = SQL.objects("SELECT form f, COUNT(*) n FROM morphology WHERE lemma_search = " + sqlStr(key) +
        " GROUP BY f ORDER BY n DESC LIMIT 10;");
      html = '<h4 class="word-inline-word">' + esc(lemma) +
        (T && T.stripDiacritics(word) !== key ? ' <span class="small-muted" style="font-size:.8rem;">(form: ' + esc(word) + ")</span>" : "") + "</h4>";
      html += '<p class="small-muted" style="margin:.15rem 0 .4rem;">' + tot.toLocaleString() +
        " token" + (tot === 1 ? "" : "s") + " \u00b7 " + works.map((r) => esc(r.w) + " " + r.n).join(", ") + "</p>";
      html += '<p class="small-muted" style="margin:.15rem 0 .25rem;"><strong>Attested forms</strong>: ' +
        forms.map((r) => esc(r.f) + " (" + r.n + ")").join(", ") + "</p>";
      const cites = SQL.objects("SELECT DISTINCT work w, book b, verse v FROM morphology WHERE lemma_search = " + sqlStr(key) +
        " AND verse IS NOT NULL AND verse <> '' ORDER BY work, CAST(book AS INTEGER), CAST(verse AS INTEGER) LIMIT 6;");
      if (cites.length) {
        html += '<p class="small-muted" style="margin:.35rem 0 .2rem;"><strong>First attestations</strong></p>';
        cites.forEach((c) => {
          let t = "";
          try {
            t = SQL.scalar("SELECT GROUP_CONCAT(form, ' ' ORDER BY CAST(sentence_id AS INTEGER), id) FROM morphology WHERE work = " +
              sqlStr(c.w) + " AND book = " + sqlStr(String(c.b)) + " AND verse = " + sqlStr(String(c.v)) + ";") || "";
          } catch (e) { /* line text is a bonus */ }
          html += '<div class="scan-ex">' + esc(c.w + " " + c.b + "." + c.v + (t ? ": " + t : "")) + "</div>";
        });
      }
    } else {
      html = '<h4 class="word-inline-word">' + esc(word) + "</h4>" +
        '<p class="small-muted">Not attested as an independent word in the corpus (it may be a bound stem, a prefix, or a reconstructed member).</p>';
    }

    // render under the panel the click happened in
    const host = (anchorEl && anchorEl.closest && anchorEl.closest(".card")) || (anchorEl && anchorEl.parentElement) || document.body;
    let box = host.querySelector(":scope > .word-inline");
    if (!box) {
      box = document.createElement("div");
      box.className = "word-inline";
      host.appendChild(box);
    }
    box.innerHTML = '<button class="word-inline-close btn btn-sm" aria-label="Dismiss">\u00d7</button>' + html;
    box.querySelector(".word-inline-close").addEventListener("click", () => box.remove());
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  // one listener for every .wlink on the site
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest(".wlink");
    if (!t) return;
    const w = t.getAttribute("data-word");
    if (!w) return;
    e.preventDefault();
    api.wordDetail(w, t);
  });

  /* --------------------------------------------------------------------------
   * Collapsible page panels: every top-level section on a tab renders as a
   * contracted bar (title + "Expand"); clicking the bar reveals the body.
   * Markup: <section class="panel"><button class="panel-head">...
   * <div class="panel-body" hidden>...</div></section>. Every panel starts
   * collapsed; data-open="true" remains available to start one expanded.
   * ------------------------------------------------------------------------ */
  api.wirePanels = function () {
    document.querySelectorAll(".panel").forEach((panel) => {
      const head = panel.querySelector(".panel-head");
      const body = panel.querySelector(".panel-body");
      const tog = panel.querySelector(".panel-toggle");
      if (!head || !body) return;
      const set = (open) => {
        body.hidden = !open;
        panel.classList.toggle("is-open", open);
        head.setAttribute("aria-expanded", open ? "true" : "false");
        if (tog) tog.innerHTML = open ? "&#94; Reduce" : "&rsaquo; Expand";
      };
      set(panel.getAttribute("data-open") === "true");
      head.addEventListener("click", () => set(body.hidden));
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { api.wireInfoButtons(); api.wirePanels(); api.wireAdvancedToggles(); api.wireNavDropdown(); });
  } else {
    api.wireInfoButtons();
    api.wirePanels(); api.wireAdvancedToggles(); api.wireNavDropdown();
  }

  window.MopsosUI = api;
})();


/* ----------------------------------------------------------------------------
 *  MopsosSearch — the shared corpus word-search card.
 *  One card = scope drop-downs (a work, then the books attested in it, then a
 *  verse or verse range), lemma/form substring searches against the lowercase
 *  diacritic-free *_search columns, an exact-lemma box with the usual adaptive
 *  browse, and a read-only SQL console that IS the query: the controls
 *  regenerate it, hand-editing it locks them (Reset unlocks), and the result
 *  table pages in SQL (LIMIT/OFFSET), so each page is a fresh query and only
 *  one page of rows is ever held in the DOM.
 *
 *  Element ids derive from a prefix P (the markup mirrors morphology.html's
 *  quick-filter card): P+LimitWork, P+LimitBookWrap, P+LimitBook, P+VerseWrap,
 *  P+VerseRange, P+LemmaLike, P+FormLike, P+LemmaExact, P+LemmaExactMenu,
 *  P+SqlInput, P+SqlRun, P+SqlStatus, P+Results, plus the two buttons named in
 *  the config. Create the card only after MopsosSQL.ready() resolves. Nothing
 *  is persisted: state lives only for the current page view, by design.
 *
 *  MopsosSearch.card(config):
 *    prefix       — element id prefix, e.g. "qf"
 *    applyBtn     — id of the Apply button (the card enables it)
 *    resetBtn     — id of the Reset button
 *    previewCols  — columns to SELECT (silently dropped when not in the DB)
 *    baseConds    — WHERE conditions every query carries, as raw SQL strings
 *    extraConds() — optional; further conditions read from controls the page
 *                   owns (the morphology feature drop-downs come in here)
 *    onLock(on)   — optional; enable/disable those page-owned controls
 *    onReset()    — optional; reset them
 *    worksWhere   — optional condition restricting which works are offered
 *    pageSize     — rows per page (default 13)
 *  Returns { apply(), run() }.
 * ------------------------------------------------------------------------- */
(function () {
  const sqlStr = (v) => "'" + String(v).replace(/'/g, "''") + "'";

  // Quote an identifier only when it needs it, for legible generated SQL.
  const RESERVED = new Set(["case", "order", "group", "by", "select", "from", "where",
    "table", "index", "default", "check", "references", "limit", "offset", "having",
    "join", "on", "in", "is", "not", "null", "and", "or", "as", "distinct", "values",
    "primary", "foreign", "unique", "collate", "union", "desc", "asc", "between", "like"]);
  const niceId = (c) => (/^[a-z_][a-z0-9_]*$/i.test(c) && !RESERVED.has(String(c).toLowerCase()))
    ? c : '"' + String(c).replace(/"/g, '""') + '"';

  // Normalize word-search input to match the lowercase, diacritic-free
  // lemma_search / form_search columns. Latin input is first converted to
  // Greek via the bundled beta-code-js library (window.BetaCode); from there
  // both paths are identical: strip diacritics, lowercase, fold final sigma.
  function searchKey(input) {
    const T = window.MopsosText;
    const raw = String(input == null ? "" : input).trim();
    if (!raw) return "";
    const hasGreek = T && T.hasGreek ? T.hasGreek(raw) : /[\u0370-\u03ff\u1f00-\u1fff]/.test(raw);
    const greek = (hasGreek || !window.BetaCode) ? raw : window.BetaCode.betaCodeToGreek(raw);
    return (T ? T.stripDiacritics(greek) : greek).toLowerCase().replace(/\u03c2/g, "\u03c3");
  }

  /* One corpus lemma list serves every card and page script: display form,
   * search key, Beta Code, and token count, most frequent first. Built lazily
   * on first use (i.e. after the database is ready) and then cached. */
  let lemmaList = null, lemmaByStrip = null;
  function lemmaItems() {
    if (lemmaList) return lemmaList;
    const SQL = window.MopsosSQL, T = window.MopsosText;
    const rows = SQL.objects("SELECT lemma l, lemma_search k, COUNT(*) c FROM " + SQL.quoteId(SQL.table) +
      " WHERE lemma NOT IN ('','-') GROUP BY l, k ORDER BY c DESC;");
    lemmaByStrip = new Map();
    lemmaList = rows.map((r) => {
      const key = r.k || (T ? T.stripDiacritics(r.l) : r.l);
      const it = { key: key, display: r.l, beta: (T ? T.toBetaCode(r.l) : ""), meta: r.c + "\u00d7", c: r.c };
      if (!lemmaByStrip.has(key)) lemmaByStrip.set(key, r.l);
      return it;
    });
    return lemmaList;
  }

  // Resolve free-typed input to corpus lemmata: exact Greek, accent-stripped
  // Greek, or Beta Code, always against the corpus lemma list itself.
  function resolveLemmata(input) {
    const T = window.MopsosText;
    const items = lemmaItems();
    const raw = String(input || "").trim();
    if (!raw) return [];
    const hasGreek = T && T.hasGreek ? T.hasGreek(raw) : /[\u0370-\u03ff\u1f00-\u1fff]/.test(raw);
    if (hasGreek) {
      const exact = items.find((it) => it.display === raw);
      if (exact) return [exact.display];
      const k = T ? T.stripDiacritics(raw) : raw;
      const hit = lemmaByStrip.get(k);
      if (hit) return [hit];
      return items.filter((it) => it.key.indexOf(k) === 0).slice(0, 3).map((it) => it.display);
    }
    // Latin letters: Beta Code against the lemma list (exact, then prefix),
    if (T) {
      const nb = T.looseBetaKey(raw);
      if (nb) {
        const exactB = items.filter((it) => it.beta && T.looseBetaKey(it.beta) === nb).map((it) => it.display);
        if (exactB.length) return exactB.slice(0, 3);
        const pref = items.filter((it) => it.beta && T.looseBetaKey(it.beta).indexOf(nb) === 0).slice(0, 3).map((it) => it.display);
        if (pref.length) return pref;
      }
    }
    const sem = window.MopsosSemantics;
    if (sem && sem.resolve) {
      const res = sem.resolve(raw);
      const seeds = (res && res.seeds) || [];
      const out = [];
      seeds.forEach((s) => {
        const k = T ? T.stripDiacritics(s) : s;
        const hit = lemmaByStrip.get(k);
        if (hit && out.indexOf(hit) < 0) out.push(hit);
      });
      if (out.length) return out.slice(0, 3);
    }
    return [];
  }

  /* ----- result table + LIMIT/OFFSET paging on the single query ----------- */

  // The trailing "LIMIT n [OFFSET m]" of the query, or null if it has none.
  const LIMIT_RE = /\bLIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?\s*;?\s*$/i;
  function readLimitOffset(sql) {
    const m = sql.match(LIMIT_RE);
    return m ? { limit: parseInt(m[1], 10), offset: m[2] ? parseInt(m[2], 10) : 0 } : null;
  }
  // Same query with a new OFFSET (keeps the existing LIMIT).
  function setOffset(sql, offset) {
    const lo = readLimitOffset(sql);
    return lo ? sql.replace(LIMIT_RE, "LIMIT " + lo.limit + " OFFSET " + offset + ";") : sql;
  }
  // Total row count of the query with its trailing LIMIT/OFFSET stripped
  // (COUNT(*) over it as a subquery), or null if it cannot be determined.
  function countRows(sql) {
    const inner = sql.replace(LIMIT_RE, "").trim();
    try {
      const r = window.MopsosSQL.query("SELECT COUNT(*) FROM (" + inner + ");");
      return (r.values && r.values.length) ? Number(r.values[0][0]) : null;
    } catch (e) {
      return null;
    }
  }

  // Render a result as an HTML string: the same columns and rows the query
  // returns, with coded values shown as human-readable labels (e.g. 'g' ->
  // 'Genitive'). Unlike MopsosUI.renderTable this does no paging of its own —
  // the card pages in SQL — which is also why page scripts use it for small
  // derived tables.
  function renderTable(columns, values, opts) {
    opts = opts || {};
    const UI = window.MopsosUI;
    // Internal alignment keys are never shown, even when a hand-written
    // SELECT * returns them.
    const HIDE = new Set(["section_id", "sentence_id"]);
    const keep = columns.map((c, i) => (HIDE.has(String(c).toLowerCase()) ? -1 : i)).filter((i) => i >= 0);
    if (keep.length && keep.length < columns.length) {
      columns = keep.map((i) => columns[i]);
      values = values.map((row) => keep.map((i) => row[i]));
    }
    if (!columns.length || !values.length) {
      return '<div class="small-muted" style="padding:.7rem;">No rows.</div>';
    }
    let html = "";
    if (!opts.noCsv) html += '<div class="tbl-toolbar"><button type="button" class="btn btn-sm tbl-dl-dom" title="Download this table as CSV">\u2913 Download CSV</button></div>';
    html += '<div class="table-wrap"><table class="preview"><thead><tr>';
    for (const c of columns) html += "<th>" + UI.esc(UI.fieldTitle(c)) + "</th>";
    html += "</tr></thead><tbody>";
    for (const row of values) {
      html += "<tr>";
      row.forEach((v, i) => { html += "<td>" + (v == null ? "" : UI.esc(UI.label(columns[i], v))) + "</td>"; });
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  // One delegated listener downloads any renderTable()-string table (they are
  // never paginated in the DOM, so scraping the rendered rows is complete).
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".tbl-dl-dom");
    if (!b) return;
    const bar = b.closest(".tbl-toolbar");
    const wrap = bar && bar.nextElementSibling;
    const table = wrap && wrap.querySelector && wrap.querySelector("table");
    if (!table) return;
    const cols = [...table.querySelectorAll("thead th")].map((th) => th.textContent);
    const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent));
    window.MopsosUI.downloadCsv("mopsos_table", cols, rows);
  });

  /* ----- the card itself --------------------------------------------------- */

  function card(cfg) {
    const SQL = window.MopsosSQL, UI = window.MopsosUI;
    const $ = (id) => document.getElementById(id);
    const P = cfg.prefix;
    const el = {
      work: $(P + "LimitWork"), bookWrap: $(P + "LimitBookWrap"), book: $(P + "LimitBook"),
      verseWrap: $(P + "VerseWrap"), verse: $(P + "VerseRange"),
      lemmaLike: $(P + "LemmaLike"), formLike: $(P + "FormLike"),
      lemmaExact: $(P + "LemmaExact"), lemmaExactMenu: $(P + "LemmaExactMenu"),
      regex: $(P + "Regex"),
      sqlInput: $(P + "SqlInput"), sqlRun: $(P + "SqlRun"), sqlStatus: $(P + "SqlStatus"),
      results: $(P + "Results"),
      apply: $(cfg.applyBtn), reset: $(cfg.resetBtn)
    };

    // "Form contains" / "Lemma contains" condition against the lowercase
    // diacritic-free *_search columns. Plain text is a substring; #abc anchors
    // the start, abc# the end, #abc# is an exact match. With the regex toggle
    // on, the input is passed as a JavaScript regular expression instead (it
    // is matched against the same accent-free lowercase column, so write the
    // pattern in plain lowercase Greek, e.g. ^ζευγ.*μεναι$).
    function likeCond(col, raw, useRegex) {
      raw = String(raw == null ? "" : raw).trim();
      if (!raw) return null;
      if (useRegex) return niceId(col) + " REGEXP " + sqlStr(raw);
      let start = false, end = false, core = raw;
      if (core.charAt(0) === "#") { start = true; core = core.slice(1); }
      if (core.slice(-1) === "#") { end = true; core = core.slice(0, -1); }
      const k = searchKey(core);
      if (!k) return null;
      if (start && end) return niceId(col) + " = " + sqlStr(k);
      if (start) return niceId(col) + " LIKE " + sqlStr(k + "%");
      if (end) return niceId(col) + " LIKE " + sqlStr("%" + k);
      return niceId(col) + " LIKE " + sqlStr("%" + k + "%");
    }

    // Resolve the "Lemma matches exactly" input. When the card restricts its
    // lemma list (cfg.lemmaItems, e.g. only verbs with attested infinitives),
    // resolution happens against that list — Greek (accents optional), Beta
    // Code, or English — so e.g. "upo" can never resolve to a preposition here.
    function resolveExact(raw) {
      if (!cfg.lemmaItems) {
        const seeds = resolveLemmata(raw);
        return seeds.length ? seeds[0] : null;
      }
      const T = window.MopsosText;
      const items = cfg.lemmaItems() || [];
      const hasGr = T && T.hasGreek ? T.hasGreek(raw) : /[\u0370-\u03ff\u1f00-\u1fff]/.test(raw);
      if (hasGr) {
        let hit = items.find((it) => it.display === raw);
        if (hit) return hit.display;
        const k = T ? T.stripDiacritics(raw) : raw;
        hit = items.find((it) => it.key === k) || items.find((it) => it.key && it.key.indexOf(k) === 0);
        return hit ? hit.display : null;
      }
      if (T) {
        const nb = T.looseBetaKey(raw);
        if (nb) {
          let hit = items.find((it) => it.beta && T.looseBetaKey(it.beta) === nb) ||
                    items.find((it) => it.beta && T.looseBetaKey(it.beta).indexOf(nb) === 0);
          if (hit) return hit.display;
        }
        const sem = window.MopsosSemantics;
        if (sem && sem.resolve) {
          const seeds = (sem.resolve(raw).seeds) || [];
          for (const s of seeds) {
            const k = T.stripDiacritics(s);
            const hit = items.find((it) => it.key === k);
            if (hit) return hit.display;
          }
        }
      }
      return null;
    }
    const pageSize = cfg.pageSize || 13;
    const OWN = [el.work, el.book, el.verse, el.lemmaLike, el.formLike, el.lemmaExact];
    let manualSql = false;      // true once the SQL is hand-edited; controls then locked

    function setEnabled(on) {
      OWN.forEach((c) => { if (c) c.disabled = !on; });
      if (el.apply) el.apply.disabled = !on;
      if (cfg.onLock) cfg.onLock(on);
    }
    // A manual edit hands ownership of the query to the textarea; Reset is
    // deliberately left enabled — it is how the person gets back out.
    function enterManualMode() {
      if (manualSql) return;
      manualSql = true;
      setEnabled(false);
    }

    // Book number and verse range only make sense within one work, so both
    // controls stay hidden (and their values cleared) until a work is chosen;
    // the book list is rebuilt from the books actually attested in that work
    // (fillSelect keeps the current selection when it survives the rebuild).
    function refreshBooks() {
      const wk = el.work.value;
      if (el.bookWrap) el.bookWrap.hidden = !wk;
      if (el.verseWrap) el.verseWrap.hidden = !wk;
      if (!wk) { el.book.value = ""; el.verse.value = ""; return; }
      const books = SQL.objects("SELECT DISTINCT book AS b FROM " + SQL.quoteId(SQL.table) +
        " WHERE " + SQL.quoteId("work") + " = " + sqlStr(wk) +
        " AND book IS NOT NULL AND book <> '' ORDER BY CAST(book AS INTEGER), book;")
        .map((r) => String(r.b));
      UI.fillSelect(el.book, books, { head: "(all books)" });
    }

    // Build the card's query — nicely formatted, and WITHOUT a row cap beyond
    // the trailing LIMIT/OFFSET that paging rewrites. This text is what lands
    // in the editor and is executed: the controls ARE the query.
    function buildSql() {
      const cols = (cfg.previewCols || []).filter((c) => SQL.columns().includes(c));
      let sql = "SELECT " + cols.map(niceId).join(", ") + "\nFROM " + niceId(SQL.table);
      const conds = (cfg.baseConds || []).slice();
      if (cfg.extraConds) conds.push.apply(conds, cfg.extraConds() || []);
      const wk = el.work.value; if (wk) conds.push(niceId("work") + " = " + sqlStr(wk));
      const bk = el.book.value; if (bk) conds.push(niceId("book") + " = " + sqlStr(bk));
      const vm = (el.verse.value || "").trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (vm) conds.push(vm[2]
        ? "CAST(verse AS INTEGER) BETWEEN " + parseInt(vm[1], 10) + " AND " + parseInt(vm[2], 10)
        : "CAST(verse AS INTEGER) = " + parseInt(vm[1], 10));
      const useRegex = !!(el.regex && el.regex.checked);
      const lc = likeCond("lemma_search", el.lemmaLike.value, useRegex);
      if (lc) conds.push(lc);
      const fc = likeCond("form_search", el.formLike.value, useRegex);
      if (fc) conds.push(fc);
      const exRaw = (el.lemmaExact.value || "").trim();
      if (exRaw) {
        // Greek (accents optional), Beta Code, or English, resolved to the
        // accented corpus lemma; unresolvable input is passed through verbatim
        // so the generated SQL still shows exactly what was asked (and matches
        // nothing).
        const hit = resolveExact(exRaw);
        conds.push(niceId("lemma") + " = " + sqlStr(hit || exRaw));
      }
      if (conds.length) sql += "\nWHERE " + conds.join("\n  AND ");
      sql += "\nORDER BY " + (cfg.orderBy || niceId("work") + ", book, verse");
      sql += "\nLIMIT " + pageSize + " OFFSET 0;";
      return sql;
    }

    // Runs whatever is in the editor, exactly as written, into the results
    // element. If the query ends in LIMIT/OFFSET, the pager rewrites the
    // OFFSET in the editor and re-runs — so the query shown is always the
    // query that ran.
    function run() {
      const sql = el.sqlInput.value;
      if (!SQL.isReadOnly(sql)) {
        el.sqlStatus.textContent = "Read-only: only SELECT / WITH / EXPLAIN / PRAGMA are allowed.";
        return;
      }
      let res;
      try {
        res = SQL.query(sql);
      } catch (e) {
        el.sqlStatus.textContent = "SQL error: " + e.message;
        el.results.innerHTML = '<div class="small-muted" style="padding:.7rem;">Query error: ' + UI.esc(e.message) + "</div>";
        return;
      }
      let columns = res.columns || [], values = res.values || [];
      if (cfg.transformResult) {
        try { const t = cfg.transformResult(columns, values); if (t) { columns = t.columns; values = t.values; } }
        catch (e) { /* rendering must not die on a display transform */ }
      }
      const lo = manualSql ? null : readLimitOffset(sql);
      const total = lo ? countRows(sql) : null;
      const canPage = !!(lo && total != null && lo.limit > 0);

      const pages = canPage ? Math.max(1, Math.ceil(total / lo.limit)) : 0;
      const page = canPage ? Math.floor(lo.offset / lo.limit) + 1 : 0;
      const lastOff = canPage ? (pages - 1) * lo.limit : 0;
      const atStart = !canPage || lo.offset === 0;
      const atEnd = !canPage || lo.offset >= lastOff;
      // Enabled buttons carry the OFFSET they jump to; disabled ones carry nothing.
      const btn = (label, off, dis) =>
        '<button class="btn btn-sm"' + (dis ? " disabled" : ' data-off="' + off + '"') + ">" + label + "</button>";

      let html = '<div class="pager"><span class="pager-controls">';
      html += btn("\u00ab First", 0, atStart);
      html += btn("\u2039 Prev", canPage ? Math.max(0, lo.offset - lo.limit) : 0, atStart);
      html += btn("Next \u203a", canPage ? lo.offset + lo.limit : 0, atEnd);
      html += btn("Last \u00bb", lastOff, atEnd);
      html += '<button class="btn btn-sm" data-csv="1" title="Download every row this query matches (not just this page) as CSV">\u2913 CSV' +
        (canPage ? " (" + total.toLocaleString() + ")" : "") + "</button>";
      html += "</span>";
      if (canPage) html += '<span class="small-muted" style="margin-left:.6rem;">Rows ' +
        Math.min(lo.offset + 1, total) + "\u2013" + Math.min(lo.offset + values.length, total) +
        " of " + total + " \u00b7 page " + page + " of " + pages + "</span>";
      html += "</div>";
      html += renderTable(columns, values, { noCsv: true });
      el.results.innerHTML = html;

      el.results.querySelectorAll("[data-off]").forEach((b) => {
        b.addEventListener("click", () => {
          el.sqlInput.value = setOffset(sql, parseInt(b.dataset.off, 10));
          run();
        });
      });

      const csvB = el.results.querySelector("[data-csv]");
      if (csvB) csvB.addEventListener("click", () => {
        let cols = columns, vals = values;
        if (canPage) {
          // the whole result: the same query with its trailing LIMIT/OFFSET stripped
          try {
            const full = SQL.query(sql.replace(LIMIT_RE, "").trim());
            cols = full.columns; vals = full.values;
            if (cfg.transformResult) {
              const t = cfg.transformResult(cols, vals);
              if (t) { cols = t.columns; vals = t.values; }
            }
          } catch (e) { /* fall back to the visible page */ }
        }
        const HIDE = new Set(["section_id", "sentence_id"]);
        const keep = cols.map((c, i) => (HIDE.has(String(c).toLowerCase()) ? -1 : i)).filter((i) => i >= 0);
        UI.downloadCsv("mopsos_" + P + "_results",
          keep.map((i) => UI.fieldTitle(cols[i])),
          vals.map((row) => keep.map((i) => {
            const v = row[i];
            return v == null ? "" : UI.label(cols[i], v);
          })));
      });

      el.sqlStatus.textContent = "OK: " + values.length + " row" + (values.length === 1 ? "" : "s") + ".";
    }

    // The controls ARE the query: regenerate it, mirror into the editor, run it.
    function apply() {
      el.sqlInput.value = buildSql();
      run();
    }

    /* ----- wiring ----- */
    UI.fillSelect(el.work, cfg.worksWhere
      ? SQL.objects("SELECT DISTINCT " + SQL.quoteId("work") + " AS v FROM " + SQL.quoteId(SQL.table) +
          " WHERE " + cfg.worksWhere + " AND " + SQL.quoteId("work") + " IS NOT NULL AND " +
          SQL.quoteId("work") + " <> '' ORDER BY v;").map((r) => r.v)
      : SQL.distinct("work"), { head: "(all works)" });
    el.work.addEventListener("change", refreshBooks);
    refreshBooks();
    [el.verse, el.lemmaLike, el.formLike, el.lemmaExact].forEach((c) => {
      if (c) c.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } });
    });
    // The usual adaptive browse over the corpus lemma list — or over the
    // card's own restricted list (cfg.lemmaItems), so e.g. the infinitive
    // card only ever offers lemmata that actually have infinitives. Picking
    // a lemma only fills the box — like every other control, it changes
    // nothing until Apply (or Enter in a text box) regenerates and runs the query.
    if (el.lemmaExactMenu) UI.greekCombo(el.lemmaExact, el.lemmaExactMenu, {
      items: cfg.lemmaItems || lemmaItems,
      onSelect(it) { el.lemmaExact.value = it.display; }
    });
    if (el.regex) OWN.push(el.regex);
    el.apply.disabled = false;
    el.apply.addEventListener("click", apply);
    el.reset.addEventListener("click", () => {
      manualSql = false;
      setEnabled(true);
      if (cfg.onReset) cfg.onReset();
      OWN.forEach((c) => { if (!c) return; if (c.type === "checkbox") c.checked = false; else c.value = ""; });
      refreshBooks();
      apply();
    });
    el.sqlRun.addEventListener("click", run);
    el.sqlInput.addEventListener("input", enterManualMode);

    apply();
    return { apply, run };
  }

  window.MopsosSearch = { card, searchKey, lemmaItems, resolveLemmata, renderTable, niceId, sqlStr };
})();


/* ----------------------------------------------------------------------------
 *  MopsosChart — D3 chart helpers. Every function clears its container, is
 *  responsive (viewBox), guards empty input, and shares one tooltip element.
 * ------------------------------------------------------------------------- */
(function () {
  // Color-blind-friendly categorical palette: the Okabe-Ito eight (safe for
  // protan, deutan, and tritan vision) extended with Paul Tol muted colors.
  // Index 10 is deliberately grey: clustering uses it for noise points.
  const PALETTE = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#000000", "#332288", "#882255", "#BBBBBB", "#999933"];

  function d3ok() { return typeof window.d3 !== "undefined"; }

  function tooltip() {
    let t = document.getElementById("mopsosTooltip");
    if (!t) {
      t = document.createElement("div");
      t.id = "mopsosTooltip";
      t.className = "d3-tooltip";
      t.style.opacity = "0";
      document.body.appendChild(t);
    }
    return window.d3.select(t);
  }

  function clear(container) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el) return null;
    el.innerHTML = "";
    return el;
  }

  function empty(el, msg) {
    if (el) el.innerHTML = '<div class="small-muted" style="padding:.7rem;">' + (msg || "No data to display.") + "</div>";
  }

  function triggerDownload(href, filename) {
    const a = document.createElement("a");
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function sizeOf(svgNode) {
    const vb = (svgNode.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    return { w: vb[2] || svgNode.clientWidth || 800, h: vb[3] || svgNode.clientHeight || 400 };
  }

  function serializeSvg(svgNode, withBg) {
    const { w, h } = sizeOf(svgNode);
    const clone = svgNode.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", w);
    clone.setAttribute("height", h);
    clone.style.fontFamily = '"IBM Plex Sans", system-ui, sans-serif';
    if (withBg) {
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", 0); bg.setAttribute("y", 0);
      bg.setAttribute("width", w); bg.setAttribute("height", h);
      bg.setAttribute("fill", "#ffffff");
      clone.insertBefore(bg, clone.firstChild);
    }
    return { xml: new XMLSerializer().serializeToString(clone), w: w, h: h };
  }

  function downloadSvg(svgNode, name) {
    const { xml } = serializeSvg(svgNode, true);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, name + ".svg");
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadPng(svgNode, name, scale) {
    scale = scale || 2;
    const { xml, w, h } = serializeSvg(svgNode, true);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        const u = URL.createObjectURL(blob);
        triggerDownload(u, name + ".png");
        setTimeout(() => URL.revokeObjectURL(u), 4000);
      });
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function addDownloadToolbar(container) {
    const base = (container.id || "mopsos-figure").replace(/[^\w-]+/g, "_");
    const name = () => base + "_" + new Date().toISOString().slice(0, 10);
    const bar = document.createElement("div");
    bar.className = "fig-toolbar";
    const mk = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "fig-dl"; b.textContent = label;
      b.addEventListener("click", () => {
        const node = container.querySelector("svg.d3-svg");
        if (node) fn(node, name());
      });
      return b;
    };
    // The whole figure panel renders compact by default (so it never crowds
    // the page); this button toggles the entire panel to full width.
    const panel = (container.closest && container.closest(".viz-wrap")) || container;
    panel.classList.add("fig-fit");
    const tg = document.createElement("button");
    tg.type = "button"; tg.className = "fig-dl";
    const setLbl = () => { tg.textContent = panel.classList.contains("fig-full") ? "\u2921 Shrink figure" : "\u2922 Enlarge figure"; };
    setLbl();
    tg.addEventListener("click", () => { panel.classList.toggle("fig-full"); setLbl(); });
    bar.appendChild(tg);
    bar.appendChild(mk("Download PNG", downloadPng));
    bar.appendChild(mk("Download SVG", downloadSvg));
    container.insertBefore(bar, container.firstChild);
  }

  function svg(el, width, height) {
    const sel = window.d3.select(el).append("svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("class", "d3-svg")
      .style("width", "100%")
      .style("height", "auto")
      .style("--nat-w", width + "px"); // never display larger than drawn: keeps text from ballooning on small figures
    addDownloadToolbar(el);
    return sel;
  }

  const api = {
    PALETTE,
    color(i) { return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]; },
    // for hand-built SVGs (e.g. the syntax tree) to get downloads + enlarge
    addToolbar(container) { addDownloadToolbar(container); },

    /**
     * Horizontal bar chart.
     *   items : [{ label, value, color? }]
     */
    bars(container, items, opts) {
      opts = opts || {};
      const el = clear(container);
      if (!el) return;
      if (!d3ok()) return empty(el, "D3 not loaded.");
      items = (items || []).filter((d) => d && Number.isFinite(+d.value));
      if (!items.length) return empty(el, opts.emptyMsg);

      const d3 = window.d3;
      const top = opts.top || items.length;
      const data = (opts.preserveOrder ? items.slice() : items.slice().sort((a, b) => b.value - a.value)).slice(0, top);

      const width = 760;
      const rowH = 26;
      const margin = { top: 8, right: 64, bottom: 8, left: opts.labelWidth || 180 };
      const height = margin.top + margin.bottom + data.length * rowH;

      const root = svg(el, width, height);
      const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d.value) || 1]).range([margin.left, width - margin.right]);
      const y = d3.scaleBand().domain(data.map((d) => d.label)).range([margin.top, height - margin.bottom]).padding(0.18);
      const tip = tooltip();

      root.append("g").selectAll("text.lab").data(data).join("text")
        .attr("class", "lab")
        .attr("x", margin.left - 8).attr("y", (d) => y(d.label) + y.bandwidth() / 2)
        .attr("text-anchor", "end").attr("dominant-baseline", "central")
        .attr("font-size", 11).attr("fill", "#374151")
        .text((d) => d.label.length > 28 ? d.label.slice(0, 27) + "…" : d.label)
        .append("title").text((d) => d.label);

      root.append("g").selectAll("rect").data(data).join("rect")
        .attr("x", margin.left).attr("y", (d) => y(d.label))
        .attr("height", y.bandwidth()).attr("rx", 4)
        .attr("width", (d) => Math.max(1, x(d.value) - margin.left))
        .attr("fill", (d, i) => d.color || api.color(i))
        .style("cursor", opts.onClick ? "pointer" : "default")
        .on("mousemove", (ev, d) => {
          tip.style("opacity", 1)
            .html("<strong>" + window.MopsosUI.esc(d.label) + "</strong><br>" + (opts.valueLabel || "Count") + ": " + d.value)
            .style("left", (ev.pageX + 12) + "px").style("top", (ev.pageY - 12) + "px");
        })
        .on("mouseleave", () => tip.style("opacity", 0))
        .on("click", (ev, d) => { if (opts.onClick) opts.onClick(d); });

      root.append("g").selectAll("text.val").data(data).join("text")
        .attr("class", "val")
        .attr("x", (d) => x(d.value) + 6).attr("y", (d) => y(d.label) + y.bandwidth() / 2)
        .attr("dominant-baseline", "central").attr("font-size", 10).attr("fill", "#475569")
        .text((d) => opts.valueFormat ? opts.valueFormat(d.value) : d.value);
    },

    /**
     * Grouped bar chart from a 2D matrix.
     *   matrix    : number[rows][cols]
     *   rowLabels : group labels (one per row)
     *   colLabels : series labels (one per column)
     */
    groupedBars(container, matrix, rowLabels, colLabels, opts) {
      opts = opts || {};
      const el = clear(container);
      if (!el) return;
      if (!d3ok()) return empty(el, "D3 not loaded.");
      if (!matrix || !matrix.length || !colLabels || !colLabels.length) return empty(el, opts.emptyMsg);

      const d3 = window.d3;
      const width = 820;
      const margin = { top: 14, right: 14, bottom: 70, left: 48 };
      const height = 380;
      const root = svg(el, width, height);

      const x0 = d3.scaleBand().domain(rowLabels).range([margin.left, width - margin.right]).paddingInner(0.2);
      const x1 = d3.scaleBand().domain(colLabels).range([0, x0.bandwidth()]).padding(0.06);
      const maxV = d3.max(matrix, (row) => d3.max(row)) || 1;
      const y = d3.scaleLinear().domain([0, maxV]).nice().range([height - margin.bottom, margin.top]);
      const tip = tooltip();

      root.append("g").attr("transform", "translate(0," + (height - margin.bottom) + ")")
        .call(d3.axisBottom(x0)).selectAll("text")
        .attr("transform", "rotate(-35)").style("text-anchor", "end").attr("font-size", 10);
      root.append("g").attr("transform", "translate(" + margin.left + ",0)").call(d3.axisLeft(y).ticks(6));

      const groups = root.append("g").selectAll("g").data(matrix).join("g")
        .attr("transform", (d, i) => "translate(" + x0(rowLabels[i]) + ",0)");
      groups.selectAll("rect").data((row, ri) => row.map((v, ci) => ({ v, ci, ri }))).join("rect")
        .attr("x", (d) => x1(colLabels[d.ci])).attr("y", (d) => y(d.v))
        .attr("width", x1.bandwidth()).attr("height", (d) => y(0) - y(d.v))
        .attr("rx", 2).attr("fill", (d) => api.color(d.ci))
        .on("mousemove", (ev, d) => {
          tip.style("opacity", 1)
            .html("<strong>" + window.MopsosUI.esc(rowLabels[d.ri]) + " · " + window.MopsosUI.esc(colLabels[d.ci]) + "</strong><br>" + (opts.valueLabel || "Value") + ": " + d.v)
            .style("left", (ev.pageX + 12) + "px").style("top", (ev.pageY - 12) + "px");
        })
        .on("mouseleave", () => tip.style("opacity", 0));

      // legend
      const lg = root.append("g").attr("transform", "translate(" + (margin.left) + "," + (height - 18) + ")");
      let lx = 0;
      colLabels.forEach((c, i) => {
        const g = lg.append("g").attr("transform", "translate(" + lx + ",0)");
        g.append("rect").attr("width", 11).attr("height", 11).attr("rx", 2).attr("fill", api.color(i));
        const txt = g.append("text").attr("x", 15).attr("y", 10).attr("font-size", 10).attr("fill", "#475569").text(c);
        lx += 28 + (c.length * 6.4);
        if (lx > width - margin.right - 40) { /* leave it; rare overflow */ }
        void txt;
      });
    },

    /**
     * Stacked bar chart from a 2D matrix (rows stacked across columns).
     */
    stackedBars(container, matrix, rowLabels, colLabels, opts) {
      opts = opts || {};
      const el = clear(container);
      if (!el) return;
      if (!d3ok()) return empty(el, "D3 not loaded.");
      if (!matrix || !matrix.length || !colLabels || !colLabels.length) return empty(el, opts.emptyMsg);

      const d3 = window.d3;
      const data = matrix.map((row, i) => {
        const o = { _label: rowLabels[i] };
        colLabels.forEach((c, j) => { o[c] = row[j] || 0; });
        return o;
      });
      const width = 820;
      const margin = { top: 34, right: 14, bottom: 70, left: 48 };
      const height = 380;
      const root = svg(el, width, height);
      const series = d3.stack().keys(colLabels)(data);

      // legend: name every stacked color (top-left, above the plot)
      const lg = root.append("g").attr("transform", "translate(" + margin.left + ",6)");
      let lx = 0;
      colLabels.forEach((c, i) => {
        const g = lg.append("g").attr("transform", "translate(" + lx + ",0)");
        g.append("rect").attr("width", 11).attr("height", 11).attr("rx", 2).attr("fill", api.color(i));
        g.append("text").attr("x", 15).attr("y", 10).attr("font-size", 10).attr("fill", "#475569").text(c);
        lx += 28 + (String(c).length * 6.4);
      });

      const x = d3.scaleBand().domain(rowLabels).range([margin.left, width - margin.right]).padding(0.2);
      const maxV = d3.max(series, (s) => d3.max(s, (d) => d[1])) || 1;
      const y = d3.scaleLinear().domain([0, maxV]).nice().range([height - margin.bottom, margin.top]);
      const tip = tooltip();

      root.append("g").attr("transform", "translate(0," + (height - margin.bottom) + ")")
        .call(d3.axisBottom(x)).selectAll("text")
        .attr("transform", "rotate(-35)").style("text-anchor", "end").attr("font-size", 10);
      root.append("g").attr("transform", "translate(" + margin.left + ",0)").call(d3.axisLeft(y).ticks(6));

      root.append("g").selectAll("g").data(series).join("g")
        .attr("fill", (d, i) => api.color(i))
        .selectAll("rect").data((d) => d.map((seg) => ({ seg, key: d.key }))).join("rect")
        .attr("x", (d) => x(d.seg.data._label)).attr("y", (d) => y(d.seg[1]))
        .attr("height", (d) => Math.max(0, y(d.seg[0]) - y(d.seg[1])))
        .attr("width", x.bandwidth())
        .on("mousemove", (ev, d) => {
          tip.style("opacity", 1)
            .html("<strong>" + window.MopsosUI.esc(d.seg.data._label) + " · " + window.MopsosUI.esc(d.key) + "</strong><br>" + (d.seg[1] - d.seg[0]))
            .style("left", (ev.pageX + 12) + "px").style("top", (ev.pageY - 12) + "px");
        })
        .on("mouseleave", () => tip.style("opacity", 0));
    },

    /**
     * Heatmap from a 2D matrix.
     */
    heatmap(container, matrix, rowLabels, colLabels, opts) {
      opts = opts || {};
      const el = clear(container);
      if (!el) return;
      if (!d3ok()) return empty(el, "D3 not loaded.");
      if (!matrix || !matrix.length || !matrix[0] || !matrix[0].length) return empty(el, opts.emptyMsg);

      const d3 = window.d3;
      const nR = matrix.length, nC = matrix[0].length;
      const cell = Math.max(16, Math.min(46, Math.floor(680 / Math.max(nR, nC))));
      const margin = { top: 90, right: 16, bottom: 16, left: Math.min(160, 12 + d3.max(rowLabels, (l) => String(l).length) * 7) };
      const width = margin.left + nC * cell + margin.right;
      const height = margin.top + nR * cell + margin.bottom;
      const root = svg(el, width, height);

      const flat = matrix.flat().filter(Number.isFinite);
      const lo = opts.min !== undefined ? opts.min : d3.min(flat);
      const hi = opts.max !== undefined ? opts.max : d3.max(flat);
      const colorScale = d3.scaleSequential(opts.interpolator || d3.interpolateViridis).domain([lo, hi]);
      const tip = tooltip();

      const x = (c) => margin.left + c * cell;
      const y = (r) => margin.top + r * cell;

      for (let r = 0; r < nR; r++) {
        for (let c = 0; c < nC; c++) {
          const v = matrix[r][c];
          root.append("rect")
            .attr("x", x(c)).attr("y", y(r)).attr("width", cell - 1).attr("height", cell - 1).attr("rx", 2)
            .attr("fill", Number.isFinite(v) ? colorScale(v) : "#e5e7eb")
            .on("mousemove", (ev) => {
              tip.style("opacity", 1)
                .html("<strong>" + window.MopsosUI.esc(rowLabels[r]) + " × " + window.MopsosUI.esc(colLabels[c]) + "</strong><br>" + (opts.valueLabel || "Value") + ": " + (Number.isFinite(v) ? (opts.valueFormat ? opts.valueFormat(v) : v) : "–"))
                .style("left", (ev.pageX + 12) + "px").style("top", (ev.pageY - 12) + "px");
            })
            .on("mouseleave", () => tip.style("opacity", 0));
          if (opts.showValues && Number.isFinite(v) && cell >= 30) {
            root.append("text").attr("x", x(c) + cell / 2).attr("y", y(r) + cell / 2)
              .attr("text-anchor", "middle").attr("dominant-baseline", "central")
              .attr("font-size", 8.5).attr("fill", "#fff").attr("pointer-events", "none")
              .text(opts.valueFormat ? opts.valueFormat(v) : v);
          }
        }
      }
      // column labels (rotated)
      colLabels.forEach((c, i) => {
        root.append("text").attr("x", x(i) + cell / 2).attr("y", margin.top - 8)
          .attr("text-anchor", "start").attr("font-size", 10).attr("fill", "#374151")
          .attr("transform", "rotate(-45," + (x(i) + cell / 2) + "," + (margin.top - 8) + ")")
          .text(String(c).length > 16 ? String(c).slice(0, 15) + "…" : c);
      });
      // row labels
      rowLabels.forEach((r, i) => {
        root.append("text").attr("x", margin.left - 6).attr("y", y(i) + cell / 2)
          .attr("text-anchor", "end").attr("dominant-baseline", "central").attr("font-size", 10).attr("fill", "#374151")
          .text(String(r).length > 22 ? String(r).slice(0, 21) + "…" : r);
      });
    },

    /**
     * Scatter plot.
     *   points : [{ x, y, label?, group? }]
     */
    scatter(container, points, opts) {
      opts = opts || {};
      const el = clear(container);
      if (!el) return;
      if (!d3ok()) return empty(el, "D3 not loaded.");
      points = (points || []).filter((p) => p && Number.isFinite(+p.x) && Number.isFinite(+p.y));
      if (!points.length) return empty(el, opts.emptyMsg);

      const d3 = window.d3;
      const width = 760, height = 440, margin = { top: 16, right: 16, bottom: 36, left: 40 };
      const root = svg(el, width, height);
      const x = d3.scaleLinear().domain(d3.extent(points, (d) => d.x)).nice().range([margin.left, width - margin.right]);
      const y = d3.scaleLinear().domain(d3.extent(points, (d) => d.y)).nice().range([height - margin.bottom, margin.top]);
      const tip = tooltip();

      root.append("g").attr("transform", "translate(0," + (height - margin.bottom) + ")").call(d3.axisBottom(x).ticks(6));
      root.append("g").attr("transform", "translate(" + margin.left + ",0)").call(d3.axisLeft(y).ticks(6));

      root.append("g").selectAll("circle").data(points).join("circle")
        .attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y)).attr("r", opts.radius || 6)
        .attr("fill", (d) => Number.isFinite(d.group) ? api.color(d.group) : (d.color || api.color(0)))
        .attr("opacity", 0.9).attr("stroke", "#fff").attr("stroke-width", 1)
        .on("mousemove", (ev, d) => {
          tip.style("opacity", 1)
            .html("<strong>" + window.MopsosUI.esc(d.label || "") + "</strong><br>x: " + (+d.x).toFixed(3) + "<br>y: " + (+d.y).toFixed(3))
            .style("left", (ev.pageX + 12) + "px").style("top", (ev.pageY - 12) + "px");
        })
        .on("mouseleave", () => tip.style("opacity", 0));

      if (opts.labels !== false) {
        root.append("g").selectAll("text").data(points).join("text")
          .attr("x", (d) => x(d.x) + 8).attr("y", (d) => y(d.y) - 6)
          .attr("font-size", 9).attr("fill", "#334155")
          .text((d) => d.label || "");
      }
    },

    /**
     * Histogram of raw numeric values.
     */
    histogram(container, values, opts) {
      opts = opts || {};
      const el = clear(container);
      if (!el) return;
      if (!d3ok()) return empty(el, "D3 not loaded.");
      values = (values || []).map(Number).filter(Number.isFinite);
      if (!values.length) return empty(el, opts.emptyMsg);

      const d3 = window.d3;
      const width = 760, height = 320, margin = { top: 14, right: 14, bottom: 36, left: 40 };
      const root = svg(el, width, height);
      const x = d3.scaleLinear().domain(opts.domain || d3.extent(values)).nice().range([margin.left, width - margin.right]);
      const bins = d3.bin().domain(x.domain()).thresholds(opts.bins || 20)(values);
      const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.length) || 1]).nice().range([height - margin.bottom, margin.top]);
      const tip = tooltip();

      root.append("g").attr("transform", "translate(0," + (height - margin.bottom) + ")").call(d3.axisBottom(x).ticks(8));
      root.append("g").attr("transform", "translate(" + margin.left + ",0)").call(d3.axisLeft(y).ticks(6));

      root.append("g").selectAll("rect").data(bins).join("rect")
        .attr("x", (d) => x(d.x0) + 1).attr("y", (d) => y(d.length))
        .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1))
        .attr("height", (d) => y(0) - y(d.length))
        .attr("fill", opts.color || api.color(0)).attr("rx", 2)
        .on("mousemove", (ev, d) => {
          tip.style("opacity", 1)
            .html("<strong>" + (+d.x0).toFixed(2) + " – " + (+d.x1).toFixed(2) + "</strong><br>Count: " + d.length)
            .style("left", (ev.pageX + 12) + "px").style("top", (ev.pageY - 12) + "px");
        })
        .on("mouseleave", () => tip.style("opacity", 0));
    },

    /**
     * Force-directed network.
     *   nodes : [{ id, label?, group? }]
     *   links : [{ source, target, weight? }]   (source/target are node ids)
     */
    network(container, nodes, links, opts) {
      opts = opts || {};
      const el = clear(container);
      if (!el) return;
      if (!d3ok()) return empty(el, "D3 not loaded.");
      if (!nodes || !nodes.length) return empty(el, opts.emptyMsg);

      const d3 = window.d3;
      const n = nodes.length;
      const width = 900, height = 620;
      const root = svg(el, width, height);
      const svgEl = root.node();
      const N = nodes.map((nd) => Object.assign({}, nd));
      const L = (links || []).map((l) => Object.assign({}, l));
      const tip = tooltip();

      // spread larger graphs more so labels don't overlap
      const charge = opts.charge || -(170 + n * 6);
      const dist = (opts.linkDistance || 70) + Math.min(60, n);
      const sim = d3.forceSimulation(N)
        .force("link", d3.forceLink(L).id((d) => d.id).distance(dist).strength((l) => Math.min(1, (l.weight || 0.5))))
        .force("charge", d3.forceManyBody().strength(charge))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(16));

      const link = root.append("g").attr("stroke", "#cbd5e1").selectAll("line").data(L).join("line")
        .attr("stroke-width", (d) => 1 + (d.weight || 0) * 3).attr("stroke-opacity", (d) => Math.max(0.2, d.weight || 0.4));

      const node = root.append("g").selectAll("g").data(N).join("g").style("cursor", "grab");
      node.append("circle").attr("r", (d) => d.r || opts.radius || 9)
        .attr("fill", (d) => Number.isFinite(d.group) ? api.color(d.group) : api.color(0))
        .attr("stroke", "#fff").attr("stroke-width", 1.5)
        .on("mousemove", (ev, d) => {
          tip.style("opacity", 1).html("<strong>" + window.MopsosUI.esc(d.label || d.id) + "</strong>")
            .style("left", (ev.pageX + 12) + "px").style("top", (ev.pageY - 12) + "px");
        })
        .on("mouseleave", () => tip.style("opacity", 0));
      node.append("text").attr("x", 12).attr("y", 4).attr("font-size", 10).attr("fill", "#334155")
        .text((d) => d.label || d.id);

      // Reframe the viewBox around all nodes (+ their labels) so the whole graph is visible at once.
      function fit() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        N.forEach((d) => {
          const r = d.r || opts.radius || 9;
          const lw = String(d.label || d.id || "").length * 6.6 + 16;
          if (d.x - r < minX) minX = d.x - r;
          if (d.y - r - 8 < minY) minY = d.y - r - 8;
          if (d.x + r + lw > maxX) maxX = d.x + r + lw;
          if (d.y + r + 8 > maxY) maxY = d.y + r + 8;
        });
        if (!isFinite(minX)) return;
        const pad = 18;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        svgEl.setAttribute("viewBox", minX + " " + minY + " " + Math.max(1, maxX - minX) + " " + Math.max(1, maxY - minY));
      }

      node.call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; fit(); }));

      sim.on("tick", () => {
        link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
        node.attr("transform", (d) => "translate(" + d.x + "," + d.y + ")");
      });
      sim.on("end", fit);
      // fallback in case the simulation runs long: fit once it has cooled
      setTimeout(fit, 1500);
    }
  };


  /* --------------------------------------------------------------------------
   * Automatic figure annotation: every chart accepts opts.title, opts.xLabel
   * and opts.yLabel and draws them INSIDE the SVG, so a downloaded PNG/SVG is
   * self-describing. Pages compose the title from the very options the user
   * chose (view, scope, filters). Sensible defaults: horizontal bar charts and
   * histograms caption their value axis with opts.valueLabel when no explicit
   * xLabel is given.
   * ------------------------------------------------------------------------ */
  function annotate(container, opts, kind) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el || !opts) return;
    let xLabel = opts.xLabel, yLabel = opts.yLabel;
    if (!xLabel && (kind === "bars" || kind === "histogram") && opts.valueLabel) xLabel = opts.valueLabel;
    if (!opts.title && !xLabel && !yLabel) return;
    const node = el.querySelector("svg.d3-svg");
    if (!node) return;
    const vb = (node.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    if (vb.length < 4) return;
    const w = vb[2], h = vb[3];
    const padTop = opts.title ? 28 : 0;
    const padBottom = xLabel ? 22 : 0;
    const padLeft = yLabel ? 18 : 0;
    const NS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(NS, "g");
    while (node.firstChild) g.appendChild(node.firstChild);
    if (padTop || padLeft) g.setAttribute("transform", "translate(" + padLeft + "," + padTop + ")");
    node.appendChild(g);
    node.setAttribute("viewBox", "0 0 " + (w + padLeft) + " " + (h + padTop + padBottom));
    const put = (txt, attrs) => {
      const t = document.createElementNS(NS, "text");
      t.textContent = txt;
      Object.keys(attrs).forEach((k) => t.setAttribute(k, attrs[k]));
      node.appendChild(t);
    };
    if (opts.title) put(opts.title, { x: (w + padLeft) / 2, y: 17, "text-anchor": "middle", "font-size": 12.5, "font-weight": 600, fill: "#1f2937" });
    if (xLabel) put(xLabel, { x: padLeft + w / 2, y: padTop + h + 15, "text-anchor": "middle", "font-size": 10.5, fill: "#475569" });
    if (yLabel) put(yLabel, { x: 12, y: padTop + h / 2, "text-anchor": "middle", "font-size": 10.5, fill: "#475569",
      transform: "rotate(-90 12 " + (padTop + h / 2) + ")" });
  }
  ["bars", "groupedBars", "stackedBars", "heatmap", "histogram"].forEach((fn) => {
    const orig = api[fn];
    if (!orig) return;
    api[fn] = function (container) {
      orig.apply(this, arguments);
      const opts = arguments[arguments.length - 1];
      if (opts && typeof opts === "object" && !Array.isArray(opts)) annotate(container, opts, fn === "bars" || fn === "histogram" ? (fn === "bars" ? "bars" : "histogram") : fn);
    };
  });

  window.MopsosChart = api;
})();
