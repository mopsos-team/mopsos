/* ============================================================================
 *  MORPHOTACTICS TAB
 *  Two standalone panels plus three SQL-driven, D3-rendered views over the
 *  shared corpus database:
 *    compound   - nominal compounds: searchable by member string, member
 *                 syntactic category, and attesting work; shows the
 *                 member-category pairing (heatmap), the metrical
 *                 localization of the matching compounds (from the merged
 *                 morphology table), a clickable table of matches, and a
 *                 lookup giving one compound's members, metrical shapes,
 *                 verse positions, and attestations with line text;
 *                 rendered in its own panel at the top of the page
 *    infinitive - infinitive tense x voice combinations (heatmap), plus an
 *                 adaptive lookup for one verb's attested infinitive forms;
 *                 also rendered in its own panel
 *    sequence   - POS -> next POS transition matrix (heatmap)
 *    cooccur    - feature A x feature B co-occurrence (heatmap)
 *    slots      - feature value frequencies for a POS (bars); the feature
 *                 drop-down offers only features attested for that POS
 *  The compound/infinitive lookups use the accent-insensitive *_search
 *  companion column added in scripts/build_corpus.py (see scripts/greek_text.py);
 *  the Beta Code each candidate carries is transliterated from its Greek lemma
 *  in the browser (MopsosText.toBetaCode), not stored in the database. Both go
 *  through the shared MopsosText / MopsosUI.greekCombo helpers, the same
 *  machinery any future adaptive search on this site would reuse, not something
 *  bespoke to this tab.
 * ========================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const SQL = window.MopsosSQL;
  const UI = window.MopsosUI;
  const Chart = window.MopsosChart;
  const TABLE = "morphology";
  const q = SQL.quoteId;
  const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  // Beta Code is derived from the Greek lemma in the browser (MopsosText) rather
  // than stored as a DB column, keeping the database smaller and faster to load.
  const betaOf = (greek) => (window.MopsosText ? window.MopsosText.toBetaCode(greek || "") : "");

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
    // slots
    slotPos: $("mtSlotPos"),
    slotFeat: $("mtSlotFeat"),
    // compound (standalone panel)
    cmpWork: $("mtCmpWork"),
    cmpSearch: $("mtCmpSearch"),
    cmpSearchMenu: $("mtCmpSearchMenu"),
    cmpDetail: $("mtCmpDetail"),
    cmpDesc: $("mtCmpDesc"),
    cmpChart: $("mtCmpChart"),
    cmpTable: $("mtCmpTable"),
    cmpSql: $("mtCmpSql"),
    cmpM1: $("mtCmpM1"),
    cmpM1Menu: $("mtCmpM1Menu"),
    cmpM2: $("mtCmpM2"),
    cmpM2Menu: $("mtCmpM2Menu"),
    cmpM1Chart: $("mtCmpM1Chart"),
    cmpM2Chart: $("mtCmpM2Chart"),
    cmpM1Cat: $("mtCmpM1Cat"),
    cmpM2Cat: $("mtCmpM2Cat"),
    cmpM1Sub: $("mtCmpM1Sub"),
    cmpM2Sub: $("mtCmpM2Sub"),
    cmpLocNote: $("mtCmpLocNote"),
    cmpLocChart: $("mtCmpLocChart"),
    cmpLocSec: $("mtCmpLocSec"),
    cmpPairSec: $("mtCmpPairSec"),
    cmpMembersSec: $("mtCmpMembersSec"),
    cmpM1Wrap: $("mtCmpM1Wrap"),
    cmpM2Wrap: $("mtCmpM2Wrap"),
    // infinitive (standalone panel)
    infWork: $("mtInfWork"),
    infSearch: $("mtInfSearch"),
    infSearchMenu: $("mtInfSearchMenu"),
    infDetail: $("mtInfDetail"),
    infDesc: $("mtInfDesc"),
    infChart: $("mtInfChart"),
    infTable: $("mtInfTable"),
    infSql: $("mtInfSql")
  };

  function showControls(view) {
    document.querySelectorAll(".mt-controls[data-for]").forEach((c) => {
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
    el.outDesc.textContent = "The co-occurrence of one morphosyntactic component (" + featLabel(a) +
      ") with another (" + featLabel(b) + ") inside the same word" +
      (pos ? ", restricted to " + UI.label("pos", pos) + "s" : "") + ".";
  }

  /* ---------------- View: paradigm slots ---------------- */

  // Only the features that are actually attested (non-empty, non "-") for the
  // chosen part of speech, computed in one pass over the table.
  const slotFeatCache = new Map();
  function featuresForPos(pos) {
    if (slotFeatCache.has(pos)) return slotFeatCache.get(pos);
    const feats = presentFeatures().filter((f) => f !== "pos");
    const sums = feats.map((f) =>
      "SUM(CASE WHEN " + q(f) + " IS NOT NULL AND " + q(f) + " <> '' AND " + q(f) + " <> '-' THEN 1 ELSE 0 END) AS " + q(f)
    ).join(",\n       ");
    const sql = "SELECT " + sums + "\nFROM " + q(TABLE) + "\nWHERE pos = " + sqlStr(pos) + ";";
    const row = SQL.objects(sql)[0] || {};
    const out = feats.filter((f) => Number(row[f]) > 0);
    slotFeatCache.set(pos, out);
    return out;
  }

  function refreshSlotFeatures() {
    const pos = el.slotPos.value;
    if (!pos) return;
    const prev = el.slotFeat.value;
    const feats = featuresForPos(pos);
    UI.fillSelect(el.slotFeat, feats, { head: null });
    [...el.slotFeat.options].forEach((o) => { o.textContent = featLabel(o.value); });
    if (feats.includes(prev)) el.slotFeat.value = prev;
    else if (pos === "v" && feats.includes("mood")) el.slotFeat.value = "mood";
    else if (feats.includes("case")) el.slotFeat.value = "case";
  }

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

  /* ---------------- Panel: nominal compounds ----------------
   * The analysis table (ncompounds_analysis) gives each compound's members
   * and their syntactic categories; the merged morphology table supplies the
   * metrical record of its inflected tokens (metrical_shape, foot_start,
   * foot_end); ncompounds_attestations gives the citations. The panel filters
   * compounds by member string, member category, and attesting work, then
   * shows the category-pairing heatmap, the metrical localization of the
   * matching compounds, and a clickable table of the compounds themselves. */

  // Metrical record per compound (keyed by lemma_search), joined once from
  // the merged morphology table: token count, starting-foot distribution,
  // and how many tokens run to the end of the line.
  let compoundMetrics = null;
  function buildCompoundMetrics() {
    if (compoundMetrics) return;
    compoundMetrics = new Map();
    SQL.objects(
      "SELECT m.lemma_search ls, m.foot_start ft, m.foot_end fe, COUNT(*) n\n" +
      "FROM " + q(TABLE) + " m\n" +
      "JOIN (SELECT DISTINCT lemma_search FROM " + q("ncompounds_analysis") + ") a\n" +
      "  ON a.lemma_search = m.lemma_search\n" +
      "WHERE m.match_status IN ('OK','OK_ELIDED','OK_FUZZY') AND m.foot_start IS NOT NULL\n" +
      "GROUP BY ls, ft, fe;").forEach((r) => {
      let e = compoundMetrics.get(r.ls);
      if (!e) { e = { tot: 0, start: [0, 0, 0, 0, 0, 0], end6: 0 }; compoundMetrics.set(r.ls, e); }
      const fi = (parseInt(r.ft, 10) || 0) - 1;
      if (fi >= 0 && fi <= 5) e.start[fi] += r.n;
      if (String(r.fe) === "6") e.end6 += r.n;
      e.tot += r.n;
    });
  }
  const CATLABEL = { "?": "uncertain", "a/n?": "adjective or noun (?)" };
  // A clickable Greek word: opens the site-wide attestation popup.
  function wlink(w) { return w ? '<span class="wlink" data-word="' + UI.esc(w) + '">' + UI.esc(w) + "</span>" : "\u2013"; }
  // Parse a line's concatenated H/L syllable string into "DDSDDS" etc.
  // (same derivation as the Scansion tab; null when the line does not
  // resolve into a well-formed hexameter).
  function parseFeet(shp) {
    if (!shp) return null;
    let out = "", i = 0;
    const n = shp.length;
    for (let f2 = 0; f2 < 6; f2++) {
      if (shp[i] !== "H") return null;
      if (f2 === 5) { if (n - i !== 2) return null; out += "S"; i += 2; }
      else if (shp.substr(i + 1, 2) === "LL") { out += "D"; i += 3; }
      else if (shp[i + 1] === "H") { out += "S"; i += 2; }
      else return null;
    }
    return i === n ? out : null;
  }
  // One line word by word, with the compound's own tokens highlighted, foot
  // boundaries marked with |, the bucolic diaeresis tinted, and the principal
  // caesurae marked with \u2016 (same conventions as the Scansion tab).
  function footSize(pattern, f2) { return pattern && pattern[f2 - 1] === "D" ? 3 : 2; }
  function wordMarks(shape, ft, fsp, pattern) {
    let f2 = parseInt(ft, 10), p2 = parseInt(fsp, 10) || 1;
    const parts = [];
    for (let k = 0; k < shape.length; k++) {
      if (k > 0 && p2 === 1 && pattern) parts.push('<span class="scan-fdiv">|</span>');
      parts.push(shape[k] === "H" ? "\u00af" : "\u02d8");
      p2++;
      if (pattern && p2 > footSize(pattern, f2)) { f2++; p2 = 1; }
    }
    return parts.join("\u2009");
  }
  function diaeresisMark(fe, fep, pattern) {
    if (!pattern || fe == null) return "";
    const f2 = parseInt(fe, 10), p2 = parseInt(fep, 10) || 1;
    if (!isFinite(f2) || f2 < 1 || f2 > 6) return "";
    if (p2 < footSize(pattern, f2)) return "";
    if (f2 === 4) return '<span class="scan-junc scan-bdia" title="bucolic diaeresis (word end at the close of foot 4)">|</span>';
    return '<span class="scan-junc scan-fdiv" title="foot boundary at word end (diaeresis)">|</span>';
  }
  // One principal caesura per line, chosen exactly as on the Scansion tab:
  // candidate mid-foot breaks (foot 3 masculine/feminine, foot 4
  // hephthemimeral) filtered by a light appositive heuristic; third foot
  // outranks hephthemimeral; two surviving third-foot breaks are both marked
  // dotted to signal that the position is uncertain.
  const POSTPOS = { "\u03b4\u03b5": 1, "\u03c4\u03b5": 1, "\u03b3\u03b5": 1, "\u03ba\u03b5": 1, "\u03ba\u03b5\u03bd": 1, "\u03b1\u03bd": 1, "\u03c1\u03b1": 1, "\u03b3\u03b1\u03c1": 1, "\u03bc\u03b5\u03bd": 1, "\u03b4\u03b7": 1, "\u03c0\u03b5\u03c1": 1, "\u03c4\u03bf\u03b9": 1, "\u03bd\u03c5": 1, "\u03bc\u03b9\u03bd": 1, "\u03bc\u03bf\u03b9": 1, "\u03bc\u03b5": 1, "\u03c3\u03b5": 1, "\u03c3\u03c6\u03b9": 1, "\u03c3\u03c6\u03b9\u03bd": 1, "\u03b4": 1, "\u03c4": 1, "\u03b3": 1, "\u03ba": 1, "\u03c1": 1, "\u03bc": 1, "\u03c3": 1 };
  const PREPOS = { "\u03ba\u03b1\u03b9": 1, "\u03bf\u03c5\u03b4\u03b5": 1, "\u03bc\u03b7\u03b4\u03b5": 1, "\u03bf\u03c5": 1, "\u03bf\u03c5\u03ba": 1, "\u03bf\u03c5\u03c7": 1, "\u03bc\u03b7": 1, "\u03b5\u03b9": 1, "\u03b1\u03bb\u03bb\u03b1": 1, "\u03b1\u03bb\u03bb": 1, "\u03b5\u03bd": 1, "\u03b5\u03bd\u03b9": 1, "\u03b5\u03ba": 1, "\u03b5\u03be": 1, "\u03b5\u03c3": 1, "\u03b5\u03b9\u03c3": 1, "\u03c0\u03c1\u03bf\u03c3": 1, "\u03c0\u03bf\u03c4\u03b9": 1, "\u03c0\u03b5\u03c1\u03b9": 1, "\u03c0\u03b1\u03c1\u03b1": 1, "\u03c0\u03b1\u03c1": 1, "\u03c5\u03c0\u03bf": 1, "\u03c5\u03c0": 1, "\u03b5\u03c0\u03b9": 1, "\u03b5\u03c0": 1, "\u03b1\u03c0\u03bf": 1, "\u03b1\u03c0": 1, "\u03b4\u03b9\u03b1": 1, "\u03ba\u03b1\u03c4\u03b1": 1, "\u03ba\u03b1\u03c4": 1, "\u03bc\u03b5\u03c4\u03b1": 1, "\u03bc\u03b5\u03c4": 1, "\u03c3\u03c5\u03bd": 1, "\u03be\u03c5\u03bd": 1, "\u03b1\u03bc\u03c6\u03b9": 1, "\u03b1\u03bd\u03b1": 1, "\u03b1\u03bd\u03c4\u03b9": 1, "\u03c5\u03c0\u03b5\u03c1": 1, "\u03c0\u03c1\u03bf": 1 };
  function caesuraHtml(cls, uncertain) {
    const name = cls === "masc" ? "penthemimeral (masculine) caesura"
      : cls === "fem" ? "trochaic (feminine) caesura" : "hephthemimeral caesura";
    if (uncertain) return '<span class="scan-junc scan-caes scan-caes-unc" title="' + name + ': position uncertain (two third-foot word breaks)">\u2016</span>';
    return '<span class="scan-junc scan-caes" title="' + name + '">\u2016</span>';
  }
  function caesuraPlan(toks, pattern) {
    const plan = {};
    if (!pattern) return plan;
    const okT = (t) => /^OK/.test(String(t.ms || "")) && t.ft != null;
    const third = [], heph = [];
    for (let i2 = 1; i2 < toks.length; i2++) {
      const prev = toks[i2 - 1], next = toks[i2];
      if (!okT(prev) || prev.fe == null) continue;
      const f2 = parseInt(prev.fe, 10), p2 = parseInt(prev.fep, 10) || 1;
      if (!isFinite(f2) || f2 < 1 || f2 > 6) continue;
      if (p2 >= footSize(pattern, f2)) continue;
      const cls = (f2 === 3 && p2 === 1) ? "masc"
        : (f2 === 3 && p2 === 2 && pattern[2] === "D") ? "fem"
        : (f2 === 4 && p2 === 1) ? "heph" : null;
      if (!cls) continue;
      if (POSTPOS[normalizeGreek(next.form)]) continue;
      if (PREPOS[normalizeGreek(prev.form)]) continue;
      (cls === "heph" ? heph : third).push({ i: i2, cls: cls });
    }
    if (third.length === 1) plan[third[0].i] = caesuraHtml(third[0].cls, false);
    else if (third.length > 1) third.forEach((c) => { plan[c.i] = caesuraHtml(c.cls, true); });
    else if (heph.length) plan[heph[0].i] = caesuraHtml("heph", false);
    return plan;
  }
  function renderLineScan(work, book, verse, hitKey) {
    const toks = SQL.objects("SELECT form, metrical_shape shp, foot_start ft, foot_start_pos fsp, foot_end fe, foot_end_pos fep, match_status ms, lemma_search ls FROM " +
      q(TABLE) + " WHERE work = " + sqlStr(work) + " AND book = " + sqlStr(String(book)) +
      " AND verse = " + sqlStr(String(verse)) + " ORDER BY CAST(sentence_id AS INTEGER), id;");
    let allShp = "", bad = 0;
    toks.forEach((t) => {
      if (!(/^OK/.test(String(t.ms || "")) && t.ft != null)) bad++;
      if (t.shp) allShp += t.shp;
    });
    const patt = bad ? null : parseFeet(allShp);
    const spans = toks.map((t) => {
      const ok = /^OK/.test(String(t.ms || "")) && t.ft != null;
      const hit = hitKey && t.ls === hitKey;
      const cls = "scan-w" + (ok ? (t.shp ? "" : " elided") : " unk") + (hit ? " hit" : "");
      const marks = ok ? (t.shp ? wordMarks(t.shp, t.ft, t.fsp, patt) : "\u2019") : "?";
      const feet = ok ? (t.fe && t.fe !== t.ft ? t.ft + "\u2013" + t.fe : String(t.ft)) : "";
      return '<span class="' + cls + '"><span class="scan-wm">' + marks +
        '</span><span class="scan-wt">' + UI.esc(t.form) + "</span>" + (feet ? "<sub>" + feet + "</sub>" : "") + "</span>";
    });
    const caes = caesuraPlan(toks, patt);
    const out = [];
    for (let i2 = 0; i2 < spans.length; i2++) {
      if (i2 > 0) {
        let jm = caes[i2] || "";
        if (!jm) {
          const prev = toks[i2 - 1];
          if (/^OK/.test(String(prev.ms || "")) && prev.fe != null && prev.shp) jm = diaeresisMark(prev.fe, prev.fep, patt);
        }
        if (jm) out.push(jm);
      }
      out.push(spans[i2]);
    }
    return '<div class="scan-line">' +
      '<div class="scan-ref">' + UI.esc(work + " " + book + "." + verse) +
      (patt ? ' <span class="scan-ds">' + patt + "</span>" : "") + "</div>" +
      '<div class="scan-wordscan">' + out.join(" ") + "</div></div>";
  }
  function catLabel(c) { return CATLABEL[c] || UI.label("pos", c); }
  // Label for a stem subcategory value (s-stem, thematic, …). Empty/missing
  // subcategory (categories like d, m, r carry none) reads "(no subcategory)".
  function subLabel(s) { return s ? s : "(no subcategory)"; }
  // H = heavy/long, L = light/short -> metrical marks (\u00af long, \u02d8 short,
  // both sitting on the same vertical level).
  function shapeMarks(shp) {
    return String(shp || "").split("").map((c) => (c === "H" ? "\u00af" : "\u02d8")).join("\u2009");
  }
  // Line text rebuilt from the merged morphology table (forms in order).
  function lineTextFor(work, book, line) {
    try {
      return SQL.scalar("SELECT GROUP_CONCAT(form, ' ' ORDER BY CAST(sentence_id AS INTEGER), id) FROM " + q(TABLE) +
        " WHERE work = " + sqlStr(work) + " AND book = " + sqlStr(String(book)) +
        " AND verse = " + sqlStr(String(line)) + ";") || "";
    } catch (e) { return ""; }
  }

  const attSetCache = new Map();
  function attestedSetFor(work) {
    if (attSetCache.has(work)) return attSetCache.get(work);
    const s = new Set(compoundAttestations
      .filter((a) => a.work === work)
      .map((a) => normalizeGreek(a.compound)));
    attSetCache.set(work, s);
    return s;
  }

  // One member box per slot. The values are the member1 / member2 attributes
  // of the compound analysis themselves: the combo browses them, and the
  // filter is an exact match against the chosen value (accent-insensitive
  // for Greek input, or via its Beta Code for Latin input).
  function memberNeedle(inputEl) {
    const raw = (inputEl.value || "").trim();
    if (!raw) return null;
    const T = window.MopsosText;
    const isGreek = T && T.hasGreek ? T.hasGreek(raw) : /[\u0370-\u03ff\u1f00-\u1fff]/.test(raw);
    return { raw: raw, greek: isGreek ? normalizeGreek(raw) : "", beta: (!isGreek && T) ? T.looseBetaKey(raw) : "" };
  }
  function memberHits(needle, member) {
    if (!needle || !member) return !needle;
    if (needle.greek) return normalizeGreek(member) === needle.greek;
    if (needle.beta) {
      const T = window.MopsosText;
      return T.looseBetaKey(T.toBetaCode(member)) === needle.beta;
    }
    return false;
  }
  function compoundFilters() {
    return {
      work: el.cmpWork.value,
      m1: memberNeedle(el.cmpM1),
      m2: memberNeedle(el.cmpM2),
      m1cat: el.cmpM1Cat.value,
      m2cat: el.cmpM2Cat.value,
      m1sub: el.cmpM1Sub ? el.cmpM1Sub.value : "",
      m2sub: el.cmpM2Sub ? el.cmpM2Sub.value : ""
    };
  }
  function filterLabel(f) {
    const bits = [];
    if (f.m1) bits.push("with first member \u201c" + f.m1.raw + "\u201d");
    if (f.m1cat) bits.push("with first member a " + catLabel(f.m1cat));
    if (f.m1sub) bits.push("with first member of the \u201c" + f.m1sub + "\u201d subcategory");
    if (f.m2) bits.push("with second member \u201c" + f.m2.raw + "\u201d");
    if (f.m2cat) bits.push("with second member a " + catLabel(f.m2cat));
    if (f.m2sub) bits.push("with second member of the \u201c" + f.m2sub + "\u201d subcategory");
    if (f.work) bits.push("attested in the " + f.work);
    return bits.join(", ");
  }
  function filteredCompounds(f) {
    buildCompoundData();
    let rows = compoundRows.slice();
    if (f.m1cat) rows = rows.filter((r) => r.member1_category === f.m1cat);
    if (f.m2cat) rows = rows.filter((r) => r.member2_category === f.m2cat);
    if (f.m1sub) rows = rows.filter((r) => r.member1_subcategory === f.m1sub);
    if (f.m2sub) rows = rows.filter((r) => r.member2_subcategory === f.m2sub);
    if (f.m1) rows = rows.filter((r) => memberHits(f.m1, r.member1));
    if (f.m2) rows = rows.filter((r) => memberHits(f.m2, r.member2));
    if (f.work) {
      const attested = attestedSetFor(f.work);
      rows = rows.filter((r) => attested.has(r.lemma_search));
    }
    return rows;
  }

  function renderCompoundPanel() {
    buildCompoundData();
    buildCompoundMetrics();
    const f = compoundFilters();
    const rows = filteredCompounds(f);
    const label = filterLabel(f);

    if (compoundDetailActive && compoundDetailKey && !rows.some((r) => r.lemma_search === compoundDetailKey)) {
      compoundDetailActive = false;
      compoundDetailKey = null;
      el.cmpDetail.innerHTML = "";
      el.cmpSearch.value = "";
    }
    el.cmpPairSec.hidden = compoundDetailActive;
    if (compoundDetailActive) {
      // the open record owns the page: population charts stand down, and the
      // localization section keeps showing that compound's evidence
      el.cmpMembersSec.hidden = true;
      return;
    }

    el.cmpSql.textContent =
      "SELECT lemma, lemma_search, segmentation, member1, member1_category, member1_subcategory, member2, member2_category, member2_subcategory\n" +
      "FROM " + q("ncompounds_analysis") + ";\n\n" +
      "SELECT m.lemma_search, m.foot_start, m.foot_end, COUNT(*)\n" +
      "FROM " + q(TABLE) + " m JOIN " + q("ncompounds_analysis") + " a ON a.lemma_search = m.lemma_search\n" +
      "WHERE m.match_status IN ('OK','OK_ELIDED','OK_FUZZY') AND m.foot_start IS NOT NULL\n" +
      "GROUP BY m.lemma_search, m.foot_start, m.foot_end;" +
      (label ? "\n-- filtered in-browser to compounds " + label : "");

    /* Category-pairing heatmap over the filtered compounds.
     *
     * By default each axis is keyed by member category (member1 on y, member2
     * on x). When a slot's category is pinned but its subcategory is left open
     * ("any subcategory"), that axis would otherwise collapse to a single row
     * or column, so we break it down by that slot's stem subcategory instead
     * (verb -> thematic / athematic / ?, and so on). Either axis can switch
     * independently, so a fully pinned pair can show subcategory x subcategory. */
    const m1BySub = !!(f.m1cat && !f.m1sub);
    const m2BySub = !!(f.m2cat && !f.m2sub);
    const rowField = m1BySub ? "member1_subcategory" : "member1_category";
    const colField = m2BySub ? "member2_subcategory" : "member2_category";
    const rowLbl = m1BySub ? subLabel : catLabel;
    const colLbl = m2BySub ? subLabel : catLabel;
    const rowHead = m1BySub ? "First-member subcategory" : "First member";
    const colHead = m2BySub ? "Second-member subcategory" : "Second member";
    // A row still needs both member categories to be placed on the matrix; the
    // subcategory switch only changes how a category-pinned axis is bucketed,
    // and empty subcategories fall under "(no subcategory)" rather than dropping.
    const hm = rows.filter((r) => r.member1_category && r.member2_category);
    if (!hm.length) { Chart.heatmap(el.cmpChart, [], [], []); el.cmpTable.innerHTML = ""; }
    else {
      const av = [...new Set(hm.map((r) => r[rowField] || ""))].sort((x, y) => rowLbl(x).localeCompare(rowLbl(y)));
      const bv = [...new Set(hm.map((r) => r[colField] || ""))].sort((x, y) => colLbl(x).localeCompare(colLbl(y)));
      const ai = new Map(av.map((v, i) => [v, i])), bi = new Map(bv.map((v, i) => [v, i]));
      const matrix = av.map(() => bv.map(() => 0));
      for (const r of hm) matrix[ai.get(r[rowField] || "")][bi.get(r[colField] || "")] += 1;
      Chart.heatmap(el.cmpChart, matrix,
        av.map(rowLbl), bv.map(colLbl),
        { valueLabel: "Compounds", showValues: av.length * bv.length <= 64,
          title: "Compound member " + (m1BySub || m2BySub ? "breakdown" : "categories") + (label ? " (" + label + ")" : ""),
          yLabel: m1BySub ? "first-member subcategory" : "first member",
          xLabel: m2BySub ? "second-member subcategory" : "second member" });
      const tbl = [];
      av.forEach((a, i) => bv.forEach((b, j) => { if (matrix[i][j]) tbl.push([rowLbl(a), colLbl(b), matrix[i][j]]); }));
      tbl.sort((x, y) => y[2] - x[2]);
      UI.renderTable(el.cmpTable, [rowHead, colHead, "Compounds"], tbl, { paginate: false });
    }
    const rowAxisName = m1BySub ? "first-member subcategory" : "first-member category";
    const colAxisName = m2BySub ? "second-member subcategory" : "second-member category";
    el.cmpDesc.textContent = "How often each (" + rowAxisName + ", " + colAxisName + ") pairing occurs among the " +
      (label ? "matching" : "analyzed") + " compounds" + (label ? " (" + label + ")" : "") +
      ". Categories reuse the part-of-speech codes; a \u201c?\u201d marks an uncertain member analysis in the source data" +
      ((m1BySub || m2BySub) ? ", and a pinned category with its subcategory left open is broken down by stem subcategory" : "") + ".";

    /* section visibility: the member charts vanish for a slot whose member
     * is already fixed (every match trivially shares it), and entirely while
     * one compound's record is open; the localization evidence appears only
     * once a member or category is actually selected. */
    const catOrMember = !!(f.m1 || f.m2 || f.m1cat || f.m2cat || f.m1sub || f.m2sub);
    el.cmpLocSec.hidden = !catOrMember;
    el.cmpM1Wrap.hidden = !!f.m1;
    el.cmpM2Wrap.hidden = !!f.m2;
    el.cmpMembersSec.hidden = compoundDetailActive || (!!f.m1 && !!f.m2);
    if (!catOrMember) { renderMemberCharts(rows, label); return; }

    /* metrical localization of the matching compounds */
    const keys = new Set(rows.map((r) => r.lemma_search));
    const agg = [0, 0, 0, 0, 0, 0];
    let tot = 0, end6 = 0, withTok = 0;
    keys.forEach((k) => {
      const m = compoundMetrics.get(k); if (!m) return;
      withTok++; tot += m.tot; end6 += m.end6;
      for (let i = 0; i < 6; i++) agg[i] += m.start[i];
    });
    if (tot) {
      Chart.bars(el.cmpLocChart, agg.map((v, i) => ({ label: "Foot " + (i + 1), value: v })),
        { preserveOrder: true, valueLabel: "tokens", labelWidth: 90,
          title: "Starting foot of " + (label ? "compounds " + label : "all analyzed compounds") });
      let best = 0;
      for (let i = 1; i < 6; i++) if (agg[i] > agg[best]) best = i;
      el.cmpLocNote.textContent = "Where " + (label ? "the matching" : "all analyzed") + " compounds sit in the verse: " +
        tot.toLocaleString() + " metrically aligned tokens of " + withTok + " compounds (of " + keys.size +
        " matching), counted by the foot each token begins in. " + Math.round(100 * agg[best] / tot) +
        "% begin in foot " + (best + 1) + "; " + Math.round(100 * end6 / tot) + "% run to the line end (last foot = 6).";
    } else {
      el.cmpLocChart.innerHTML = "";
      el.cmpLocNote.textContent = "No metrically aligned tokens in the corpus for the matching compounds.";
    }

    renderMemberCharts(rows, label);
  }

  // Which members the matching compounds are built from: pick a category (or
  // nothing) and see its commonest first and second members side by side.
  function renderMemberCharts(rows, label) {
    const tally = (field) => {
      const m = new Map();
      rows.forEach((r) => { const v = r[field]; if (v) m.set(v, (m.get(v) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([k, n]) => ({ label: k, value: n }));
    };
    const suffix = label ? " (" + label + ")" : "";
    const opts = (t) => ({ valueLabel: "compounds", labelWidth: 130, title: t + suffix,
      emptyMsg: "No matching compounds." });
    if (!el.cmpM1Wrap.hidden) Chart.bars(el.cmpM1Chart, tally("member1"), opts("Commonest first members"));
    if (!el.cmpM2Wrap.hidden) Chart.bars(el.cmpM2Chart, tally("member2"), opts("Commonest second members"));
  }

  /* ---------------- Panel: infinitive forms ---------------- */
  function renderInfinitivePanel() {
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
    el.infSql.textContent = sql;

    const rows = SQL.objects(sql);
    if (!rows.length) { Chart.heatmap(el.infChart, [], [], []); el.infTable.innerHTML = ""; return; }
    const TORDER = ["p", "i", "f", "a", "r", "l", "t"], VORDER = ["a", "m", "p", "e"];
    const av = [...new Set(rows.map((r) => r.a))].sort((x, y) => TORDER.indexOf(x) - TORDER.indexOf(y));
    const bv = [...new Set(rows.map((r) => r.b))].sort((x, y) => VORDER.indexOf(x) - VORDER.indexOf(y));
    const ai = new Map(av.map((v, i) => [v, i])), bi = new Map(bv.map((v, i) => [v, i]));
    const matrix = av.map(() => bv.map(() => 0));
    for (const r of rows) matrix[ai.get(r.a)][bi.get(r.b)] = r.n;

    Chart.heatmap(el.infChart, matrix, av.map((v) => UI.label("tense", v)), bv.map((v) => UI.label("voice", v)),
      { valueLabel: "Infinitives", showValues: true, interpolator: window.d3 ? window.d3.interpolateBlues : null,
        title: "Infinitives: tense \u00d7 voice" + (work ? " \u00b7 " + work : ""), yLabel: "tense", xLabel: "voice" });

    const tbl = rows.slice().sort((x, y) => y.n - x.n).map((r) => [UI.label("tense", r.a), UI.label("voice", r.b), r.n]);
    UI.renderTable(el.infTable, ["Tense", "Voice", "Tokens"], tbl, { paginate: false });

    el.infDesc.textContent = "Tense/voice combinations attested among infinitives (mood = infinitive)" + (work ? " in " + work : "") + ".";
  }

  /* ---------------- Compound & infinitive adaptive search ----------------
   * Both corpora here are small (hundreds to a few thousand rows), so the
   * candidate lists are simply fetched once and filtered in-browser via
   * MopsosUI.greekCombo, with no need for per-keystroke SQL round-trips. The
   * lemma_search column queried below is derived by scripts/build_corpus.py
   * from `lemma` / `compound`; the Beta Code each item carries is derived from
   * the Greek lemma in the browser via betaOf() (see scripts/greek_text.py for
   * the equivalent Python). ------------------------------------------------- */
  let compoundItems = null, compoundAttestations = null, infinitiveItems = null;
  let compoundRows = null, compoundByKey = null;
  let compoundDetailActive = false;
  let compoundDetailKey = null;

  function buildCompoundData() {
    if (compoundItems) return;
    compoundRows = SQL.objects(
      "SELECT lemma, lemma_search, segmentation, member1, member1_category, member1_subcategory, member2, member2_category, member2_subcategory\n" +
      "FROM " + q("ncompounds_analysis") + " ORDER BY lemma;");
    compoundItems = compoundRows.map((r) => ({
      key: r.lemma_search, display: r.lemma, beta: betaOf(r.lemma),
      meta: (r.member1 || "?") + " + " + (r.member2 || "?"), row: r
    }));
    compoundByKey = new Map();
    compoundItems.forEach((it) => { if (!compoundByKey.has(it.key)) compoundByKey.set(it.key, it); });
    compoundAttestations = SQL.objects("SELECT compound, work, book, line_num FROM " + q("ncompounds_attestations") + ";");
  }

  function renderCompoundDetail(item) {
    compoundDetailActive = true;
    compoundDetailKey = item.key;
    if (el.cmpMembersSec) el.cmpMembersSec.hidden = true;
    if (el.cmpPairSec) el.cmpPairSec.hidden = true;
    buildCompoundMetrics();
    const r = item.row;
    const m = compoundMetrics.get(item.key);
    const attested = compoundAttestations
      .filter((a) => normalizeGreek(a.compound) === item.key)
      .sort((a, b) => a.work.localeCompare(b.work) || Number(a.book) - Number(b.book) || Number(a.line_num) - Number(b.line_num));

    let html = '<table class="paradigm-table"><tbody>';
    html += "<tr><th>Compound</th><td>" + UI.esc(r.lemma) + "</td></tr>";
    html += "<tr><th>Beta Code</th><td><code>" + UI.esc(betaOf(r.lemma)) + "</code></td></tr>";
    if (r.segmentation) html += "<tr><th>Segmentation</th><td>" + UI.esc(r.segmentation) + "</td></tr>";
    html += "<tr><th>First member</th><td>" + wlink(r.member1) + " (" + UI.esc(catLabel(r.member1_category)) + ")</td></tr>";
    if (r.member1_subcategory) html += "<tr><th>First-member subcategory</th><td>" + UI.esc(r.member1_subcategory) + "</td></tr>";
    html += "<tr><th>Second member</th><td>" + wlink(r.member2) + " (" + UI.esc(catLabel(r.member2_category)) + ")</td></tr>";
    if (r.member2_subcategory) html += "<tr><th>Second-member subcategory</th><td>" + UI.esc(r.member2_subcategory) + "</td></tr>";
    html += "</tbody></table>";

    /* every occurrence in the corpus (all works), with rebuilt line text —
     * shown FIRST, before the metrical record and its charts */
    const occ = SQL.objects("SELECT work w, book b, CAST(verse AS INTEGER) v, COUNT(*) n FROM " + q(TABLE) +
      " WHERE lemma_search = " + sqlStr(item.key) + " AND verse IS NOT NULL AND verse <> ''" +
      " GROUP BY w, b, v ORDER BY w, CAST(b AS INTEGER), v;");
    if (occ.length) {
      const perWork = new Map();
      let nTok = 0;
      occ.forEach((o) => { perWork.set(o.w, (perWork.get(o.w) || 0) + o.n); nTok += o.n; });
      const workBits = [...perWork.entries()].map(([w2, n2]) => w2 + " " + n2).join(", ");
      html += '<p class="small-muted" style="margin:.6rem 0 .25rem;"><strong>Occurrences in the corpus</strong>: ' +
        nTok + " token" + (nTok === 1 ? "" : "s") + " in " + occ.length + " line" + (occ.length === 1 ? "" : "s") +
        " (" + UI.esc(workBits) + ")</p>";
      const withText = occ.slice(0, 8);
      html += withText.map((o) => {
        const t = lineTextFor(o.w, o.b, o.v);
        return '<div class="scan-ex">' + UI.esc(o.w + " " + o.b + "." + o.v + (t ? ": " + t : "")) + "</div>";
      }).join("");
      if (occ.length > withText.length) {
        const rest = occ.slice(withText.length, withText.length + 40)
          .map((o) => o.w + " " + o.b + "." + o.v).join(", ");
        html += '<p class="small-muted" style="margin:.3rem 0 0;">Also at: ' + UI.esc(rest) +
          (occ.length > withText.length + 40 ? ", \u2026" : "") + "</p>";
      }
    } else if (attested.length) {
      // no corpus tokens for this spelling: fall back to the catalogue's citations
      html += '<p class="small-muted" style="margin:.6rem 0 .25rem;"><strong>Catalogue citations</strong> (' + attested.length +
        "\u00d7; the compound catalogue records these, but the corpus has no aligned tokens of this spelling)</p>";
      html += attested.slice(0, 12).map((a) => '<div class="scan-ex">' + UI.esc(a.work + " " + a.book + "." + a.line_num) + "</div>").join("");
    } else {
      html += '<p class="small-muted" style="margin-top:.5rem;">Not attested in the corpus under this spelling.</p>';
    }

    /* metrical record: attested forms with their shapes, starting feet, and
     * the lines (book.verse) where each placement occurs */
    const formToks = SQL.objects(
      "SELECT form, metrical_shape shp, foot_start ft, foot_start_pos fsp, foot_end fe, work w, book b, CAST(verse AS INTEGER) v\n" +
      "FROM " + q(TABLE) + "\n" +
      "WHERE lemma_search = " + sqlStr(item.key) + "\n" +
      "  AND match_status IN ('OK','OK_ELIDED','OK_FUZZY') AND foot_start IS NOT NULL\n" +
      "ORDER BY work, CAST(book AS INTEGER), v;");
    if (m && m.tot) {
      let best = 0;
      for (let i = 1; i < 6; i++) if (m.start[i] > m.start[best]) best = i;
      html += '<p class="small-muted" style="margin:.6rem 0 .25rem;"><strong>Metrical positions</strong>: most often begins in foot ' +
        (best + 1) + " (" + Math.round(100 * m.start[best] / m.tot) + "% of placements); " +
        Math.round(100 * m.end6 / m.tot) + "% of placements run to the line end.</p>";
      html += '<div id="mtCmpDetChart" style="margin:.2rem 0 .4rem;"></div>';
      // every distinct placement the compound takes in the verse, each with
      // the lines it occurs at (grouped by work; long lists are capped)
      const placeMap = new Map();
      formToks.forEach((fr) => {
        const posLab = String(fr.fsp) === "1" ? "on the princeps" : "in the biceps";
        const k2 = fr.form + "|" + fr.shp + "|" + fr.ft + "|" + fr.fe + "|" + posLab;
        let p2 = placeMap.get(k2);
        if (!p2) { p2 = { form: fr.form, shp: fr.shp, ft: fr.ft, fe: fr.fe, posLab: posLab, refs: [] }; placeMap.set(k2, p2); }
        p2.refs.push({ w: fr.w, b: fr.b, v: fr.v });
      });
      const REF_CAP = 6;
      const refCell = (refs) => {
        const shown = refs.slice(0, REF_CAP);
        const byWork = new Map();
        shown.forEach((o) => {
          if (!byWork.has(o.w)) byWork.set(o.w, []);
          byWork.get(o.w).push(o.b + "." + o.v);
        });
        let s2 = [...byWork.entries()].map(([w2, ls]) => w2 + " " + ls.join(", ")).join("; ");
        if (refs.length > REF_CAP) s2 += " (+" + (refs.length - REF_CAP) + " more)";
        return s2;
      };
      const places = [...placeMap.values()];
      places.sort((a2, b2) => Number(a2.ft) - Number(b2.ft) || a2.form.localeCompare(b2.form, "el"));
      html += '<table class="paradigm-table"><thead><tr><th>Form</th><th>Metrical shape</th><th>Feet</th><th>Begins</th><th>Lines</th></tr></thead><tbody>' +
        places.map((p2) =>
          "<tr><td>" + wlink(p2.form) + "</td>" +
          '<td><span class="scan-marks">' + shapeMarks(p2.shp) + "</span></td>" +
          "<td>" + UI.esc(p2.fe && p2.fe !== p2.ft ? p2.ft + "\u2013" + p2.fe : String(p2.ft)) + "</td>" +
          "<td>" + UI.esc(p2.posLab) + "</td>" +
          "<td>" + UI.esc(refCell(p2.refs)) + "</td></tr>").join("") +
        "</tbody></table>";
    } else {
      html += '<p class="small-muted" style="margin-top:.5rem;">No metrically aligned tokens of this compound in the corpus, so no metrical record to show.</p>';
    }

    el.cmpDetail.innerHTML = html;
    renderCompoundLocalization(item, occ);
    if (m && m.tot) {
      const det = document.getElementById("mtCmpDetChart");
      if (det) Chart.bars(det, m.start.map((v, i) => ({ label: "Foot " + (i + 1), value: +(100 * v / m.tot).toFixed(1) })),
        { preserveOrder: true, valueLabel: "% of placements", labelWidth: 90, title: "Starting foot of " + r.lemma,
          valueFormat: (v) => v + "%" });
    }
  }

  // Metrical localization for one chosen compound: the commonest whole-line
  // patterns it appears in, with the feet the compound occupies highlighted;
  // the first few lines scanned word by word; and a button for all of them.
  function renderCompoundLocalization(item, occ) {
    el.cmpLocSec.hidden = false;
    const wrap = el.cmpLocChart.closest && el.cmpLocChart.closest(".viz-wrap");
    if (wrap) wrap.classList.remove("fig-fit", "fig-full");
    if (!occ.length) {
      el.cmpLocNote.textContent = "No occurrences of " + item.display + " in the corpus, so no localization evidence to show.";
      el.cmpLocChart.innerHTML = "";
      return;
    }
    const cap = 200;
    const lines = occ.slice(0, cap);
    // one query for every token of every line containing the compound
    const toks = SQL.objects(
      "SELECT m.work w, m.book b, CAST(m.verse AS INTEGER) v, m.metrical_shape shp, m.foot_start ft, m.foot_end fe, m.match_status ms, m.lemma_search ls\n" +
      "FROM " + q(TABLE) + " m JOIN (SELECT DISTINCT work, book, verse FROM " + q(TABLE) +
      " WHERE lemma_search = " + sqlStr(item.key) + " AND verse IS NOT NULL AND verse <> '') L\n" +
      "  ON m.work = L.work AND m.book = L.book AND m.verse = L.verse\n" +
      "ORDER BY m.work, CAST(m.book AS INTEGER), CAST(m.verse AS INTEGER), CAST(m.sentence_id AS INTEGER), m.id;");
    const perLine = new Map();
    toks.forEach((t) => {
      const k2 = t.w + "|" + t.b + "|" + t.v;
      let L2 = perLine.get(k2);
      if (!L2) { L2 = { shp: "", bad: 0, ft: null, fe: null }; perLine.set(k2, L2); }
      if (!(/^OK/.test(String(t.ms || "")) && t.ft != null)) L2.bad++;
      if (t.shp) L2.shp += t.shp;
      if (t.ls === item.key && L2.ft == null) { L2.ft = parseInt(t.ft, 10); L2.fe = parseInt(t.fe, 10) || parseInt(t.ft, 10); }
    });
    const tally = new Map();
    let und = 0;
    perLine.forEach((L2) => {
      const patt = L2.bad ? null : parseFeet(L2.shp);
      if (!patt || !L2.ft) { und++; return; }
      const k3 = patt + "|" + L2.ft + "|" + L2.fe;
      tally.set(k3, (tally.get(k3) || 0) + 1);
    });
    el.cmpLocNote.textContent = "Where " + item.display + " sits in the verse: the commonest whole-line patterns it occurs in (the feet the compound occupies are highlighted), then its lines scanned word by word.";
    const pattRows = [...tally.entries()].sort((a2, b2) => b2[1] - a2[1]).slice(0, 10)
      .map(([k3, n2]) => {
        const [patt, ft, fe] = k3.split("|");
        const cells = patt.split("").map((c2, i2) =>
          '<span class="cmp-patt-foot' + (i2 + 1 >= +ft && i2 + 1 <= +fe ? " hit" : "") + '">' + c2 + "</span>").join("");
        return "<tr><td><span class=\"cmp-patt\">" + cells + "</span></td><td style=\"text-align:right;\">" + n2 + "</td></tr>";
      }).join("");
    let html = '<table class="paradigm-table" style="max-width:340px;"><thead><tr><th>Line pattern</th><th>Lines</th></tr></thead><tbody>' +
      pattRows + "</tbody></table>" +
      (und ? '<p class="small-muted" style="margin:.25rem 0 .4rem;">' + und + " line" + (und === 1 ? "" : "s") + " without a fully derivable pattern.</p>" : "");
    const sample = lines.slice(0, 3);
    html += '<div class="scan-passage" style="margin-top:.5rem;">' +
      sample.map((o) => renderLineScan(o.w, o.b, o.v, item.key)).join("") + "</div>";
    if (occ.length > sample.length) {
      html += '<div class="btn-row" style="margin-top:.4rem;"><button class="btn btn-sm" id="mtCmpScanBtn">Scan every line with this compound (' + occ.length + ")</button></div>" +
        '<div id="mtCmpScanOut" style="margin-top:.4rem;"></div>';
    }
    el.cmpLocChart.innerHTML = html;
    const scanBtn = document.getElementById("mtCmpScanBtn");
    if (scanBtn) scanBtn.addEventListener("click", () => {
      const out = document.getElementById("mtCmpScanOut");
      const cap2 = 40;
      const rest = occ.slice(sample.length, cap2);
      out.innerHTML = '<div class="scan-passage">' +
        rest.map((o) => renderLineScan(o.w, o.b, o.v, item.key)).join("") + "</div>" +
        (occ.length > cap2 ? '<p class="small-muted">Showing the first ' + cap2 + " of " + occ.length + " lines.</p>" : "");
      scanBtn.disabled = true;
    });
  }

  function wireCompoundCombo() {
    UI.greekCombo(el.cmpSearch, el.cmpSearchMenu, {
      items() {
        buildCompoundData();
        // browse only the compounds the current filters allow, so the list
        // refreshes with every option change; unfiltered = the full catalogue
        const rows = filteredCompounds(compoundFilters());
        if (rows.length === compoundRows.length) return compoundItems;
        const allowed = new Set(rows.map((r) => r.lemma_search));
        return compoundItems.filter((it) => allowed.has(it.key));
      },
      onSelect(it) { el.cmpSearch.value = it.display; renderCompoundDetail(it); }
    });
    // emptying the lookup closes the record and brings the member charts back
    el.cmpSearch.addEventListener("input", () => {
      if ((el.cmpSearch.value || "").trim()) return;
      if (!compoundDetailActive) return;
      compoundDetailActive = false;
      compoundDetailKey = null;
      el.cmpDetail.innerHTML = "";
      renderCompoundPanel();
    });
  }

  function buildInfinitiveData() {
    if (infinitiveItems) return;
    const rows = SQL.objects(
      "SELECT lemma, lemma_search, count(*) AS n\n" +
      "FROM " + q(TABLE) + "\n" +
      "WHERE pos = 'v' AND mood = 'n' AND lemma IS NOT NULL AND lemma <> ''\n" +
      "GROUP BY lemma, lemma_search ORDER BY n DESC;");
    infinitiveItems = rows.map((r) => ({ key: r.lemma_search, display: r.lemma, beta: betaOf(r.lemma), meta: r.n + "\u00d7", lemma: r.lemma }));
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
    el.infDetail.innerHTML = '<table class="paradigm-table"><thead><tr><th>Form</th><th>Tense</th><th>Voice</th><th>Tokens</th></tr></thead><tbody>' +
      rows.map((r) => "<tr><td>" + wlink(r.form) + "</td><td>" + UI.esc(UI.label("tense", r.tense)) + "</td><td>" +
        UI.esc(UI.label("voice", r.voice)) + '</td><td style="text-align:right;">' + r.n + "</td></tr>").join("") +
      "</tbody></table>";
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
    // slots: the feature list depends on the chosen part of speech
    UI.fillSelect(el.slotPos, posValues, { head: null, field: "pos" });
    el.slotPos.value = posValues.includes("v") ? "v" : posValues[0];
    refreshSlotFeatures();
    el.slotPos.addEventListener("change", refreshSlotFeatures);
    // infinitive panel
    UI.fillSelect(el.infWork, SQL.distinct("work"), { head: "(all works)" });
    el.infWork.addEventListener("change", renderInfinitivePanel);
    wireInfinitiveCombo();
    // compound panel (own table; guarded in case an older cached database predates it)
    let compoundsOk = true;
    try {
      buildCompoundData();
      UI.fillSelect(el.cmpWork,
        [...new Set(compoundAttestations.map((a) => a.work))].sort(),
        { head: "(all works)" });
      const catSelect = (sel, values) => {
        UI.fillSelect(sel, values, { head: "(any)" });
        [...sel.options].forEach((o) => { if (o.value) o.textContent = catLabel(o.value); });
      };
      catSelect(el.cmpM1Cat, [...new Set(compoundRows.map((r) => r.member1_category).filter(Boolean))].sort((a, b) => catLabel(a).localeCompare(catLabel(b))));
      catSelect(el.cmpM2Cat, [...new Set(compoundRows.map((r) => r.member2_category).filter(Boolean))].sort((a, b) => catLabel(a).localeCompare(catLabel(b))));
      // Subcategories (stem classes: s-stem, thematic, and so on) exist only
      // where the analysis records one; each list adapts to the chosen
      // category, keeps a still-valid selection, and disables when the chosen
      // category carries no subcategories at all.
      const refreshSubcats = () => {
        const fill = (sel, field, catField, cat) => {
          if (!sel) return;
          const keep = sel.value;
          const values = [...new Set(compoundRows
            .filter((r) => (!cat || r[catField] === cat) && r[field])
            .map((r) => r[field]))].sort((a, b) => a.localeCompare(b));
          UI.fillSelect(sel, values, { head: "(any subcategory)" });
          if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
          sel.disabled = !values.length;
        };
        fill(el.cmpM1Sub, "member1_subcategory", "member1_category", el.cmpM1Cat.value);
        fill(el.cmpM2Sub, "member2_subcategory", "member2_category", el.cmpM2Cat.value);
      };
      refreshSubcats();
      [el.cmpWork, el.cmpM1Sub, el.cmpM2Sub].forEach((c) => { if (c) c.addEventListener("change", renderCompoundPanel); });
      [el.cmpM1Cat, el.cmpM2Cat].forEach((c) => c.addEventListener("change", () => { refreshSubcats(); renderCompoundPanel(); }));
      // one adaptive combo per member slot, fed by the members actually
      // attested in that slot (with their category and compound count)
      const memberItems = (field, catField) => {
        const T = window.MopsosText;
        const m = new Map();
        compoundRows.forEach((r) => {
          const v = r[field]; if (!v) return;
          let e2 = m.get(v);
          if (!e2) { e2 = { n: 0, cat: r[catField] }; m.set(v, e2); }
          e2.n += 1;
        });
        return [...m.entries()].sort((a, b) => b[1].n - a[1].n).map(([v, e2]) => ({
          key: T ? T.stripDiacritics(v) : v, display: v,
          beta: T ? T.toBetaCode(v) : "",
          meta: (e2.cat ? catLabel(e2.cat) + " \u00b7 " : "") + e2.n
        }));
      };
      const m1List = memberItems("member1", "member1_category");
      const m2List = memberItems("member2", "member2_category");
      const wireMember = (input, menu, items) => {
        UI.greekCombo(input, menu, {
          items() { return items; },
          onSelect(it) { input.value = it.display; renderCompoundPanel(); }
        });
        let t2 = null;
        input.addEventListener("input", () => { clearTimeout(t2); t2 = setTimeout(renderCompoundPanel, 250); });
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); renderCompoundPanel(); } });
      };
      wireMember(el.cmpM1, el.cmpM1Menu, m1List);
      wireMember(el.cmpM2, el.cmpM2Menu, m2List);
      wireCompoundCombo();
    } catch (e) {
      compoundsOk = false;
      el.cmpWork.disabled = true;
      el.cmpDetail.innerHTML = '<p class="small-muted">Compound data not available: ' + UI.esc(e.message) + "</p>";
    }

    el.run.disabled = false;
    // Standalone panels render immediately; the picker card waits for a click.
    if (compoundsOk) { try { renderCompoundPanel(); } catch (e) { el.cmpChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Error: ' + UI.esc(e.message) + "</div>"; } }
    try { renderInfinitivePanel(); } catch (e) { el.infChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Error: ' + UI.esc(e.message) + "</div>"; }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
