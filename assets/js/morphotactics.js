/* ============================================================================
 *  MORPHOTACTICS TAB
 *  Six SQL-driven, D3-rendered views over the shared corpus database:
 *    sequence   — POS -> next POS transition matrix (heatmap)
 *    cooccur    — feature A x feature B co-occurrence (heatmap)
 *    exponence  — most frequent form endings per feature value (grouped bars)
 *    slots      — feature value frequencies for a POS (bars)
 *    compound   — nominal-compound member-category pairing (heatmap), plus an
 *                 adaptive lookup for one compound's members/attestations
 *    infinitive — infinitive tense x voice combinations (heatmap), plus an
 *                 adaptive lookup for one verb's attested infinitive forms
 *  The compound/infinitive lookups use the accent-insensitive *_search and
 *  Beta Code *_beta companion columns added in scripts/build_corpus.py (see
 *  scripts/greek_text.py), via the shared MopsosText / MopsosUI.greekCombo
 *  helpers — the same machinery any future adaptive search on this site
 *  would reuse, not something bespoke to this tab.
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
    slotFeat: $("mtSlotFeat"),
    // compound
    cmpWork: $("mtCmpWork"),
    cmpSearch: $("mtCmpSearch"),
    cmpSearchMenu: $("mtCmpSearchMenu"),
    cmpDetail: $("mtCmpDetail"),
    // infinitive
    infWork: $("mtInfWork"),
    infSearch: $("mtInfSearch"),
    infSearchMenu: $("mtInfSearchMenu"),
    infDetail: $("mtInfDetail")
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

  /* ---------------- View: nominal compounds ---------------- */
  function viewCompound() {
    const work = el.cmpWork.value;
    const sql =
      "SELECT lemma, lemma_search, member1_category AS a, member2_category AS b\n" +
      "FROM " + q("ncompounds_analysis") + "\n" +
      "WHERE member1_category IS NOT NULL AND member1_category <> ''\n" +
      "  AND member2_category IS NOT NULL AND member2_category <> '';";
    el.sql.textContent = sql + (work
      ? "\n-- restricted in-browser to compounds attested in " + work +
        " (accent-insensitive match against ncompounds_attestations.lemma)"
      : "");

    let rows = SQL.objects(sql);
    if (work) {
      const attested = new Set(
        SQL.objects("SELECT DISTINCT compound FROM " + q("ncompounds_attestations") +
          " WHERE work = " + sqlStr(work) + ";").map((r) => normalizeGreek(r.compound))
      );
      rows = rows.filter((r) => attested.has(r.compound_search));
    }
    if (!rows.length) { Chart.heatmap(el.chart, [], [], []); el.table.innerHTML = ""; return; }

    const av = [...new Set(rows.map((r) => r.a))].sort((x, y) => UI.label("pos", x).localeCompare(UI.label("pos", y)));
    const bv = [...new Set(rows.map((r) => r.b))].sort((x, y) => UI.label("pos", x).localeCompare(UI.label("pos", y)));
    const ai = new Map(av.map((v, i) => [v, i])), bi = new Map(bv.map((v, i) => [v, i]));
    const matrix = av.map(() => bv.map(() => 0));
    for (const r of rows) matrix[ai.get(r.a)][bi.get(r.b)] += 1;

    Chart.heatmap(el.chart, matrix,
      av.map((v) => UI.label("pos", v)), bv.map((v) => UI.label("pos", v)),
      { valueLabel: "Compounds", showValues: av.length * bv.length <= 64 });

    const tbl = [];
    av.forEach((a, i) => bv.forEach((b, j) => { if (matrix[i][j]) tbl.push([UI.label("pos", a), UI.label("pos", b), matrix[i][j]]); }));
    tbl.sort((x, y) => y[2] - x[2]);
    UI.renderTable(el.table, ["First member", "Second member", "Compounds"], tbl, { paginate: false });

    el.outTitle.textContent = "Nominal compound member-category pairing";
    el.outDesc.textContent = "How often each (first-member category, second-member category) pairing occurs among analyzed compounds" +
      (work ? ", restricted to compounds attested in " + work : "") +
      ". Categories reuse the part-of-speech codes (e.g. \u201cn\u201d = noun); a trailing \u201c?\u201d marks an uncertain member analysis in the source data.";
  }

  /* ---------------- View: infinitive forms ---------------- */
  function viewInfinitive() {
    const work = el.infWork.value;
    const where = ["pos = 'v'", "mood = 'n'",
      "tense IS NOT NULL AND tense <> '' AND tense <> '-'",
      "voice IS NOT NULL AND voice <> '' AND voice <> '-'"];
    if (work) where.push("work = " + sqlStr(work));
    const sql =
      "SELECT tense AS a, voice AS b, count(*) AS n\n" +
      "FROM " + q(TABLE) + "\n" +
      "WHERE " + where.join(" AND ") + "\n" +
      "GROUP BY a, b;";
    el.sql.textContent = sql;

    const rows = SQL.objects(sql);
    if (!rows.length) { Chart.heatmap(el.chart, [], [], []); el.table.innerHTML = ""; return; }
    const TORDER = ["p", "i", "f", "a", "r", "l", "t"], VORDER = ["a", "m", "p", "e"];
    const av = [...new Set(rows.map((r) => r.a))].sort((x, y) => TORDER.indexOf(x) - TORDER.indexOf(y));
    const bv = [...new Set(rows.map((r) => r.b))].sort((x, y) => VORDER.indexOf(x) - VORDER.indexOf(y));
    const ai = new Map(av.map((v, i) => [v, i])), bi = new Map(bv.map((v, i) => [v, i]));
    const matrix = av.map(() => bv.map(() => 0));
    for (const r of rows) matrix[ai.get(r.a)][bi.get(r.b)] = r.n;

    Chart.heatmap(el.chart, matrix, av.map((v) => UI.label("tense", v)), bv.map((v) => UI.label("voice", v)),
      { valueLabel: "Infinitives", showValues: true, interpolator: window.d3 ? window.d3.interpolateBlues : null });

    const tbl = rows.slice().sort((x, y) => y.n - x.n).map((r) => [UI.label("tense", r.a), UI.label("voice", r.b), r.n]);
    UI.renderTable(el.table, ["Tense", "Voice", "Tokens"], tbl, { paginate: false });

    el.outTitle.textContent = "Infinitive forms";
    el.outDesc.textContent = "Tense/voice combinations attested among infinitives (mood = infinitive)" + (work ? " in " + work : "") + ".";
  }

  /* ---------------- Compound & infinitive adaptive search ----------------
   * Both corpora here are small (hundreds to a few thousand rows), so the
   * candidate lists are simply fetched once and filtered in-browser via
   * MopsosUI.greekCombo — no need for per-keystroke SQL round-trips. The
   * *_search / *_beta columns queried below are the ones scripts/build_corpus.py
   * derives from `lemma` / `compound` (see scripts/greek_text.py). --------- */
  let compoundItems = null, compoundAttestations = null, infinitiveItems = null;

  function buildCompoundData() {
    if (compoundItems) return;
    const rows = SQL.objects(
      "SELECT lemma, lemma_search, lemma_beta, member1, member1_category, member2, member2_category\n" +
      "FROM " + q("ncompounds_analysis") + " ORDER BY lemma;");
    compoundItems = rows.map((r) => ({
      key: r.lemma_search, display: r.lemma, beta: r.lemma_beta,
      meta: (r.member1 || "?") + " + " + (r.member2 || "?"), row: r
    }));
    compoundAttestations = SQL.objects("SELECT compound, work, book, line_num FROM " + q("ncompounds_attestations") + ";");
  }

  function renderCompoundDetail(item) {
    const r = item.row;
    const attested = compoundAttestations
      .filter((a) => normalizeGreek(a.lemma) === item.key)
      .sort((a, b) => a.work.localeCompare(b.work) || Number(a.book) - Number(b.book) || Number(a.line_num) - Number(b.line_num));
    let html = '<table class="paradigm-table"><tbody>';
    html += "<tr><th>Compound</th><td>" + UI.esc(r.lemma) + "</td></tr>";
    html += "<tr><th>Beta Code</th><td><code>" + UI.esc(r.lemma_beta) + "</code></td></tr>";
    html += "<tr><th>First member</th><td>" + UI.esc(r.member1 || "\u2014") + " (" + UI.esc(UI.label("pos", r.member1_category)) + ")</td></tr>";
    html += "<tr><th>Second member</th><td>" + UI.esc(r.member2 || "\u2014") + " (" + UI.esc(UI.label("pos", r.member2_category)) + ")</td></tr>";
    html += "</tbody></table>";
    html += attested.length
      ? '<p class="small-muted" style="margin:.5rem 0 .25rem;">Attested ' + attested.length + "\u00d7: " +
        attested.map((a) => UI.esc(a.work + " " + a.book + "." + a.line_num)).join(", ") + "</p>"
      : '<p class="small-muted" style="margin-top:.5rem;">No attestations on record for this exact spelling.</p>';
    el.cmpDetail.innerHTML = html;
  }

  function wireCompoundCombo() {
    UI.greekCombo(el.cmpSearch, el.cmpSearchMenu, {
      items() { buildCompoundData(); return compoundItems; },
      onSelect(it) { el.cmpSearch.value = it.display; renderCompoundDetail(it); }
    });
  }

  function buildInfinitiveData() {
    if (infinitiveItems) return;
    const rows = SQL.objects(
      "SELECT lemma, lemma_search, lemma_beta, count(*) AS n\n" +
      "FROM " + q(TABLE) + "\n" +
      "WHERE pos = 'v' AND mood = 'n' AND lemma IS NOT NULL AND lemma <> ''\n" +
      "GROUP BY lemma, lemma_search, lemma_beta ORDER BY n DESC;");
    infinitiveItems = rows.map((r) => ({ key: r.lemma_search, display: r.lemma, beta: r.lemma_beta, meta: r.n + "\u00d7", lemma: r.lemma }));
  }

  function renderInfinitiveDetail(item) {
    const rows = SQL.objects(
      "SELECT form, tense, voice, count(*) AS n\n" +
      "FROM " + q(TABLE) + "\n" +
      "WHERE pos = 'v' AND mood = 'n' AND lemma = " + sqlStr(item.lemma) + "\n" +
      "  AND tense IS NOT NULL AND tense <> '' AND tense <> '-'\n" +
      "  AND voice IS NOT NULL AND voice <> '' AND voice <> '-'\n" +
      "GROUP BY form, tense, voice ORDER BY n DESC;");
    if (!rows.length) { el.infDetail.innerHTML = '<p class="small-muted">No infinitive forms on record for this lemma.</p>'; return; }
    UI.renderTable(el.infDetail, ["Form", "Tense", "Voice", "Tokens"],
      rows.map((r) => [r.form, UI.label("tense", r.tense), UI.label("voice", r.voice), r.n]), { paginate: false });
  }

  function wireInfinitiveCombo() {
    UI.greekCombo(el.infSearch, el.infSearchMenu, {
      items() { buildInfinitiveData(); return infinitiveItems; },
      onSelect(it) { el.infSearch.value = it.display; renderInfinitiveDetail(it); }
    });
  }

  function render() {
    const v = el.view.value;
    try {
      if (v === "sequence") viewSequence();
      else if (v === "cooccur") viewCooccur();
      else if (v === "exponence") viewExponence();
      else if (v === "slots") viewSlots();
      else if (v === "compound") viewCompound();
      else if (v === "infinitive") viewInfinitive();
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
    // infinitive
    UI.fillSelect(el.infWork, SQL.distinct("work"), { head: "(all works)" });
    wireInfinitiveCombo();
    // compound (own table; guarded in case an older cached database predates it)
    try {
      UI.fillSelect(el.cmpWork,
        SQL.objects("SELECT DISTINCT work FROM " + q("ncompounds_attestations") + " ORDER BY work;").map((r) => r.work),
        { head: "(all works)" });
      wireCompoundCombo();
    } catch (e) {
      el.cmpWork.disabled = true;
      el.cmpDetail.innerHTML = '<p class="small-muted">Compound data not available: ' + UI.esc(e.message) + "</p>";
    }

    el.run.disabled = false;
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
