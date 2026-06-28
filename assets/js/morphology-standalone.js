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

  /* ----- reusable part-of-speech-aware filter group ----------------------- */

  function fieldSelect(labelText) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.innerHTML = "<strong>" + UI.esc(labelText) + "</strong>";
    const sel = document.createElement("select");
    wrap.appendChild(lab);
    wrap.appendChild(sel);
    return wrap;
  }

  function makeFeatureFilterGroup(host, onChange) {
    host.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "grid-3";
    host.appendChild(grid);

    const posWrap = fieldSelect("Part of speech");
    const posSel = posWrap.querySelector("select");
    posSel.dataset.field = "pos";
    grid.appendChild(posWrap);

    function rerenderFeatures() {
      grid.querySelectorAll("[data-featwrap]").forEach((n) => n.remove());
      const pos = posSel.value;
      const feats = pos ? SQL.nonEmptyColumns(FEATURE_COLS, { pos: pos }) : DEFAULT_FEATURES;
      for (const f of feats) {
        const wrap = fieldSelect(UI.fieldTitle(f));
        wrap.dataset.featwrap = "1";
        const sel = wrap.querySelector("select");
        sel.dataset.field = f;
        const vals = pos ? SQL.distinctFor(f, { pos: pos }) : SQL.distinctFor(f);
        UI.fillSelect(sel, vals, { field: f, head: "(any)" });
        sel.addEventListener("change", () => onChange && onChange());
        grid.appendChild(wrap);
      }
    }

    UI.fillSelect(posSel, SQL.distinct("pos"), { field: "pos", head: "(any) part of speech" });
    posSel.addEventListener("change", () => { rerenderFeatures(); onChange && onChange(); });
    rerenderFeatures();

    return {
      read() {
        const f = {};
        grid.querySelectorAll("select[data-field]").forEach((s) => { if (s.value) f[s.dataset.field] = s.value; });
        return f;
      },
      reset() {
        posSel.value = "";
        rerenderFeatures();
      }
    };
  }

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

  function applyQuickFilter() {
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

  function runExplorer() {
    const filters = ex.read();
    const w = whereOf(filters);
    const dim1 = $("exDim1").value;
    const dim2 = $("exDim2").value;
    const topN = parseInt($("exTopN").value, 10) || 20;
    const title = $("exTitle");
    const desc = $("exDesc");
    const chart = $("exChart");

    const filterText = Object.keys(filters).length
      ? " (filtered: " + Object.keys(filters).map((k) => UI.fieldTitle(k) + "=" + displayName(k, filters[k])).join(", ") + ")"
      : "";

    try {
      if (!dim2 || dim2 === dim1) {
        const sql = "SELECT " + q(dim1) + " AS k, COUNT(*) AS c FROM " + q(TABLE) +
          " WHERE " + naGuard(dim1) + (w ? " AND " + w : "") +
          " GROUP BY k ORDER BY c DESC LIMIT " + topN + ";";
        const rows = SQL.objects(sql);
        title.textContent = "Token count by " + UI.fieldTitle(dim1);
        desc.textContent = "Top " + rows.length + " values" + filterText + ".";
        Chart.bars(chart, rows.map((r) => ({ label: displayName(dim1, r.k), value: r.c })),
          { valueLabel: "tokens", emptyMsg: "No tokens match." });
      } else {
        const sql = "SELECT " + q(dim1) + " AS r, " + q(dim2) + " AS c2, COUNT(*) AS c FROM " + q(TABLE) +
          " WHERE " + naGuard(dim1) + " AND " + naGuard(dim2) + (w ? " AND " + w : "") +
          " GROUP BY r, c2;";
        const data = SQL.objects(sql);
        const rowTot = {}, colTot = {}, cell = {};
        for (const o of data) {
          rowTot[o.r] = (rowTot[o.r] || 0) + o.c;
          colTot[o.c2] = (colTot[o.c2] || 0) + o.c;
          cell[o.r + "\u0000" + o.c2] = o.c;
        }
        const rowVals = Object.keys(rowTot).sort((a, b) => rowTot[b] - rowTot[a]).slice(0, Math.min(topN, 30));
        const colVals = Object.keys(colTot).sort((a, b) => colTot[b] - colTot[a]).slice(0, 30);
        const matrix = rowVals.map((rv) => colVals.map((cv) => cell[rv + "\u0000" + cv] || 0));
        title.textContent = UI.fieldTitle(dim1) + " × " + UI.fieldTitle(dim2);
        desc.textContent = "Token counts for each combination" + filterText + ". Darker = more frequent.";
        Chart.heatmap(chart, matrix,
          rowVals.map((v) => displayName(dim1, v)),
          colVals.map((v) => displayName(dim2, v)),
          { valueLabel: "tokens", showValues: rowVals.length <= 15 && colVals.length <= 15 });
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

    qf = makeFeatureFilterGroup($("qfGroup"), null);
    ex = makeFeatureFilterGroup($("exGroup"), null);

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
    $("btnExRun").addEventListener("click", runExplorer);
    $("btnExReset").addEventListener("click", () => { ex.reset(); runExplorer(); });

    applyQuickFilter();   // initial browse
    runExplorer();        // initial chart (tokens by book)
    runCustomSql();       // prime the folded console
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
