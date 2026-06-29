/* ============================================================================
 *  MORPHOTACTICS TAB
 *  Four SQL-driven, D3-rendered views over the shared corpus database:
 *    sequence   — POS -> next POS transition matrix (heatmap)
 *    cooccur    — feature A x feature B co-occurrence (heatmap)
 *    exponence  — most frequent form endings per feature value (grouped bars)
 *    slots      — feature value frequencies for a POS (bars)
 * ========================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const SQL = window.MopsosSQL;
  const UI = window.MopsosUI;
  const Chart = window.MopsosChart;
  const TABLE = "morphology";
  const q = SQL.quoteId;
  const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

  const FEATURE_FIELDS = ["pos", "person", "number", "tense", "mood", "voice", "gender", "case", "degree"];

  const el = {
    status: $("mtLoadStatus"),
    view: $("mtView"),
    run: $("mtRun"),
    outTitle: $("mtOutTitle"),
    outDesc: $("mtOutDesc"),
    chart: $("mtChart"),
    table: $("mtTable"),
    sql: $("mtSql"),
    // sequence
    seqWork: $("mtSeqWork"),
    seqMode: $("mtSeqMode"),
    // cooccur
    coA: $("mtCoA"),
    coB: $("mtCoB"),
    coPos: $("mtCoPos"),
    // exponence
    expPos: $("mtExpPos"),
    expFeat: $("mtExpFeat"),
    expLen: $("mtExpLen"),
    // slots
    slotPos: $("mtSlotPos"),
    slotFeat: $("mtSlotFeat")
  };

  function showControls(view) {
    document.querySelectorAll(".mt-controls").forEach((c) => {
      if (c.dataset.for === view) c.removeAttribute("hidden");
      else c.setAttribute("hidden", "");
    });
  }

  function normalizeGreek(x) {
    return String(x == null ? "" : x).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\u03c2/g, "\u03c3").replace(/[^\u03b1-\u03c9]/g, "");
  }

  function presentFeatures() {
    const cols = SQL.columns();
    return FEATURE_FIELDS.filter((f) => cols.includes(f));
  }

  function featLabel(f) {
    return UI.fieldTitle(f);
  }

  /* ---------------- View: word-class sequencing ---------------- */
  function viewSequence() {
    const work = el.seqWork.value;
    const mode = el.seqMode.value;
    // adjacent tokens within a sentence, ordered by token id, both POS present
    let sql =
      "WITH seq AS (\n" +
      "  SELECT sentence_id, pos AS cur,\n" +
      "         LEAD(pos) OVER (PARTITION BY sentence_id ORDER BY id) AS nxt\n" +
      "  FROM " + q(TABLE) + "\n" +
      "  WHERE pos IS NOT NULL AND pos <> '' AND pos <> '-'" +
      (work ? "\n    AND work = " + sqlStr(work) : "") + "\n" +
      ")\n" +
      "SELECT cur, nxt, count(*) AS n FROM seq\n" +
      "WHERE nxt IS NOT NULL AND nxt <> '' AND nxt <> '-'\n" +
      "GROUP BY cur, nxt;";
    el.sql.textContent = sql;

    const rows = SQL.objects(sql);
    if (!rows.length) { Chart.bars(el.chart, []); el.table.innerHTML = ""; return; }

    const tags = [...new Set(rows.flatMap((r) => [r.cur, r.nxt]))]
      .sort((a, b) => UI.label("pos", a).localeCompare(UI.label("pos", b)));
    const idx = new Map(tags.map((t, i) => [t, i]));
    const matrix = tags.map(() => tags.map(() => 0));
    for (const r of rows) matrix[idx.get(r.cur)][idx.get(r.nxt)] = r.n;

    let display = matrix;
    let fmt = (v) => v;
    if (mode === "prob") {
      display = matrix.map((row) => {
        const sum = row.reduce((a, b) => a + b, 0) || 1;
        return row.map((v) => v / sum);
      });
      fmt = (v) => (v * 100).toFixed(0) + "%";
    }
    const labels = tags.map((t) => UI.label("pos", t));
    Chart.heatmap(el.chart, display, labels, labels, {
      valueLabel: mode === "prob" ? "P(next | current)" : "Transitions",
      valueFormat: fmt, showValues: tags.length <= 12,
      interpolator: window.d3 ? window.d3.interpolateBlues : null
    });

    // table: top transitions by count
    const top = rows.slice().sort((a, b) => b.n - a.n).slice(0, 25)
      .map((r) => [UI.label("pos", r.cur), UI.label("pos", r.nxt), r.n]);
    UI.renderTable(el.table, ["Current POS", "Next POS", "Count"], top, { paginate: false });

    el.outTitle.textContent = "Word-class sequencing";
    el.outDesc.textContent = "Rows are the current token’s part of speech; columns are the next token’s part of speech for adjacent words in a sentence." +
      (mode === "prob" ? " Cells are row-normalised probabilities." : " Cells are raw transition counts.");
  }

  /* ---------------- View: feature co-occurrence ---------------- */
  function viewCooccur() {
    const a = el.coA.value, b = el.coB.value, pos = el.coPos.value;
    if (!a || !b) return;
    let where = [q(a) + " IS NOT NULL", q(a) + " <> ''", q(a) + " <> '-'",
                 q(b) + " IS NOT NULL", q(b) + " <> ''", q(b) + " <> '-'"];
    if (pos) where.push("pos = " + sqlStr(pos));
    const sql =
      "SELECT " + q(a) + " AS a, " + q(b) + " AS b, count(*) AS n\n" +
      "FROM " + q(TABLE) + "\nWHERE " + where.join(" AND ") +
      "\nGROUP BY a, b;";
    el.sql.textContent = sql;

    const rows = SQL.objects(sql);
    if (!rows.length) { Chart.heatmap(el.chart, [], [], []); el.table.innerHTML = ""; return; }
    const av = [...new Set(rows.map((r) => r.a))].sort((x, y) => UI.label(a, x).localeCompare(UI.label(a, y)));
    const bv = [...new Set(rows.map((r) => r.b))].sort((x, y) => UI.label(b, x).localeCompare(UI.label(b, y)));
    const ai = new Map(av.map((v, i) => [v, i])), bi = new Map(bv.map((v, i) => [v, i]));
    const matrix = av.map(() => bv.map(() => 0));
    for (const r of rows) matrix[ai.get(r.a)][bi.get(r.b)] = r.n;

    Chart.heatmap(el.chart, matrix,
      av.map((v) => UI.label(a, v)), bv.map((v) => UI.label(b, v)),
      { valueLabel: "Co-occurrences", showValues: av.length * bv.length <= 64 });

    const tbl = rows.slice().sort((x, y) => y.n - x.n).slice(0, 40)
      .map((r) => [UI.label(a, r.a), UI.label(b, r.b), r.n]);
    UI.renderTable(el.table, [featLabel(a), featLabel(b), "Count"], tbl, { paginate: false });

    el.outTitle.textContent = "Feature co-occurrence";
    el.outDesc.textContent = "How often each value of " + featLabel(a) + " co-occurs with each value of " +
      featLabel(b) + " inside the same word" + (pos ? " (restricted to " + UI.label("pos", pos) + ")" : "") + ".";
  }

  /* ---------------- View: exponence (form endings) ---------------- */
  function viewExponence() {
    const pos = el.expPos.value, feat = el.expFeat.value, k = Number(el.expLen.value) || 2;
    if (!pos || !feat) return;
    const sql =
      "SELECT form, " + q(feat) + " AS fv\n" +
      "FROM " + q(TABLE) + "\n" +
      "WHERE pos = " + sqlStr(pos) + " AND form IS NOT NULL AND form <> ''\n" +
      "  AND " + q(feat) + " IS NOT NULL AND " + q(feat) + " <> '' AND " + q(feat) + " <> '-';";
    el.sql.textContent = sql + "\n-- endings (last " + k + " letters, diacritics stripped) tabulated in-browser";

    const rows = SQL.objects(sql);
    if (!rows.length) { Chart.groupedBars(el.chart, [], [], []); el.table.innerHTML = ""; return; }

    // tabulate ending counts per feature value
    const perValue = new Map();   // fv -> Map(ending -> count)
    for (const r of rows) {
      const norm = normalizeGreek(r.form);
      if (norm.length < 1) continue;
      const end = norm.slice(-k);
      if (!perValue.has(r.fv)) perValue.set(r.fv, new Map());
      const m = perValue.get(r.fv);
      m.set(end, (m.get(end) || 0) + 1);
    }
    // top endings overall (columns) and feature values (rows)
    const overall = new Map();
    for (const m of perValue.values()) for (const [e, c] of m) overall.set(e, (overall.get(e) || 0) + c);
    const topEndings = [...overall.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map((e) => e[0]);
    const values = [...perValue.keys()].sort((x, y) => UI.label(feat, x).localeCompare(UI.label(feat, y)));
    const matrix = values.map((v) => topEndings.map((e) => perValue.get(v).get(e) || 0));

    Chart.groupedBars(el.chart, matrix,
      values.map((v) => UI.label(feat, v)), topEndings.map((e) => "-" + e),
      { valueLabel: "Forms" });

    // detail table: top ending per value
    const detail = [];
    for (const v of values) {
      const m = perValue.get(v);
      const top = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3)
        .map(([e, c]) => "-" + e + " (" + c + ")").join(", ");
      detail.push([UI.label(feat, v), top]);
    }
    UI.renderTable(el.table, [featLabel(feat), "Top endings (last " + k + " letters)"], detail, { paginate: false });

    el.outTitle.textContent = "Surface-final sequences by feature value";
    el.outDesc.textContent = "For " + UI.label("pos", pos) + "s, the most frequent word-final " + k +
      "-letter sequences that realise each value of " + featLabel(feat) + " (diacritics stripped, final ς→σ).";
  }

  /* ---------------- View: paradigm slots ---------------- */
  function viewSlots() {
    const pos = el.slotPos.value, feat = el.slotFeat.value;
    if (!pos || !feat) return;
    const sql =
      "SELECT " + q(feat) + " AS v, count(*) AS n\n" +
      "FROM " + q(TABLE) + "\n" +
      "WHERE pos = " + sqlStr(pos) + " AND " + q(feat) + " IS NOT NULL AND " + q(feat) + " <> '' AND " + q(feat) + " <> '-'\n" +
      "GROUP BY v ORDER BY n DESC;";
    el.sql.textContent = sql;

    const rows = SQL.objects(sql);
    if (!rows.length) { Chart.bars(el.chart, []); el.table.innerHTML = ""; return; }
    const items = rows.map((r) => ({ label: UI.label(feat, r.v), value: r.n }));
    Chart.bars(el.chart, items, { valueLabel: "Tokens", labelWidth: 200 });
    UI.renderTable(el.table, [featLabel(feat), "Count"], rows.map((r) => [UI.label(feat, r.v), r.n]), { paginate: false });

    el.outTitle.textContent = "Paradigm slots";
    el.outDesc.textContent = "How often each value of " + featLabel(feat) + " is filled for " + UI.label("pos", pos) + "s.";
  }

  function render() {
    const v = el.view.value;
    try {
      if (v === "sequence") viewSequence();
      else if (v === "cooccur") viewCooccur();
      else if (v === "exponence") viewExponence();
      else if (v === "slots") viewSlots();
    } catch (e) {
      el.chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Error: ' + UI.esc(e.message) + "</div>";
    }
  }

  async function init() {
    showControls(el.view.value);
    el.view.addEventListener("change", () => { showControls(el.view.value); render(); });
    el.run.addEventListener("click", render);

    try { await SQL.ready(); }
    catch (e) { if (el.status) el.status.innerHTML = "<span>Could not load corpus: " + UI.esc(e.message) + "</span>"; return; }
    if (el.status) el.status.style.display = "none";

    const feats = presentFeatures();
    const featSansPos = feats.filter((f) => f !== "pos");
    const posValues = SQL.distinct("pos").filter((p) => p && p !== "-");

    // sequence
    UI.fillSelect(el.seqWork, SQL.distinct("work"), { head: "(all works)" });
    // cooccur
    UI.fillSelect(el.coA, feats, { head: null });
    UI.fillSelect(el.coB, feats, { head: null });
    el.coA.value = feats.includes("case") ? "case" : feats[0];
    el.coB.value = feats.includes("number") ? "number" : feats[Math.min(1, feats.length - 1)];
    [...el.coA.options].forEach((o) => { o.textContent = featLabel(o.value); });
    [...el.coB.options].forEach((o) => { o.textContent = featLabel(o.value); });
    UI.fillSelect(el.coPos, posValues, { field: "pos" });
    // exponence
    UI.fillSelect(el.expPos, posValues, { head: null, field: "pos" });
    el.expPos.value = posValues.includes("n") ? "n" : posValues[0];
    UI.fillSelect(el.expFeat, featSansPos, { head: null });
    [...el.expFeat.options].forEach((o) => { o.textContent = featLabel(o.value); });
    el.expFeat.value = featSansPos.includes("case") ? "case" : featSansPos[0];
    // slots
    UI.fillSelect(el.slotPos, posValues, { head: null, field: "pos" });
    el.slotPos.value = posValues.includes("v") ? "v" : posValues[0];
    UI.fillSelect(el.slotFeat, featSansPos, { head: null });
    [...el.slotFeat.options].forEach((o) => { o.textContent = featLabel(o.value); });
    el.slotFeat.value = featSansPos.includes("mood") ? "mood" : featSansPos[0];

    el.run.disabled = false;
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
