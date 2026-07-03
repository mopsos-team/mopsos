/* ============================================================================
 *  MORPHOLOGY TAB
 *  Runs against the shared in-browser SQLite database (window.MopsosSQL).
 *  Surfaces:
 *    1. Quick filter — part-of-speech-aware drop-downs build the SAME query
 *       that the read-only SQL console edits. There is ONE query and ONE table
 *       (#qfResults). Paging is done in SQL (LIMIT/OFFSET): each page is a
 *       fresh query, so only ~13 rows are ever held in the DOM.
 *    2. Explore & visualize — general SQL-driven counts drawn with D3
 *       (bar chart, or heat-map when a second dimension is chosen).
 * ========================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const TABLE = "morphology";
  const SQL = window.MopsosSQL;
  const UI = window.MopsosUI;
  const Chart = window.MopsosChart;
  const q = SQL.quoteId;
  const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

  // Feature columns, and which we show by default when no POS is chosen.
  const FEATURE_COLS = ["number", "case", "gender", "tense", "mood", "voice", "person", "degree"];
  const DEFAULT_FEATURES = ["number", "case", "gender", "tense", "mood"];
  // Columns the dropdown query selects (when present in the table).
  const PREVIEW_COLS = ["author", "work", "book", "verse", "form", "lemma", "pos", "person",
    "number", "tense", "mood", "voice", "gender", "case", "degree", "metrical_shape"];
  // Dimensions offered in the explorer.
  const DIMENSIONS = [
    ["work", "Book / work"], ["author", "Author"], ["lemma", "Lemma"], ["form", "Word form"],
    ["pos", "Part of speech"], ["number", "Number"], ["case", "Case"], ["gender", "Gender"],
    ["tense", "Tense"], ["mood", "Mood"], ["voice", "Voice"], ["person", "Person"], ["degree", "Degree"]
  ];

  const whereOf = (filters) => {
    const p = [];
    for (const k in filters) if (filters[k]) p.push(q(k) + " = " + sqlStr(filters[k]));
    return p.join(" AND ");
  };
  const naGuard = (c) => q(c) + " IS NOT NULL AND " + q(c) + " NOT IN ('','-')";
  const displayName = (field, code) => (UI.LABELS[field] ? UI.label(field, code) : String(code));

  // Quote an identifier only when it needs it, for legible generated SQL.
  const RESERVED = new Set(["case", "order", "group", "by", "select", "from", "where",
    "table", "index", "default", "check", "references", "limit", "offset", "having",
    "join", "on", "in", "is", "not", "null", "and", "or", "as", "distinct", "values",
    "primary", "foreign", "unique", "collate", "union", "desc", "asc", "between", "like"]);
  const niceId = (c) => (/^[a-z_][a-z0-9_]*$/i.test(c) && !RESERVED.has(String(c).toLowerCase())) ? c : q(c);

  /* ----- Quick filter ----------------------------------------------------- */

  let qf = null;
  let manualSql = false;            // true once the user hand-edits the SQL; dropdowns then disabled
  const PAGE_SIZE = 13;

  // Disable/enable the dropdown query-builder when the SQL is taken over by hand.
  // The quick-filter Reset button is deliberately left enabled — it is how the
  // user gets back out of manual mode.
  function setQuickControlsEnabled(on) {
    const g = $("qfGroup");
    if (g) g.querySelectorAll("select, input").forEach((c) => { c.disabled = !on; });
    if ($("btnApplyFilter")) $("btnApplyFilter").disabled = !on;
  }

  function enterManualMode() {
    if (manualSql) return;
    manualSql = true;
    setQuickControlsEnabled(false);
  }

  // No persistence: nothing is written to localStorage / cookies. State lives
  // only for the current page view and is gone on refresh, by design.

  // Build the dropdown query — nicely formatted, and WITHOUT a row cap (paging
  // adds LIMIT/OFFSET). This text is what lands in the editor and is executed.
  function buildQuickSql(filters) {
    const cols = PREVIEW_COLS.filter((c) => SQL.columns().includes(c));
    let sql = "SELECT " + cols.map(niceId).join(", ") + "\nFROM " + niceId(TABLE);
    const conds = ["match_status <> \"CONFLICT_NO_MATCH\""];
    for (const k in filters) if (filters[k]) conds.push(niceId(k) + " = " + sqlStr(filters[k]));
    if (conds.length) sql += "\nWHERE " + conds.join("\n  AND ");
    sql += "\nORDER BY " + niceId("work") + ", " + "book, verse";
    sql += "\nLIMIT " + PAGE_SIZE + " OFFSET 0;";
    return sql;
  }

  // The dropdowns ARE the query: regenerate it, mirror into the editor, run it.
  function applyQuickFilter() {
    $("qfSqlInput").value = buildQuickSql(qf.read());
    runCustomSql();
  }

  /* ----- Result table + LIMIT/OFFSET paging on the single query ----------- */

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

  // Render the result: same columns and rows the query returns, with coded
  // values shown as human-readable labels (e.g. 'g' -> 'Genitive').
  function renderTable(columns, values) {
    if (!columns.length || !values.length) {
      return '<div class="small-muted" style="padding:.7rem;">No rows.</div>';
    }
    let html = '<div class="table-wrap"><table class="preview"><thead><tr>';
    for (const c of columns) html += "<th>" + UI.esc(UI.fieldTitle(c)) + "</th>";
    html += "</tr></thead><tbody>";
    for (const row of values) {
      html += "<tr>";
      row.forEach((v, i) => { html += "<td>" + (v == null ? "" : UI.esc(displayName(columns[i], v))) + "</td>"; });
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  // Runs whatever is in the editor, exactly as written, into #qfResults.
  // If the query ends in LIMIT/OFFSET, Prev/Next rewrite the OFFSET in the
  // editor and re-run — so the query shown is always the query that ran.
  function runCustomSql() {
    const sql = $("qfSqlInput").value;
    const status = $("qfSqlStatus");
    if (!SQL.isReadOnly(sql)) {
      status.textContent = "Read-only: only SELECT / WITH / EXPLAIN / PRAGMA are allowed.";
      return;
    }
    let res;
    try {
      res = SQL.query(sql);
    } catch (e) {
      status.textContent = "SQL error: " + e.message;
      $("qfResults").innerHTML = '<div class="small-muted" style="padding:.7rem;">Query error: ' + UI.esc(e.message) + "</div>";
      return;
    }
    const columns = res.columns || [], values = res.values || [];
    const lo = readLimitOffset(sql);

    let html = "";
    if (lo) {
      const dis = (cond) => cond ? " disabled" : "";
      html += '<div class="pager"><span class="pager-controls">';
      html += '<button class="btn btn-sm" data-act="prev"' + dis(lo.offset === 0) + ">\u2039 Prev</button>";
      html += '<button class="btn btn-sm" data-act="next"' + dis(values.length < lo.limit) + ">Next \u203a</button>";
      html += "</span></div>";
    }
    html += renderTable(columns, values);
    const container = $("qfResults");
    container.innerHTML = html;

    if (lo) container.querySelectorAll("[data-act]").forEach((b) => {
      b.addEventListener("click", () => {
        const off = b.dataset.act === "next" ? lo.offset + lo.limit : Math.max(0, lo.offset - lo.limit);
        $("qfSqlInput").value = setOffset(sql, off);
        runCustomSql();
      });
    });

    status.textContent = "OK: " + values.length + " row" + (values.length === 1 ? "" : "s") + ".";
  }

  function wireCustomSql() {
    $("qfSqlRun").addEventListener("click", runCustomSql);
    // A manual edit hands ownership of the query to the textarea; lock the dropdowns.
    $("qfSqlInput").addEventListener("input", enterManualMode);
  }

  /* ----- Explore & visualize --------------------------------------------- */

  let ex = null;

  function explorerFilters() {
    const all = Object.assign({}, ex.read());
    const wk = $("exLimitWork").value; if (wk) all.work = wk;
    const au = $("exLimitAuthor").value; if (au) all.author = au;
    return all;
  }
  function filterTextOf(filters) {
    const keys = Object.keys(filters);
    return keys.length
      ? " (filtered: " + keys.map((k) => UI.fieldTitle(k) + "=" + displayName(k, filters[k])).join(", ") + ")"
      : "";
  }

  function syncExplorerControls() {
    const type = $("exChartType").value;
    const cross = (type === "heatmap" || type === "grouped" || type === "proportion");
    $("exDim1Wrap").hidden = (type === "network" || type === "paradigm");
    $("exDim2Wrap").hidden = !cross;
    $("exLemmaWrap").hidden = (type !== "paradigm");
    $("exNodeUnitWrap").hidden = (type !== "network");
    $("exSemanticWrap").hidden = (type !== "network");
  }

  function buildNetworkFrom(ids, freqMap, w, unit, titleMain, descPrefix) {
    const chart = $("exChart"), title = $("exTitle"), desc = $("exDesc");
    if (!ids || ids.length < 2) {
      chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Not enough words match to build a network.</div>';
      title.textContent = ""; desc.textContent = ""; return;
    }
    const inList = ids.map(sqlStr).join(", ");
    const coSql = "WITH f AS (SELECT sentence_id, " + q(unit) + " AS u FROM " + q(TABLE) +
      " WHERE " + naGuard(unit) + (w ? " AND " + w : "") + " AND " + q(unit) + " IN (" + inList + ")) " +
      "SELECT a.u AS s, b.u AS t, COUNT(*) AS w FROM f a JOIN f b " +
      "ON a.sentence_id = b.sentence_id AND a.u < b.u " +
      "GROUP BY s, t HAVING w >= 2 ORDER BY w DESC LIMIT 250;";
    const edges = SQL.objects(coSql);
    const maxC = Math.max.apply(null, ids.map((id) => freqMap[id] || 1));
    const maxW = edges.length ? Math.max.apply(null, edges.map((e) => e.w)) : 1;
    const nodes = ids.map((id) => ({ id: id, label: id, r: 6 + 14 * Math.sqrt((freqMap[id] || 1) / maxC) }));
    const links = edges.map((e) => ({ source: e.s, target: e.t, weight: e.w / maxW }));
    title.textContent = titleMain;
    desc.textContent = descPrefix + nodes.length + " words, " + links.length + " links (sharing a sentence ≥ 2×). Drag nodes to explore.";
    Chart.network(chart, nodes, links, { linkDistance: 80, charge: -230, emptyMsg: "No co-occurrences found." });
  }

  function drawNetwork() {
    const filters = explorerFilters();
    const w = whereOf(filters);
    const topN = parseInt($("exTopN").value, 10) || 20;
    const semQuery = ($("exSemantic").value || "").trim();
    const chart = $("exChart"), title = $("exTitle"), desc = $("exDesc");
    const filterText = filterTextOf(filters);

    try {
      if (semQuery && window.MopsosSemantics) {
        const unit = "lemma"; // the semantic model is lemma-based
        const proceed = () => {
          try {
            const res = window.MopsosSemantics.resolve(semQuery);
            if (!res.seeds.length) {
              chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No semantic match for \u201C' + UI.esc(semQuery) +
                '\u201D. Try a concept like blue, war, sea, fear, wine, or a Greek lemma.</div>';
              title.textContent = ""; desc.textContent = ""; return;
            }
            const assoc = window.MopsosSemantics.expand(res.seeds, Math.min(topN, 40));
            const ids = assoc.map((a) => a.lemma);
            const freqMap = {};
            const inList = ids.map(sqlStr).join(", ");
            SQL.objects("SELECT " + q(unit) + " AS k, COUNT(*) AS c FROM " + q(TABLE) +
              " WHERE " + q(unit) + " IN (" + inList + ")" + (w ? " AND " + w : "") + " GROUP BY k;")
              .forEach((r) => { freqMap[r.k] = r.c; });
            const srcLabel = res.source === "english" ? "\u201C" + semQuery + "\u201D"
              : "\u201C" + res.seeds[0] + "\u201D" + (res.source === "fuzzy" ? " (closest match)" : "");
            buildNetworkFrom(ids, freqMap, w, unit,
              "Words semantically associated with " + srcLabel,
              "Semantic neighbourhood" + filterText + ". ");
          } catch (e) {
            chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Semantic search error: ' + UI.esc(e.message) + "</div>";
          }
        };
        if (!window.MopsosSemantics.isBuilt()) {
          title.textContent = "Words semantically associated with \u201C" + UI.esc(semQuery) + "\u201D";
          desc.textContent = "Learning semantic associations from the corpus (one-time)\u2026";
          chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Loading the lexicon and building the semantic model\u2026</div>';
          window.MopsosSemantics.build().then(proceed).catch(proceed);
        } else {
          proceed();
        }
        return;
      }

      // frequency-based network (no semantic query)
      const unit = $("exNodeUnit").value;
      const nodeRows = SQL.objects("SELECT " + q(unit) + " AS k, COUNT(*) AS c FROM " + q(TABLE) +
        " WHERE " + naGuard(unit) + (w ? " AND " + w : "") +
        " GROUP BY k ORDER BY c DESC LIMIT " + Math.min(topN, 40) + ";");
      const ids = nodeRows.map((r) => r.k);
      const freqMap = {}; nodeRows.forEach((r) => { freqMap[r.k] = r.c; });
      buildNetworkFrom(ids, freqMap, w, unit,
        "Co-occurrence network of " + (unit === "lemma" ? "lemmata" : "word forms"),
        filterText ? "Filtered" + filterText + ". " : "");
    } catch (e) {
      chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Chart error: ' + UI.esc(e.message) + "</div>";
    }
  }

  function runExplorer() {
    const type = $("exChartType").value;
    if (type === "network") { drawNetwork(); return; }

    const filters = explorerFilters();
    const w = whereOf(filters);
    const dim1 = $("exDim1").value;
    const dim2 = $("exDim2").value;
    const topN = parseInt($("exTopN").value, 10) || 20;
    const title = $("exTitle");
    const desc = $("exDesc");
    const chart = $("exChart");
    const filterText = filterTextOf(filters);

    try {
      if (type === "heatmap" || type === "grouped" || type === "proportion") {
        const d2 = dim2 || dim1;
        const sql = "SELECT " + q(dim1) + " AS r, " + q(d2) + " AS c2, COUNT(*) AS c FROM " + q(TABLE) +
          " WHERE " + naGuard(dim1) + " AND " + naGuard(d2) + (w ? " AND " + w : "") +
          " GROUP BY r, c2;";
        const data = SQL.objects(sql);
        const rowTot = {}, colTot = {}, cell = {};
        for (const o of data) {
          rowTot[o.r] = (rowTot[o.r] || 0) + o.c;
          colTot[o.c2] = (colTot[o.c2] || 0) + o.c;
          cell[o.r + "\u0000" + o.c2] = o.c;
        }
        const colCap = type === "heatmap" ? 30 : (type === "grouped" ? 6 : 8);
        const rowCap = type === "heatmap" ? 30 : 12;
        const rowVals = Object.keys(rowTot).sort((a, b) => rowTot[b] - rowTot[a]).slice(0, Math.min(topN, rowCap));
        const colVals = Object.keys(colTot).sort((a, b) => colTot[b] - colTot[a]).slice(0, colCap);
        const matrix = rowVals.map((rv) => colVals.map((cv) => cell[rv + "\u0000" + cv] || 0));
        const rowLabels = rowVals.map((v) => displayName(dim1, v));
        const colLabels = colVals.map((v) => displayName(d2, v));

        if (type === "heatmap") {
          title.textContent = UI.fieldTitle(dim1) + " × " + UI.fieldTitle(d2);
          desc.textContent = "Token counts for each combination" + filterText + ". Darker = more frequent.";
          Chart.heatmap(chart, matrix, rowLabels, colLabels,
            { valueLabel: "tokens", showValues: rowVals.length <= 15 && colVals.length <= 15 });
        } else if (type === "grouped") {
          title.textContent = UI.fieldTitle(dim1) + " by " + UI.fieldTitle(d2);
          desc.textContent = "Token counts, grouped to compare " + UI.fieldTitle(d2) + " across each " + UI.fieldTitle(dim1) + filterText + ".";
          Chart.groupedBars(chart, matrix, rowLabels, colLabels, { valueLabel: "tokens", emptyMsg: "No tokens match." });
        } else {
          const pct = matrix.map((row) => {
            const s = row.reduce((a, b) => a + b, 0) || 1;
            return row.map((v) => +(100 * v / s).toFixed(1));
          });
          title.textContent = "Composition of " + UI.fieldTitle(dim1) + " by " + UI.fieldTitle(d2);
          desc.textContent = "Each bar is one " + UI.fieldTitle(dim1) + " value, split into the % share of each " + UI.fieldTitle(d2) + filterText + ".";
          Chart.stackedBars(chart, pct, rowLabels, colLabels, { valueLabel: "%", emptyMsg: "No tokens match." });
        }
      } else if (type === "paradigm") {
        const input = ($("exLemma").value || "").trim();
        if (!input) {
          chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Type a lemma above (e.g. \u03bd\u03b1\u1fe6\u03c2, \u03b8\u03b5\u03cc\u03c2, \u03bb\u1f7b\u03c9) to lay out its full paradigm: every attested form, organised by the inflectional properties that actually vary for it.</div>';
          title.textContent = ""; desc.textContent = ""; return;
        }
        const stripDiacritics = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        // resolve the lemma: exact match first, else accent-insensitive most-frequent
        let lemma = SQL.scalar("SELECT lemma FROM " + q(TABLE) + " WHERE lemma = " + sqlStr(input) + " LIMIT 1;");
        if (!lemma) {
          const ni = stripDiacritics(input);
          const cand = SQL.objects("SELECT lemma, COUNT(*) c FROM " + q(TABLE) + " WHERE lemma NOT IN ('','-') GROUP BY lemma;")
            .filter((r) => stripDiacritics(r.lemma) === ni).sort((a, b) => b.c - a.c);
          lemma = cand.length ? cand[0].lemma : null;
        }
        if (!lemma) {
          chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No lemma \u201c' + UI.esc(input) + '\u201d found in the corpus.</div>';
          title.textContent = ""; desc.textContent = ""; return;
        }
        const lw = q("lemma") + " = " + sqlStr(lemma) + (w ? " AND " + w : "");
        const FEATS = ["case", "number", "gender", "tense", "mood", "voice", "person", "degree"];
        const KEY = { "case": "c", number: "num", gender: "gen", tense: "tns", mood: "md", voice: "vc", person: "prs", degree: "deg" };
        const rows = SQL.objects("SELECT form, pos, \"case\" c, number num, gender gen, tense tns, mood md, voice vc, person prs, degree deg, COUNT(*) n FROM " + q(TABLE) +
          " WHERE " + lw + " GROUP BY form, pos, c, num, gen, tns, md, vc, prs, deg;");
        if (!rows.length) {
          chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No attested forms for \u201c' + UI.esc(lemma) + '\u201d in this scope.</div>';
          title.textContent = ""; desc.textContent = ""; return;
        }
        // tally which features actually occur, and how many distinct values each has
        const vals = {}; FEATS.forEach((f) => vals[f] = {});
        const posCnt = {}; let total = 0;
        rows.forEach((r) => {
          total += r.n; posCnt[r.pos] = (posCnt[r.pos] || 0) + r.n;
          FEATS.forEach((f) => { const v = r[KEY[f]]; if (v && v !== "-") vals[f][v] = (vals[f][v] || 0) + r.n; });
        });
        const pos = Object.keys(posCnt).sort((a, b) => posCnt[b] - posCnt[a])[0];
        const varying = FEATS.filter((f) => Object.keys(vals[f]).length >= 2);   // distinguishing dimensions
        const fixed = FEATS.filter((f) => Object.keys(vals[f]).length === 1);    // exist but constant
        const FORDER = { "case": ["n", "g", "d", "a", "v"], number: ["s", "d", "p"], gender: ["m", "f", "n"], tense: ["p", "i", "f", "a", "r", "l", "t"], mood: ["i", "s", "o", "m", "n", "p"], voice: ["a", "m", "p", "e"], person: ["1", "2", "3"], degree: ["p", "c", "s"] };
        const rank = (f, v) => { const i = (FORDER[f] || []).indexOf(v); return i < 0 ? 99 : i; };
        const sortedVals = (f) => Object.keys(vals[f]).sort((a, b) => rank(f, a) - rank(f, b) || (vals[f][b] - vals[f][a]));
        const formCell = (forms) => forms && forms.length
          ? forms.slice().sort((a, b) => b[1] - a[1]).map((x) => '<span class="pdg-form">' + UI.esc(x[0]) + '</span><span class="pdg-c">' + x[1] + "</span>").join("<br>")
          : '<span class="pdg-gap">\u2013</span>';

        const fixedTxt = fixed.map((f) => displayName(f, sortedVals(f)[0])).join(" \u00b7 ");
        title.textContent = "Paradigm of " + lemma;
        desc.textContent = displayName("pos", pos) + (fixedTxt ? " \u00b7 " + fixedTxt : "") + " \u00b7 " +
          total + " tokens, " + (new Set(rows.map((r) => r.form))).size + " distinct forms" + filterText + ".";

        let html = "";
        if (varying.length === 2) {
          const f1 = varying[0], f2 = varying[1];
          const cell = {}, other = [];
          rows.forEach((r) => {
            const a = r[KEY[f1]], b = r[KEY[f2]];
            if (a && a !== "-" && b && b !== "-") { const k = a + "\u0000" + b; (cell[k] = cell[k] || []).push([r.form, r.n]); }
            else other.push([r.form, r.n]);
          });
          html += '<table class="data-table paradigm-table"><thead><tr><th>' + UI.esc(UI.fieldTitle(f1)) + " \\ " + UI.esc(UI.fieldTitle(f2)) + "</th>";
          sortedVals(f2).forEach((cv) => { html += "<th>" + UI.esc(displayName(f2, cv)) + "</th>"; });
          html += "</tr></thead><tbody>";
          sortedVals(f1).forEach((rv) => {
            html += "<tr><th>" + UI.esc(displayName(f1, rv)) + "</th>";
            sortedVals(f2).forEach((cv) => { html += "<td>" + formCell(cell[rv + "\u0000" + cv]) + "</td>"; });
            html += "</tr>";
          });
          html += "</tbody></table>";
          if (other.length) html += '<p class="small-muted" style="margin-top:.45rem;">Other forms: ' +
            other.sort((a, b) => b[1] - a[1]).map((x) => '<span class="pdg-form">' + UI.esc(x[0]) + "</span>").join(", ") + "</p>";
        } else if (varying.length === 1) {
          const f1 = varying[0], cell = {};
          sortedVals(f1).forEach((v) => cell[v] = []);
          rows.forEach((r) => { const a = r[KEY[f1]]; if (a && a !== "-") cell[a].push([r.form, r.n]); });
          html += '<table class="data-table paradigm-table"><thead><tr><th>' + UI.esc(UI.fieldTitle(f1)) + "</th><th>Form(s)</th></tr></thead><tbody>";
          sortedVals(f1).forEach((v) => { html += "<tr><th>" + UI.esc(displayName(f1, v)) + "</th><td>" + formCell(cell[v]) + "</td></tr>"; });
          html += "</tbody></table>";
        } else if (varying.length === 0) {
          html += '<table class="data-table paradigm-table"><thead><tr><th>Form</th><th>Tokens</th></tr></thead><tbody>' +
            rows.slice().sort((a, b) => b.n - a.n).map((r) => '<tr><td><span class="pdg-form">' + UI.esc(r.form) + "</span></td><td>" + r.n + "</td></tr>").join("") + "</tbody></table>";
        } else {
          // three or more distinguishing dimensions (verbs, 3-termination adjectives): flat inventory
          html += '<table class="data-table paradigm-table"><thead><tr>';
          varying.forEach((f) => { html += "<th>" + UI.esc(UI.fieldTitle(f)) + "</th>"; });
          html += "<th>Form</th><th>Tokens</th></tr></thead><tbody>";
          rows.slice().sort((a, b) => {
            for (const f of varying) { const d = rank(f, a[KEY[f]]) - rank(f, b[KEY[f]]); if (d) return d; }
            return b.n - a.n;
          }).forEach((r) => {
            html += "<tr>";
            varying.forEach((f) => { const v = r[KEY[f]]; html += "<td>" + (v && v !== "-" ? UI.esc(displayName(f, v)) : '<span class="pdg-gap">\u2013</span>') + "</td>"; });
            html += '<td><span class="pdg-form">' + UI.esc(r.form) + '</span></td><td>' + r.n + "</td></tr>";
          });
          html += "</tbody></table>";
        }
        chart.innerHTML = html;
      } else {
        const sql = "SELECT " + q(dim1) + " AS k, COUNT(*) AS c FROM " + q(TABLE) +
          " WHERE " + naGuard(dim1) + (w ? " AND " + w : "") +
          " GROUP BY k ORDER BY c DESC LIMIT " + topN + ";";
        const rows = SQL.objects(sql);
        title.textContent = "Token count by " + UI.fieldTitle(dim1);
        desc.textContent = "Top " + rows.length + " values" + filterText + ".";
        Chart.bars(chart, rows.map((r) => ({ label: displayName(dim1, r.k), value: r.c })),
          { valueLabel: "tokens", emptyMsg: "No tokens match." });
      }
    } catch (e) {
      chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Chart error: ' + UI.esc(e.message) + "</div>";
    }
  }

  /* ----- init ------------------------------------------------------------- */

  async function init() {
    wireCustomSql();
    UI.wireInfoButtons();
    UI.wireAdvancedToggles();
    try {
      await SQL.ready();
    } catch (e) {
      if ($("morphLoadStatus")) $("morphLoadStatus").innerHTML = '<span>Could not load corpus: ' + UI.esc(e.message) + "</span>";
      return;
    }
    if ($("morphLoadStatus")) $("morphLoadStatus").style.display = "none";

    qf = UI.featureFilterGroup($("qfGroup"), {});
    ex = UI.featureFilterGroup($("exGroup"), {});

    $("btnApplyFilter").disabled = false;
    $("btnApplyFilter").addEventListener("click", applyQuickFilter);
    // The quick-filter Reset is the single reset: it clears manual mode, restores
    // the dropdowns, and regenerates the SQL from them (erasing any custom query).
    $("btnResetFilter").addEventListener("click", () => {
      manualSql = false;
      setQuickControlsEnabled(true);
      qf.reset();
      applyQuickFilter();
    });

    UI.fillSelect($("exDim1"), DIMENSIONS.map((d) => d[0]), { head: null });
    UI.fillSelect($("exDim2"), DIMENSIONS.map((d) => d[0]), { head: "(none)" });
    // relabel option text to friendly names
    const dimLabel = Object.fromEntries(DIMENSIONS);
    [...$("exDim1").options].forEach((o) => { if (dimLabel[o.value]) o.textContent = dimLabel[o.value]; });
    [...$("exDim2").options].forEach((o) => { if (dimLabel[o.value]) o.textContent = dimLabel[o.value]; });
    $("exDim1").value = "work";
    $("exDim1").disabled = false;
    $("exDim2").disabled = false;
    $("btnExRun").disabled = false;
    // populate the work / author limiters
    UI.fillSelect($("exLimitWork"), SQL.distinct("work"), { head: "(all works)" });
    UI.fillSelect($("exLimitAuthor"), SQL.distinct("author"), { head: "(all authors)" });
    $("exChartType").addEventListener("change", () => { syncExplorerControls(); runExplorer(); });
    $("exNodeUnit").addEventListener("change", runExplorer);
    $("exLimitWork").addEventListener("change", runExplorer);
    $("exLimitAuthor").addEventListener("change", runExplorer);
    $("exSemantic").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runExplorer(); } });
    $("exLemma").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runExplorer(); } });
    $("btnExRun").addEventListener("click", runExplorer);
    $("btnExReset").addEventListener("click", () => {
      ex.reset(); $("exSemantic").value = ""; $("exLimitWork").value = ""; $("exLimitAuthor").value = ""; runExplorer();
    });

    // No saved state is read: every load starts fresh. The dropdowns build the
    // default query, fill the editor, and render; the explorer draws its default.
    syncExplorerControls();
    applyQuickFilter();
    runExplorer();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
