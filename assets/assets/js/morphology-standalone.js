/* ============================================================================
 *  MORPHOLOGY TAB
 *  Runs against the shared in-browser SQLite database (window.MopsosSQL).
 *  Surfaces:
 *    1. Quick filter — part-of-speech-aware drop-downs (only applicable
 *       features shown, only occurring values offered) -> paginated table
 *       with irrelevant columns hidden. Custom read-only SQL is folded in.
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
  // Columns the Quick-filter table shows (when present) and never prunes.
  const PREVIEW_COLS = ["author", "work", "ref", "form", "lemma", "pos", "person",
    "number", "tense", "mood", "voice", "gender", "case", "degree"];
  const ALWAYS_COLS = ["author", "work", "ref", "form", "lemma", "pos"];
  const LABEL_MAP = { pos: "pos", person: "person", number: "number", tense: "tense",
    mood: "mood", voice: "voice", gender: "gender", case: "case", degree: "degree" };
  // Dimensions offered in the explorer.
  const DIMENSIONS = [
    ["work", "Book / work"], ["author", "Author"], ["lemma", "Lemma"], ["form", "Word form"],
    ["pos", "Part of speech"], ["number", "Number"], ["case", "Case"], ["gender", "Gender"],
    ["tense", "Tense"], ["mood", "Mood"], ["voice", "Voice"], ["person", "Person"], ["degree", "Degree"]
  ];

  const isNA = (v) => v === null || v === undefined || v === "" || v === "-";
  const whereOf = (filters) => {
    const p = [];
    for (const k in filters) if (filters[k]) p.push(q(k) + " = " + sqlStr(filters[k]));
    return p.join(" AND ");
  };
  const naGuard = (c) => q(c) + " IS NOT NULL AND " + q(c) + " NOT IN ('','-')";
  const displayName = (field, code) => (UI.LABELS[field] ? UI.label(field, code) : String(code));

  /* ----- column pruning (hide attributes irrelevant to the selection) ----- */

  function prune(result) {
    const { columns, values } = result;
    const keep = columns.map((c, i) => ALWAYS_COLS.includes(c) || values.some((r) => !isNA(r[i])));
    return {
      columns: columns.filter((_, i) => keep[i]),
      values: values.map((r) => r.filter((_, i) => keep[i]))
    };
  }

  /* ----- Quick filter ----------------------------------------------------- */

  let qf = null;
  const RESULT_CAP = 5000;

  function saveMorphState() {
    UI.saveState("morph", {
      qf: qf ? qf.read() : {},
      ex: ex ? ex.read() : {},
      exChartType: $("exChartType").value, exNodeUnit: $("exNodeUnit").value,
      exDim1: $("exDim1").value, exDim2: $("exDim2").value, exTopN: $("exTopN").value,
      exSemantic: $("exSemantic").value, exLemma: $("exLemma").value,
      exLimitWork: $("exLimitWork").value, exLimitAuthor: $("exLimitAuthor").value,
      sql: $("qfSqlInput").value
    });
  }

  function applyQuickFilter() {
    saveMorphState();
    const filters = qf.read();
    const cols = PREVIEW_COLS.filter((c) => SQL.columns().includes(c));
    const where = whereOf(filters);
    let sql = "SELECT " + cols.map(q).join(", ") + " FROM " + q(TABLE);
    if (where) sql += " WHERE " + where;
    sql += " ORDER BY " + q("work") + ", " + q("ref") + " LIMIT " + (RESULT_CAP + 1) + ";";
    try {
      const raw = SQL.query(sql);
      const capped = raw.values.length > RESULT_CAP;
      if (capped) raw.values = raw.values.slice(0, RESULT_CAP);
      const res = prune(raw);
      UI.renderTable($("qfResults"), res.columns, res.values, { paginate: true, pageSize: 50, labelMap: LABEL_MAP });
      if (capped) {
        const note = document.createElement("div");
        note.className = "small-muted";
        note.style.padding = ".4rem .2rem 0";
        note.textContent = "Showing the first " + RESULT_CAP.toLocaleString() + " matching tokens. Narrow the filter or use custom SQL for the full set.";
        $("qfResults").appendChild(note);
      }
    } catch (e) {
      $("qfResults").innerHTML = '<div class="small-muted" style="padding:.7rem;">Query error: ' + UI.esc(e.message) + "</div>";
    }
  }

  /* ----- Custom SQL (folded into Quick filter, Enter to run) -------------- */

  const SQL_DEFAULT = 'SELECT form, "case", work, ref\nFROM ' + TABLE +
    "\nWHERE lemma = 'Μοῦσα'\nORDER BY work, ref\nLIMIT 200;";
  const SQL_EXAMPLES = [
    ["count by work", "SELECT work, COUNT(*) AS n FROM " + TABLE + " GROUP BY work ORDER BY n DESC;"],
    ["all verbs", "SELECT form, lemma, tense, mood, voice FROM " + TABLE + " WHERE pos = 'v' LIMIT 500;"],
    ["genitives", "SELECT form, lemma, gender FROM " + TABLE + " WHERE \"case\" = 'g' LIMIT 500;"],
    ["distinct lemmata", "SELECT DISTINCT lemma FROM " + TABLE + " ORDER BY lemma LIMIT 500;"],
    ["schema", "PRAGMA table_info(" + TABLE + ");"]
  ];

  function runCustomSql() {
    const input = $("qfSqlInput");
    const status = $("qfSqlStatus");
    const out = $("qfSqlOut");
    const sql = input.value;
    if (!SQL.isReadOnly(sql)) {
      status.textContent = "Read-only: only SELECT / WITH / EXPLAIN / PRAGMA are allowed.";
      return;
    }
    try {
      const { columns, values } = SQL.query(sql);
      UI.renderTable(out, columns, values, { paginate: false });
      status.textContent = "OK — " + values.length + " row" + (values.length === 1 ? "" : "s") + ".";
      saveMorphState();
    } catch (e) {
      status.textContent = "SQL error: " + e.message;
    }
  }

  function wireCustomSql() {
    $("qfSqlInput").value = SQL_DEFAULT;
    $("qfSqlRun").addEventListener("click", runCustomSql);
    $("qfSqlReset").addEventListener("click", () => { $("qfSqlInput").value = SQL_DEFAULT; runCustomSql(); });
    $("qfSqlInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runCustomSql(); }
    });
    const host = $("qfSqlExamples");
    for (const [label, sql] of SQL_EXAMPLES) {
      const b = document.createElement("button");
      b.className = "btn btn-sm";
      b.textContent = label;
      b.addEventListener("click", () => { $("qfSqlInput").value = sql; runCustomSql(); });
      host.appendChild(b);
    }
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
    const twoDim = (type === "heatmap" || type === "grouped" || type === "proportion" || type === "paradigm");
    $("exDim1Wrap").hidden = (type === "network");
    $("exDim2Wrap").hidden = !twoDim;
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
                '\u201D. Try a concept like blue, war, sea, fear, wine \u2014 or a Greek lemma.</div>';
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
    saveMorphState();
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
        const lemma = ($("exLemma").value || "").trim();
        if (!lemma) {
          chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Type a lemma above (e.g. \u03bc\u1fc6\u03bd\u03b9\u03c2, \u03b8\u03b5\u03cc\u03c2, \u1f00\u03b5\u03af\u03b4\u03c9) to lay out its attested forms.</div>';
          title.textContent = ""; desc.textContent = ""; return;
        }
        // pick sensible paradigm axes for this lemma's part of speech (user can override via the two selectors)
        const lw = q("lemma") + " = " + sqlStr(lemma) + (w ? " AND " + w : "");
        const cand = ["case", "number", "gender", "tense", "mood", "voice", "person", "degree"];
        const cols = SQL.nonEmptyColumns(cand, { lemma: lemma });
        if (!cols.length) {
          chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No inflectional features attested for \u201c' + UI.esc(lemma) + '\u201d in this scope.</div>';
          title.textContent = ""; desc.textContent = ""; return;
        }
        const verbal = cols.indexOf("tense") >= 0 || cols.indexOf("mood") >= 0 || cols.indexOf("person") >= 0;
        const pref = verbal
          ? ["tense", "mood", "voice", "person", "number", "case", "gender"]
          : ["case", "number", "gender", "degree", "tense", "mood", "voice", "person"];
        const ordered = pref.filter((c) => cols.indexOf(c) >= 0);
        const f1 = (cols.indexOf($("exDim1").value) >= 0) ? $("exDim1").value : (ordered[0] || "case");
        const f2 = (cols.indexOf(dim2) >= 0 && dim2 !== f1) ? dim2 : (ordered.find((c) => c !== f1) || f1);
        const sql = "SELECT " + q(f1) + " AS r, " + q(f2) + " AS c2, form AS form, COUNT(*) AS c FROM " + q(TABLE) +
          " WHERE " + lw + " AND " + naGuard(f1) + " AND " + naGuard(f2) + " GROUP BY r, c2, form;";
        const data = SQL.objects(sql);
        if (!data.length) {
          chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No attested forms for \u201c' + UI.esc(lemma) + '\u201d in this scope.</div>';
          title.textContent = ""; desc.textContent = ""; return;
        }
        const rowTot = {}, colTot = {}, cellForms = {};
        for (const o of data) {
          rowTot[o.r] = (rowTot[o.r] || 0) + o.c;
          colTot[o.c2] = (colTot[o.c2] || 0) + o.c;
          const key = o.r + "\u0000" + o.c2;
          (cellForms[key] = cellForms[key] || []).push([o.form, o.c]);
        }
        const rowVals = Object.keys(rowTot).sort((a, b) => rowTot[b] - rowTot[a]);
        const colVals = Object.keys(colTot).sort((a, b) => colTot[b] - colTot[a]);
        let html = '<table class="data-table paradigm-table"><thead><tr><th>' + UI.esc(UI.fieldTitle(f1)) + " \\ " + UI.esc(UI.fieldTitle(f2)) + "</th>";
        colVals.forEach((cv) => { html += "<th>" + UI.esc(displayName(f2, cv)) + "</th>"; });
        html += "</tr></thead><tbody>";
        rowVals.forEach((rv) => {
          html += "<tr><th>" + UI.esc(displayName(f1, rv)) + "</th>";
          colVals.forEach((cv) => {
            const forms = (cellForms[rv + "\u0000" + cv] || []).sort((a, b) => b[1] - a[1]);
            html += "<td>" + (forms.length
              ? forms.map((f) => '<span class="pdg-form">' + UI.esc(f[0]) + '</span><span class="pdg-c">' + f[1] + "</span>").join("<br>")
              : '<span class="pdg-gap">\u2014</span>') + "</td>";
          });
          html += "</tr>";
        });
        html += "</tbody></table>";
        const total = SQL.scalar("SELECT COUNT(*) FROM " + q(TABLE) + " WHERE " + lw + ";");
        title.textContent = "Paradigm of " + lemma + " \u2014 " + UI.fieldTitle(f1) + " × " + UI.fieldTitle(f2);
        desc.textContent = total + " attested tokens" + filterText + ". Each cell lists the attested form(s) and their counts; \u2014 marks an unattested cell.";
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
    $("btnResetFilter").addEventListener("click", () => { qf.reset(); applyQuickFilter(); });

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

    // restore the person's previous selections, if any
    const st = UI.loadState("morph");
    if (st) {
      if (st.qf) qf.setState(st.qf);
      if (st.ex) ex.setState(st.ex);
      if (st.exChartType) $("exChartType").value = st.exChartType;
      if (st.exNodeUnit) $("exNodeUnit").value = st.exNodeUnit;
      if (st.exDim1) $("exDim1").value = st.exDim1;
      if (st.exDim2 != null) $("exDim2").value = st.exDim2;
      if (st.exTopN) $("exTopN").value = st.exTopN;
      if (st.exSemantic != null) $("exSemantic").value = st.exSemantic;
      if (st.exLemma != null) $("exLemma").value = st.exLemma;
      if (st.exLimitWork != null) $("exLimitWork").value = st.exLimitWork;
      if (st.exLimitAuthor != null) $("exLimitAuthor").value = st.exLimitAuthor;
      if (st.sql) $("qfSqlInput").value = st.sql;
    }
    syncExplorerControls();

    applyQuickFilter();   // initial browse (restored filter if any)
    runExplorer();        // initial chart (restored dims if any)
    runCustomSql();       // prime the folded console
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
