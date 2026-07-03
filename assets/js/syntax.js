/* ============================================================================
 *  SYNTAX TAB
 *  Driven by the shared corpus database (the same merged table the Scansion
 *  tab reads), not by a bundled CSV. Each token carries a signed dependency
 *  distance (distance = id - head, 0 = root), so the head of every word is
 *  recovered as head = id - distance and full dependency trees can be drawn
 *  for any sentence of the corpus. Because the same tokens also carry their
 *  metrical record (foot_end / foot_end_pos, verse), the tab can measure the
 *  syntax-metre interface directly: where sentences end inside the verse,
 *  how much enjambment there is, and how many dependency arcs cross a line
 *  boundary. A manual TSV mode remains for pasting external trees.
 * ========================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const SQL = window.MopsosSQL;
  const UI = window.MopsosUI;
  const Chart = window.MopsosChart;
  const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const el = {};
  function grab() {
    ["syntaxLoadStatus", "syntaxWork", "syntaxBook", "syntaxLine", "btnSyntaxDraw", "syntaxSentSel", "syntaxSentWrap",
     "syntaxInput", "btnSyntaxTsv",
     "syntaxSummary", "syntaxDepSvg", "syntaxPhrase", "syntaxTable", "syntaxPicked",
     "syntaxMetreWork", "btnSyntaxMetre", "syntaxMetreSummary", "syntaxSentEnd", "syntaxHeadDir", "syntaxDepLen", "syntaxMetreNote"]
      .forEach((id) => { el[id] = $(id); });
  }

  /* ----- tokens of one corpus sentence, heads recovered from distance ----- */
  function sentenceTokens(work, sid) {
    const rows = SQL.objects("SELECT id, form, lemma, pos, distance, book, verse FROM morphology WHERE work = " +
      sqlStr(work) + " AND sentence_id = " + sqlStr(sid) + " ORDER BY id;");
    const ids = new Set(rows.map((r) => r.id));
    rows.forEach((r) => {
      const d = Number(r.distance);
      const head = Number.isFinite(d) && d !== 0 ? r.id - d : 0;
      r.head = ids.has(head) ? head : 0;   // roots and broken links hang from 0
      r.deprel = "";
    });
    return rows;
  }

  function sentencesAtLine(work, book, line) {
    return SQL.objects("SELECT DISTINCT sentence_id s FROM morphology WHERE work = " + sqlStr(work) +
      " AND book = " + sqlStr(String(book)) + " AND verse = " + sqlStr(String(line)) +
      " ORDER BY CAST(sentence_id AS INTEGER);").map((r) => r.s);
  }

  /* ----- manual TSV fallback ---------------------------------------------- */
  function parseInputTsv(text) {
    const sentences = [];
    let cur = [];
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { if (cur.length) { sentences.push(cur); cur = []; } continue; }
      const p = line.split(/\t+/);
      if (p.length < 4) continue;
      const id = parseInt(p[0], 10);
      if (!Number.isFinite(id)) continue;
      cur.push({ id, form: p[1] || "", lemma: p[2] || "", pos: p[3] || "",
        head: Number.isFinite(parseInt(p[4], 10)) ? parseInt(p[4], 10) : 0,
        deprel: p[5] || "", distance: Number.isFinite(parseInt(p[6], 10)) ? parseInt(p[6], 10) : null });
    }
    if (cur.length) sentences.push(cur);
    return sentences;
  }

  /* ----- renderers --------------------------------------------------------- */
  function renderSummary(rows, meta) {
    const roots = rows.filter((x) => x.head === 0).length;
    const dists = rows.map((r) => Math.abs(Number(r.distance) || (r.head ? r.head - r.id : 0))).filter((d) => d > 0);
    const mean = dists.length ? (dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(2) : "\u2013";
    const cards = [
      ["Tokens", rows.length],
      ["Roots / unattached", roots],
      ["Mean dependency length", mean]
    ];
    if (meta) cards.unshift(["Sentence", meta]);
    el.syntaxSummary.innerHTML = '<div class="analysis-grid">' + cards.map((c) =>
      '<div class="analysis-card"><div class="metric">' + esc(c[1]) + '</div><div class="metric-label">' + esc(c[0]) + "</div></div>").join("") + "</div>";
  }

  function renderDepTree(rows) {
    const n = Math.max(rows.length, 1);
    const step = Math.max(46, Math.min(90, Math.floor(1400 / n)));
    const w = Math.max(760, 120 + n * step);
    const H = 460, y = H - 70;
    el.syntaxDepSvg.setAttribute("viewBox", "0 0 " + w + " " + H);
    const x = new Map(rows.map((r, i) => [r.id, 60 + i * step]));
    let html = '<rect x="0" y="0" width="' + w + '" height="' + H + '" fill="#f8fafc" rx="12"/>';
    for (const r of rows) {
      const tx = x.get(r.id), hx = x.get(r.head);
      if (!tx) continue;
      if (!hx || r.head === 0) {
        html += '<line x1="' + tx + '" y1="60" x2="' + tx + '" y2="' + (y - 20) + '" stroke="#64748b" stroke-dasharray="4 4"/>';
      } else {
        const mid = (tx + hx) / 2, h = Math.min(300, 44 + Math.abs(tx - hx) * 0.3);
        html += '<path d="M ' + hx + " " + (y - 20) + " Q " + mid + " " + (y - h) + " " + tx + " " + (y - 20) + '" fill="none" stroke="#4f46e5" stroke-width="2"/>';
        if (r.deprel) html += '<text x="' + (mid - 18) + '" y="' + (y - h - 6) + '" font-size="11" fill="#1e293b">' + esc(r.deprel) + "</text>";
      }
    }
    for (const r of rows) {
      const cx = x.get(r.id);
      html += '<circle cx="' + cx + '" cy="' + (y - 20) + '" r="15" fill="#0891b2"/>';
      html += '<text x="' + cx + '" y="' + (y - 15) + '" text-anchor="middle" font-size="10" fill="#fff">' + r.id + "</text>";
      html += '<text x="' + cx + '" y="' + (y + 14) + '" text-anchor="middle" font-size="14" fill="#0f172a">' + esc(r.form) + "</text>";
      html += '<text x="' + cx + '" y="' + (y + 32) + '" text-anchor="middle" font-size="11" fill="#64748b">' + esc(UI.label("pos", r.pos)) + "</text>";
    }
    el.syntaxDepSvg.innerHTML = html;
  }

  function renderPhrase(rows) {
    const child = new Map();
    for (const r of rows) { if (!child.has(r.head)) child.set(r.head, []); child.get(r.head).push(r); }
    for (const v of child.values()) v.sort((a, b) => a.id - b.id);
    const roots = rows.filter((r) => r.head === 0);
    function walk(node, d) {
      const pad = "  ".repeat(d);
      const kids = child.get(node.id) || [];
      if (!kids.length) return pad + "(" + node.pos + ":" + node.form + ")";
      return pad + "(" + node.pos + ":" + node.form + "\n" + kids.map((k) => walk(k, d + 1)).join("\n") + "\n" + pad + ")";
    }
    el.syntaxPhrase.textContent = roots.length ? "(S\n" + roots.map((r) => walk(r, 1)).join("\n") + "\n)" : "(S)";
  }

  function renderTable(rows) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    UI.renderTable(el.syntaxTable, ["id", "form", "lemma", "pos", "head", "distance"],
      rows.map((r) => [r.id, r.form, r.lemma, UI.label("pos", r.pos), r.head ? r.head + " (" + (byId.get(r.head) || {}).form + ")" : "root",
        Number.isFinite(Number(r.distance)) ? Number(r.distance) : ""]),
      { paginate: rows.length > 60, pageSize: 60 });
  }

  function drawSentence(work, sid) {
    const rows = sentenceTokens(work, sid);
    if (!rows.length) { el.syntaxSummary.innerHTML = '<p class="small-muted">No tokens found for that sentence.</p>'; return; }
    const books = [...new Set(rows.map((r) => r.book))];
    const vs = rows.map((r) => parseInt(r.verse, 10)).filter(Number.isFinite);
    const span = books[0] + "." + Math.min.apply(null, vs) + (vs.length > 1 && Math.min.apply(null, vs) !== Math.max.apply(null, vs) ? "\u2013" + Math.max.apply(null, vs) : "");
    el.syntaxPicked.textContent = work + " " + span + " \u00b7 sentence " + sid +
      " \u00b7 heads recovered from the corpus dependency distances (unlabelled).";
    renderSummary(rows, work + " " + span);
    renderDepTree(rows);
    renderPhrase(rows);
    renderTable(rows);
  }

  function drawFromPicker() {
    const work = el.syntaxWork.value;
    const book = el.syntaxBook.value;
    const line = parseInt(el.syntaxLine.value, 10);
    if (!work || !book || !Number.isFinite(line)) return;
    const sids = sentencesAtLine(work, book, line);
    if (!sids.length) {
      el.syntaxSummary.innerHTML = '<p class="small-muted">No sentence found at ' + esc(work + " " + book + "." + line) + ".</p>";
      return;
    }
    if (sids.length > 1) {
      el.syntaxSentWrap.hidden = false;
      UI.fillSelect(el.syntaxSentSel, sids, { head: null });
      if (![...el.syntaxSentSel.options].some((o) => o.value === el.syntaxSentSel.value)) el.syntaxSentSel.value = sids[0];
    } else {
      el.syntaxSentWrap.hidden = true;
    }
    drawSentence(work, sids.length > 1 ? el.syntaxSentSel.value : sids[0]);
  }

  function drawFromTsv() {
    const sentences = parseInputTsv(el.syntaxInput.value);
    if (!sentences.length) return;
    el.syntaxPicked.textContent = "Manual TSV input.";
    const rows = sentences[0];
    renderSummary(rows, "manual");
    renderDepTree(rows);
    renderPhrase(rows);
    renderTable(rows);
  }

  /* ----- syntax meets the metre -------------------------------------------
   * All computed live from the corpus: sentence ends located by the metrical
   * position of the sentence-final token; enjambment as the share of lines
   * whose final word does not end its sentence; and dependency arcs checked
   * for whether head and dependent share a line. Cached per work scope. */
  const metreCache = {};
  function metreScope() {
    const conds = ["verse IS NOT NULL AND verse <> ''"];
    const w = el.syntaxMetreWork.value;
    conds.push(w ? "work = " + sqlStr(w) : "work IN ('Iliad','Odyssey')");
    return conds.join(" AND ");
  }

  function runMetre() {
    const key = el.syntaxMetreWork.value || "(both)";
    let M = metreCache[key];
    if (!M) {
      const scope = metreScope();
      M = {};
      // sentence-final tokens and their metrical position
      M.ends = SQL.objects(
        "WITH last AS (SELECT work, sentence_id, MAX(id) mid FROM morphology WHERE " + scope + " GROUP BY work, sentence_id) " +
        "SELECT m.foot_end fe, m.foot_end_pos fep, COUNT(*) n FROM morphology m " +
        "JOIN last L ON m.work = L.work AND m.sentence_id = L.sentence_id AND m.id = L.mid " +
        "WHERE m.foot_end IS NOT NULL GROUP BY fe, fep;");
      // enjambment: is the line-final word also sentence-final?
      const enj = SQL.objects(
        "WITH ord AS (SELECT work, book, verse, sentence_id, id, " +
        "  ROW_NUMBER() OVER (PARTITION BY work, book, verse ORDER BY CAST(sentence_id AS INTEGER) DESC, id DESC) rn " +
        "  FROM morphology WHERE " + scope + "), " +
        "smax AS (SELECT work, sentence_id, MAX(id) mid FROM morphology WHERE " + scope + " GROUP BY work, sentence_id) " +
        "SELECT SUM(CASE WHEN s.mid = o.id THEN 1 ELSE 0 END) closed, COUNT(*) lines " +
        "FROM ord o JOIN smax s ON s.work = o.work AND s.sentence_id = o.sentence_id WHERE o.rn = 1;")[0] || {};
      M.lines = enj.lines || 0;
      M.closed = enj.closed || 0;
      // dependency arcs and whether they cross a line boundary
      const wv = el.syntaxMetreWork.value;
      const workCondA = wv ? "a.work = " + sqlStr(wv) : "a.work IN ('Iliad','Odyssey')";
      const arcs = SQL.objects(
        "SELECT COUNT(*) total, SUM(CASE WHEN a.verse <> b.verse THEN 1 ELSE 0 END) crossing " +
        "FROM morphology a JOIN morphology b ON b.work = a.work AND b.sentence_id = a.sentence_id " +
        "AND b.id = a.id - CAST(a.distance AS INTEGER) " +
        "WHERE a.verse IS NOT NULL AND a.verse <> '' AND " + workCondA +
        " AND a.distance IS NOT NULL AND a.distance <> 0 AND b.verse IS NOT NULL;")[0] || {};
      M.arcTotal = arcs.total || 0;
      M.arcCross = arcs.crossing || 0;
      // head direction and dependency length by part of speech
      M.byPos = SQL.objects(
        "SELECT pos, SUM(CASE WHEN distance > 0 THEN 1 ELSE 0 END) before, " +
        "SUM(CASE WHEN distance < 0 THEN 1 ELSE 0 END) after, AVG(ABS(distance)) mlen " +
        "FROM morphology WHERE " + scope + " AND distance IS NOT NULL AND distance <> 0 " +
        "AND pos IS NOT NULL AND pos NOT IN ('','-') GROUP BY pos ORDER BY (before + after) DESC;");
      M.lenHist = SQL.objects(
        "SELECT MIN(CAST(ABS(distance) AS INTEGER), 15) d, COUNT(*) n FROM morphology WHERE " + scope +
        " AND distance IS NOT NULL AND distance <> 0 GROUP BY d ORDER BY d;");
      metreCache[key] = M;
    }
    const wlab = el.syntaxMetreWork.value || "Iliad + Odyssey";

    // classify sentence-end positions
    const buckets = { end: 0, masc: 0, fem: 0, buc: 0, other: 0 };
    let sents = 0;
    M.ends.forEach((r) => {
      const f = parseInt(r.fe, 10), p = parseInt(r.fep, 10);
      sents += r.n;
      if (f === 6 && p >= 2) buckets.end += r.n;
      else if (f === 3 && p === 1) buckets.masc += r.n;
      else if (f === 3 && p === 2) buckets.fem += r.n;
      else if (f === 4 && p === 3) buckets.buc += r.n;
      else buckets.other += r.n;
    });
    Chart.bars(el.syntaxSentEnd, [
      { label: "line end", value: buckets.end },
      { label: "masculine caesura point (3.1)", value: buckets.masc },
      { label: "feminine caesura point (3.2)", value: buckets.fem },
      { label: "bucolic diaeresis (close of foot 4)", value: buckets.buc },
      { label: "elsewhere in the line", value: buckets.other }
    ], { preserveOrder: true, valueLabel: "sentence ends", labelWidth: 240,
         title: "Where sentences end in the verse \u00b7 " + wlab });

    const posRows = M.byPos.slice(0, 10);
    Chart.groupedBars(el.syntaxHeadDir,
      posRows.map((r) => [r.before, r.after]),
      posRows.map((r) => UI.label("pos", r.pos)),
      ["head precedes", "head follows"],
      { valueLabel: "tokens", title: "Head direction by part of speech \u00b7 " + wlab,
        xLabel: "part of speech of the dependent", yLabel: "tokens" });

    Chart.bars(el.syntaxDepLen,
      M.lenHist.map((r) => ({ label: r.d >= 15 ? "15+" : String(r.d), value: r.n })),
      { preserveOrder: true, valueLabel: "dependencies", labelWidth: 70,
        title: "Dependency length (words between head and dependent) \u00b7 " + wlab });

    const enjPct = M.lines ? (100 * (M.lines - M.closed) / M.lines) : 0;
    const crossPct = M.arcTotal ? (100 * M.arcCross / M.arcTotal) : 0;
    el.syntaxMetreSummary.innerHTML = '<div class="analysis-grid">' + [
      ["Sentences", sents.toLocaleString()],
      ["Lines", M.lines.toLocaleString()],
      ["Enjambed lines (sentence runs on)", enjPct.toFixed(1) + "%"],
      ["Dependency arcs", M.arcTotal.toLocaleString()],
      ["Arcs crossing a line boundary", M.arcCross.toLocaleString() + " (" + crossPct.toFixed(1) + "%)"]
    ].map((c) => '<div class="analysis-card"><div class="metric">' + c[1] + '</div><div class="metric-label">' + esc(c[0]) + "</div></div>").join("") + "</div>";

    el.syntaxMetreNote.textContent = "Sentence boundaries are the treebank's; positions are read from each sentence-final token's metrical record (the 3.1 / 3.2 buckets are the word positions where the caesurae fall; the bucolic bucket is a word end at 4.3). An enjambed line is one whose final word does not end its sentence. Dependency heads are recovered from the stored signed distances. Note the treebank's attachment conventions when reading the head-direction chart: a preposition HEADS its noun phrase and itself attaches to the verb it modifies, so \u201chead follows\u201d dominating for prepositions reflects Greek's late verbs (the prepositional phrase usually precedes its verb), while nouns governed by a preposition show \u201chead precedes\u201d, the familiar preposition-before-noun order.";
  }

  /* ----- init -------------------------------------------------------------- */
  function populateBooks() {
    const work = el.syntaxWork.value;
    if (!work) { el.syntaxBook.innerHTML = ""; return; }
    const books = SQL.query("SELECT DISTINCT book FROM morphology WHERE work = " + sqlStr(work) +
      " ORDER BY CAST(book AS INTEGER);").values.map((r) => r[0]);
    UI.fillSelect(el.syntaxBook, books, { head: null });
  }

  function init() {
    grab();
    if (!el.syntaxDepSvg) return; // not on this page

    el.btnSyntaxDraw.addEventListener("click", drawFromPicker);
    el.syntaxLine.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); drawFromPicker(); } });
    el.syntaxSentSel.addEventListener("change", () => drawSentence(el.syntaxWork.value, el.syntaxSentSel.value));
    el.syntaxWork.addEventListener("change", populateBooks);
    if (el.btnSyntaxTsv) el.btnSyntaxTsv.addEventListener("click", drawFromTsv);
    el.btnSyntaxMetre.addEventListener("click", runMetre);
    el.syntaxMetreWork.addEventListener("change", runMetre);

    SQL.ready().then(() => {
      if (el.syntaxLoadStatus) el.syntaxLoadStatus.style.display = "none";
      UI.fillSelect(el.syntaxWork, SQL.distinct("work"), { head: null });
      const works = [...el.syntaxWork.options].map((o) => o.value);
      if (works.includes("Iliad")) el.syntaxWork.value = "Iliad";
      populateBooks();
      UI.fillSelect(el.syntaxMetreWork, ["Iliad", "Odyssey"].filter((w) => works.includes(w)), { head: "(both poems)" });
      el.btnSyntaxDraw.disabled = false;
      el.btnSyntaxMetre.disabled = false;
      drawFromPicker();
      runMetre();
    }).catch((e) => {
      if (el.syntaxLoadStatus) el.syntaxLoadStatus.innerHTML = "<span>Could not load corpus: " + esc(e.message) + "</span>";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
