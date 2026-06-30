/* ============================================================================
 *  MOPSOS SHARED FOUNDATION
 *  Three globals used by every analysis tab:
 *    - window.MopsosSQL   : one in-browser SQLite database over the corpus
 *    - window.MopsosUI    : label dictionaries, pagination, info buttons, tables
 *    - window.MopsosChart : D3 chart helpers (bars / grouped / stacked / heatmap
 *                           / scatter / histogram / force-network)
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
        if (res.ok) return await res.arrayBuffer();
        lastErr = new Error("HTTP " + res.status + " @ " + candidate);
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
  const IDB_NAME = "mopsos", IDB_STORE = "corpus", IDB_KEY = "corpus.sqlite.v3";
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

  /** Open the pre-built SQLite database, fetching + decompressing only once. */
  async function loadPrebuilt() {
    let raw = null;
    // TODO -- while under development, do not cache database
    // try { raw = await idbGet(IDB_KEY); } catch (e) { /* cache unavailable */ }
    // if (!raw) {
      const gz = await fetchArrayBuffer(PREBUILT);
      raw = await gunzip(gz);
    //   try { await idbSet(IDB_KEY, raw); } catch (e) { /* private mode / quota — fine */ }
    // }
    // TODO
    if (db) db.close();
    db = new SQL.Database(new Uint8Array(raw));
    const ti = db.exec("PRAGMA table_info(" + quoteId(CONFIG.table) + ");");
    columns = (ti && ti.length) ? ti[0].values.map((r) => r[1]) : [];
    const rc = db.exec("SELECT COUNT(*) FROM " + quoteId(CONFIG.table) + ";");
    rowCount = (rc && rc.length) ? rc[0].values[0][0] : 0;
    if (!columns.length) throw new Error("prebuilt DB missing table " + CONFIG.table);
  }

  async function init() {
    await ensureSqlModule();
    try {
      await loadPrebuilt();
    } catch (err) {
      alert("Unable to build database");
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
    degree: { p: "Positive", c: "Comparative", s: "Superlative" }
  };

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const api = {
    LABELS,
    esc,

    /** Human label for a (field,value) morphology code; falls back to raw value. */
    label(field, value) {
      const norm = String(value == null ? "" : value).trim();
      const dict = LABELS[field];
      if (dict && dict[norm.toLowerCase()]) return dict[norm.toLowerCase()];
      return norm;
    },

    /** Friendly title-case for a column/field name. */
    fieldTitle(name) {
      return String(name || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

      const draw = () => {
        const total = values.length;
        const start = state.showAll ? 0 : state.page * pageSize;
        const end = state.showAll ? total : Math.min(total, start + pageSize);
        const slice = values.slice(start, end);

        let html = "";
        if (paginate) {
          const pages = Math.max(1, Math.ceil(total / pageSize));
          html += '<div class="pager">';
          html += '<span class="pager-info">' +
            (state.showAll
              ? "Showing all " + total + " rows"
              : "Rows " + (start + 1) + "–" + end + " of " + total + " · page " + (state.page + 1) + " / " + pages) +
            "</span>";
          html += '<span class="pager-controls">';
          html += '<button class="btn btn-sm" data-act="first"' + ((state.showAll || state.page === 0) ? " disabled" : "") + ">« First</button>";
          html += '<button class="btn btn-sm" data-act="prev"' + ((state.showAll || state.page === 0) ? " disabled" : "") + ">‹ Prev</button>";
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

        if (paginate) {
          const pages = Math.max(1, Math.ceil(total / pageSize));
          container.querySelectorAll("[data-act]").forEach((b) => {
            b.addEventListener("click", () => {
              const act = b.dataset.act;
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
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { api.wireInfoButtons(); api.wireAdvancedToggles(); api.wireNavDropdown(); });
  } else {
    api.wireInfoButtons(); api.wireAdvancedToggles(); api.wireNavDropdown();
  }

  window.MopsosUI = api;
})();


/* ----------------------------------------------------------------------------
 *  MopsosChart — D3 chart helpers. Every function clears its container, is
 *  responsive (viewBox), guards empty input, and shares one tooltip element.
 * ------------------------------------------------------------------------- */
(function () {
  const PALETTE = ["#4f46e5", "#0ea5e9", "#06b6d4", "#10b981", "#22c55e", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#a16207"];

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
      .style("height", "auto");
    addDownloadToolbar(el);
    return sel;
  }

  const api = {
    PALETTE,
    color(i) { return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]; },

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
        .attr("font-size", 12).attr("fill", "#374151")
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
        .attr("dominant-baseline", "central").attr("font-size", 11).attr("fill", "#475569")
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
        .attr("transform", "rotate(-35)").style("text-anchor", "end").attr("font-size", 11);
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
        const txt = g.append("text").attr("x", 15).attr("y", 10).attr("font-size", 11).attr("fill", "#475569").text(c);
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
      const margin = { top: 14, right: 14, bottom: 70, left: 48 };
      const height = 380;
      const root = svg(el, width, height);
      const series = d3.stack().keys(colLabels)(data);

      const x = d3.scaleBand().domain(rowLabels).range([margin.left, width - margin.right]).padding(0.2);
      const maxV = d3.max(series, (s) => d3.max(s, (d) => d[1])) || 1;
      const y = d3.scaleLinear().domain([0, maxV]).nice().range([height - margin.bottom, margin.top]);
      const tip = tooltip();

      root.append("g").attr("transform", "translate(0," + (height - margin.bottom) + ")")
        .call(d3.axisBottom(x)).selectAll("text")
        .attr("transform", "rotate(-35)").style("text-anchor", "end").attr("font-size", 11);
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
                .html("<strong>" + window.MopsosUI.esc(rowLabels[r]) + " × " + window.MopsosUI.esc(colLabels[c]) + "</strong><br>" + (opts.valueLabel || "Value") + ": " + (Number.isFinite(v) ? (opts.valueFormat ? opts.valueFormat(v) : v) : "—"))
                .style("left", (ev.pageX + 12) + "px").style("top", (ev.pageY - 12) + "px");
            })
            .on("mouseleave", () => tip.style("opacity", 0));
          if (opts.showValues && Number.isFinite(v) && cell >= 30) {
            root.append("text").attr("x", x(c) + cell / 2).attr("y", y(r) + cell / 2)
              .attr("text-anchor", "middle").attr("dominant-baseline", "central")
              .attr("font-size", 9).attr("fill", "#fff").attr("pointer-events", "none")
              .text(opts.valueFormat ? opts.valueFormat(v) : v);
          }
        }
      }
      // column labels (rotated)
      colLabels.forEach((c, i) => {
        root.append("text").attr("x", x(i) + cell / 2).attr("y", margin.top - 8)
          .attr("text-anchor", "start").attr("font-size", 11).attr("fill", "#374151")
          .attr("transform", "rotate(-45," + (x(i) + cell / 2) + "," + (margin.top - 8) + ")")
          .text(String(c).length > 16 ? String(c).slice(0, 15) + "…" : c);
      });
      // row labels
      rowLabels.forEach((r, i) => {
        root.append("text").attr("x", margin.left - 6).attr("y", y(i) + cell / 2)
          .attr("text-anchor", "end").attr("dominant-baseline", "central").attr("font-size", 11).attr("fill", "#374151")
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
          .attr("font-size", 10).attr("fill", "#334155")
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
      node.append("text").attr("x", 12).attr("y", 4).attr("font-size", 11).attr("fill", "#334155")
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

  window.MopsosChart = api;
})();
