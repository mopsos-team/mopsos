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
  const Search = window.MopsosSearch;
  const q = SQL.quoteId;
  const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

  // Feature columns, and which we show by default when no POS is chosen.
  const FEATURE_COLS = ["number", "case", "gender", "tense", "mood", "voice", "person", "degree"];
  const DEFAULT_FEATURES = ["number", "case", "gender", "tense", "mood"];
  // Columns the dropdown query selects (when present in the table).
  const PREVIEW_COLS = ["work", "book", "verse", "form", "lemma", "pos", "person",
    "number", "tense", "mood", "voice", "gender", "case"];
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


  /* ----- Quick filter ------------------------------------------------------
   * The card itself — scope drop-downs, word searches, the read-only SQL
   * console that IS the query, and SQL-paged results — is the shared
   * MopsosSearch card (mopsos-shared.js). This page only adds the
   * part-of-speech feature drop-downs to it, through the hooks passed to
   * Search.card() in init() below. */

  let qf = null;

  /* ----- Explore & visualize --------------------------------------------- */

  let ex = null;

  /* The adaptive lemma search (Greek, accents optional; Beta Code) now rides
   * on the shared corpus lemma list: MopsosSearch.lemmaItems / .resolveLemmata. */

  function explorerFilters() {
    const all = Object.assign({}, ex.read());
    const wk = $("exLimitWork").value; if (wk) all.work = wk;
    const au = $("exLimitAuthor").value; if (au) all.author = au;
    return all;
  }

  /* One lemma, or several comma-separated lemmata, restricting the charts:
   * each part is resolved adaptively (Greek with or without accents, Beta
   * Code, or English) to a corpus lemma, and the counts are then computed
   * over just those lemmata — so the distribution of μῆνις, or of μῆνις +
   * χόλος + κότος together, can be charted by work, book, case, and so on
   * (choose "Lemma" as a dimension to compare them side by side). */
  function exLemmaCond() {
    const box = $("exLemmata");
    const raw = box ? (box.value || "").trim() : "";
    if (!raw) return { cond: "", label: "", lemmas: [] };
    const lemmas = [];
    raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => {
      const seeds = Search.resolveLemmata(p);
      if (seeds.length && lemmas.indexOf(seeds[0]) < 0) lemmas.push(seeds[0]);
    });
    if (!lemmas.length) return { cond: "0", label: " (no corpus lemma matches \u201c" + raw + "\u201d)", lemmas: [] };
    return {
      cond: q("lemma") + " IN (" + lemmas.map(sqlStr).join(", ") + ")",
      label: " (lemma" + (lemmas.length === 1 ? "" : "ta") + ": " + lemmas.join(", ") + ")",
      lemmas
    };
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
    const lw = $("exLemmataWrap"); if (lw) lw.hidden = (type === "paradigm");
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
    const lx = exLemmaCond();
    const w = [whereOf(filters), lx.cond].filter(Boolean).join(" AND ");
    const topN = parseInt($("exTopN").value, 10) || 20;
    const semQuery = ($("exSemantic").value || "").trim();
    const chart = $("exChart"), title = $("exTitle"), desc = $("exDesc");
    const filterText = filterTextOf(filters) + lx.label;
    $("exTable").innerHTML = "";

    try {
      if (semQuery) {
        const unit = "lemma"; // meaning search is lemma-based
        const proceed = () => {
          try {
            const seeds = Search.resolveLemmata(semQuery);
            if (!seeds.length) {
              chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No corpus lemma matches \u201C' + UI.esc(semQuery) +
                '\u201D. Type a Greek lemma (accents optional) or Beta Code (e.g. mhnis), or click the box to browse the lemma list.</div>';
              title.textContent = ""; desc.textContent = ""; return;
            }
            // The seeds plus the lemmata that actually share a sentence with
            // them most often, straight from the corpus (no learned model).
            const seedIn = seeds.map(sqlStr).join(", ");
            const coRows = SQL.objects("SELECT b.lemma t, COUNT(*) w FROM " + q(TABLE) + " a JOIN " + q(TABLE) + " b " +
              "ON a.work = b.work AND a.sentence_id = b.sentence_id AND b.lemma <> a.lemma " +
              "WHERE a.lemma IN (" + seedIn + ") AND b.pos IN ('n','v','a') AND b.lemma NOT IN ('','-')" +
              (w ? " AND " + w.replace(/"(\w+)"/g, 'b."$1"') : "") +
              " GROUP BY t ORDER BY w DESC LIMIT " + Math.min(topN, 40) + ";");
            const ids = seeds.slice();
            coRows.forEach((r) => { if (ids.indexOf(r.t) < 0) ids.push(r.t); });
            const freqMap = {};
            SQL.objects("SELECT " + q(unit) + " AS k, COUNT(*) AS c FROM " + q(TABLE) +
              " WHERE " + q(unit) + " IN (" + ids.map(sqlStr).join(", ") + ")" + (w ? " AND " + w : "") + " GROUP BY k;")
              .forEach((r) => { freqMap[r.k] = r.c; });
            buildNetworkFrom(ids.slice(0, Math.min(topN, 40) + seeds.length), freqMap, w, unit,
              "Words sharing a sentence with " + seeds.map((s) => "\u201C" + s + "\u201D").join(", "),
              "Sentence co-occurrence" + filterText + ". ");
          } catch (e) {
            chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Search error: ' + UI.esc(e.message) + "</div>";
          }
        };
        proceed();
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
    const lx = exLemmaCond();
    const w = [whereOf(filters), lx.cond].filter(Boolean).join(" AND ");
    const dim1 = $("exDim1").value;
    const dim2 = $("exDim2").value;
    const topN = parseInt($("exTopN").value, 10) || 20;
    const title = $("exTitle");
    const desc = $("exDesc");
    const chart = $("exChart");
    const filterText = filterTextOf(filters) + lx.label;
    $("exTable").innerHTML = "";

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
            { valueLabel: "tokens", showValues: rowVals.length <= 15 && colVals.length <= 15,
              title: UI.fieldTitle(dim1) + " \u00d7 " + UI.fieldTitle(d2) + filterText,
              yLabel: UI.fieldTitle(dim1), xLabel: UI.fieldTitle(d2) });
        } else if (type === "grouped") {
          title.textContent = UI.fieldTitle(dim1) + " by " + UI.fieldTitle(d2);
          desc.textContent = "Token counts, grouped to compare " + UI.fieldTitle(d2) + " across each " + UI.fieldTitle(dim1) + filterText + ".";
          Chart.groupedBars(chart, matrix, rowLabels, colLabels, { valueLabel: "tokens", emptyMsg: "No tokens match.",
            title: UI.fieldTitle(dim1) + " by " + UI.fieldTitle(d2) + filterText,
            xLabel: UI.fieldTitle(dim1), yLabel: "tokens" });
        } else {
          const pct = matrix.map((row) => {
            const s = row.reduce((a, b) => a + b, 0) || 1;
            return row.map((v) => +(100 * v / s).toFixed(1));
          });
          title.textContent = "Composition of " + UI.fieldTitle(dim1) + " by " + UI.fieldTitle(d2);
          desc.textContent = "Each bar is one " + UI.fieldTitle(dim1) + " value, split into the % share of each " + UI.fieldTitle(d2) + filterText + ".";
          Chart.stackedBars(chart, pct, rowLabels, colLabels, { valueLabel: "%", emptyMsg: "No tokens match.",
            title: "Composition of " + UI.fieldTitle(dim1) + " by " + UI.fieldTitle(d2) + filterText,
            xLabel: UI.fieldTitle(dim1), yLabel: "% of tokens" });
        }
      } else if (type === "paradigm") {
        const input = ($("exLemma").value || "").trim();
        if (!input) {
          chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Type a lemma above (e.g. \u03bd\u03b1\u1fe6\u03c2, \u03b8\u03b5\u03cc\u03c2, \u03bb\u1f7b\u03c9) to lay out its full paradigm: every attested form, organised by the inflectional properties that actually vary for it.</div>';
          title.textContent = ""; desc.textContent = ""; return;
        }
        // exact Greek, accent-insensitive Greek, Beta Code, or English all resolve
        const seeds = Search.resolveLemmata(input);
        let lemma = seeds.length ? seeds[0] : null;
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
          ? forms.slice().sort((a, b) => b[1] - a[1]).map((x) => '<span class="pdg-form wlink" data-word="' + UI.esc(x[0]) + '">' + UI.esc(x[0]) + '</span><span class="pdg-c">' + x[1] + "</span>").join("<br>")
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
            other.sort((a, b) => b[1] - a[1]).map((x) => '<span class="pdg-form wlink" data-word="' + UI.esc(x[0]) + '">' + UI.esc(x[0]) + "</span>").join(", ") + "</p>";
        } else if (varying.length === 1) {
          const f1 = varying[0], cell = {};
          sortedVals(f1).forEach((v) => cell[v] = []);
          rows.forEach((r) => { const a = r[KEY[f1]]; if (a && a !== "-") cell[a].push([r.form, r.n]); });
          html += '<table class="data-table paradigm-table"><thead><tr><th>' + UI.esc(UI.fieldTitle(f1)) + "</th><th>Form(s)</th></tr></thead><tbody>";
          sortedVals(f1).forEach((v) => { html += "<tr><th>" + UI.esc(displayName(f1, v)) + "</th><td>" + formCell(cell[v]) + "</td></tr>"; });
          html += "</tbody></table>";
        } else if (varying.length === 0) {
          html += '<table class="data-table paradigm-table"><thead><tr><th>Form</th><th>Words</th></tr></thead><tbody>' +
            rows.slice().sort((a, b) => b.n - a.n).map((r) => '<tr><td><span class="pdg-form wlink" data-word="' + UI.esc(r.form) + '">' + UI.esc(r.form) + "</span></td><td>" + r.n + "</td></tr>").join("") + "</tbody></table>";
        } else {
          // three or more distinguishing dimensions (verbs, 3-termination adjectives): flat inventory
          html += '<table class="data-table paradigm-table"><thead><tr>';
          varying.forEach((f) => { html += "<th>" + UI.esc(UI.fieldTitle(f)) + "</th>"; });
          html += "<th>Form</th><th>Words</th></tr></thead><tbody>";
          rows.slice().sort((a, b) => {
            for (const f of varying) { const d = rank(f, a[KEY[f]]) - rank(f, b[KEY[f]]); if (d) return d; }
            return b.n - a.n;
          }).forEach((r) => {
            html += "<tr>";
            varying.forEach((f) => { const v = r[KEY[f]]; html += "<td>" + (v && v !== "-" ? UI.esc(displayName(f, v)) : '<span class="pdg-gap">\u2013</span>') + "</td>"; });
            html += '<td><span class="pdg-form wlink" data-word="' + UI.esc(r.form) + '">' + UI.esc(r.form) + '</span></td><td>' + r.n + "</td></tr>";
          });
          html += "</tbody></table>";
        }
        chart.innerHTML = html;
      } else {
        const sql = "SELECT " + q(dim1) + " AS k, COUNT(*) AS c FROM " + q(TABLE) +
          " WHERE " + naGuard(dim1) + (w ? " AND " + w : "") +
          " GROUP BY k ORDER BY c DESC LIMIT " + topN + ";";
        const rows = SQL.objects(sql);
        title.textContent = "Word count by " + UI.fieldTitle(dim1);
        desc.textContent = "Top " + rows.length + " values" + filterText + ".";
        Chart.bars(chart, rows.map((r) => ({ label: displayName(dim1, r.k), value: r.c })),
          { valueLabel: "count", emptyMsg: "No words match.",
            title: "Word count by " + UI.fieldTitle(dim1) + filterText });
        $("exTable").innerHTML = Search.renderTable([dim1, "count"], rows.map((r) => [r.k, r.c]));
      }
    } catch (e) {
      chart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Chart error: ' + UI.esc(e.message) + "</div>";
    }
  }

  /* ----- init ------------------------------------------------------------- */

  // The Infinitive Search panel is the same shared MopsosSearch card, pinned
  // to infinitives (pos = 'v' AND mood = 'n') and carrying the allomorph and
  // metrical filters through the card's hooks, the way the scansion page
  // carries its own. Every drop-down and shape browse offers the values
  // attested among the corpus infinitives.
  const INF_WHERE = "pos = 'v' AND mood = 'n'";
  const INF_SELECTS = [["infTense", "tense"], ["infVoice", "voice"],
    ["infConjugation", "conjugation"]];
  const INF_SHAPES = [["infStemShape", "infStemShapeMenu", "metrical_stem_shape"],
    ["infShape", "infShapeMenu", "metrical_shape"]];
  const INF_CONTROLS = INF_SELECTS.concat([["infMorpheme"]], INF_SHAPES).map(([id]) => id);

  /* The morpheme column stores allomorph numbers whose meaning depends on the
   * conjugation class; the sigmatic and contract classes carry their own tags
   * under the future tense ("future thematic" ‑σειν and future contract
   * ‑ειν). Edit this table to change the tags; a (class, number) combination
   * not listed here falls back to its raw number. */
  const INF_ENDING_TAGS = {
    t:  { name: "thematic",        tags: { "1": "\u2011ειν", "2": "\u2011έμεν", "3": "\u2011έμεναι", "4": "\u2011έειν", "5": "analogical / epic creation", "6": "contracted" } },
    a:  { name: "athematic",       tags: { "1": "\u2011ναι", "2": "\u2011μεν", "3": "\u2011μεναι" } },
    s:  { name: "sigmatic",        tags: { "1": "\u2011σαι" } },
    sf: { name: "future thematic", tags: { "1": "\u2011σειν", "2": "\u2011σέμεν", "3": "\u2011σέμεναι" } },
    c:  { name: "contract",        tags: { "1": "\u2011ειν", "2": "\u2011έμεν", "3": "\u2011έμεναι", "4": "\u2011έειν", "5": "analogical / epic creation", "6": "contracted" } },
    cf: { name: "future contract", tags: { "1": "\u2011ειν" } }
  };
  function infEndingClass(conj, tense) {
    return ((conj === "s" || conj === "c") && tense === "f") ? conj + "f" : conj;
  }
  function infEndingTag(conj, tense, m) {
    const cls = INF_ENDING_TAGS[infEndingClass(conj, tense)];
    return (cls && cls.tags[String(m)]) || "";
  }

  /* The ending-type drop-down offers the attested (class, number) pairs,
   * each shown by its tag; without a conjugation it lists every class's
   * endings on its own, and picking a conjugation narrows it to that class
   * (plus its future variant, for sigmatic and contract). */
  function fillInfEndingSelect() {
    const sel = $("infMorpheme");
    const conj = $("infConjugation").value;
    const prev = sel.value;
    const rows = SQL.objects("SELECT conjugation cj, tense t, morpheme m, COUNT(*) c FROM " + q(TABLE) +
      " WHERE " + INF_WHERE + " AND " + naGuard("morpheme") + " AND " + naGuard("conjugation") +
      " GROUP BY cj, t, m;");
    const opts = new Map();
    rows.forEach((r) => {
      if (conj && String(r.cj) !== conj) return;
      const cls = infEndingClass(String(r.cj), String(r.t));
      const key = cls + "|" + r.m;
      const o = opts.get(key) || { cls: cls, m: String(r.m), n: 0 };
      o.n += r.c; opts.set(key, o);
    });
    const order = ["t", "a", "s", "sf", "c", "cf"];
    const list = [...opts.values()].sort((x, y) =>
      (order.indexOf(x.cls) - order.indexOf(y.cls)) || (Number(x.m) - Number(y.m)));
    sel.innerHTML = '<option value="">(any)</option>';
    list.forEach((o) => {
      const cls = INF_ENDING_TAGS[o.cls];
      const opt = document.createElement("option");
      opt.value = o.cls + "|" + o.m;
      opt.textContent = ((cls && cls.tags[o.m]) || ("morpheme " + o.m)) +
        (cls ? " \u00b7 " + cls.name : "");
      sel.appendChild(opt);
    });
    if ([...sel.options].some((op) => op.value === prev)) sel.value = prev;
  }

  function initInfinitiveCard() {
    INF_SELECTS.forEach(([id, col]) => {
      let vals = SQL.objects("SELECT DISTINCT " + q(col) + " AS v FROM " + q(TABLE) +
        " WHERE " + INF_WHERE + " AND " + naGuard(col) + " ORDER BY v;").map((r) => String(r.v));
      // Only active and passive are offered: the medial and mediopassive
      // infinitives are still being processed (see the (i) note by the label).
      if (col === "voice") vals = vals.filter((v) => v === "a" || v === "p");
      UI.fillSelect($(id), vals, { head: "(any)", field: col });
    });
    fillInfEndingSelect();
    $("infConjugation").addEventListener("change", fillInfEndingSelect);
    // The exact-lemma browse (and its resolution on Apply) is restricted to
    // the lemmata that actually have infinitives in the corpus.
    let infLemmas = null;
    const infLemmaItems = () => {
      if (infLemmas) return infLemmas;
      const T = window.MopsosText;
      infLemmas = SQL.objects("SELECT lemma l, lemma_search k, COUNT(*) c FROM " + q(TABLE) +
        " WHERE " + INF_WHERE + " AND lemma NOT IN ('','-') GROUP BY l, k ORDER BY c DESC;")
        .map((r) => ({ key: r.k || (T ? T.stripDiacritics(r.l) : r.l), display: r.l,
                       beta: T ? T.toBetaCode(r.l) : "", meta: r.c + "\u00d7" }));
      return infLemmas;
    };
    const card = Search.card({
      lemmaItems: infLemmaItems,
      prefix: "inf",
      applyBtn: "btnInfApply",
      resetBtn: "btnInfReset",
      previewCols: ["work", "book", "verse", "form", "lemma", "tense", "voice",
        "conjugation", "morpheme", "metrical_stem_shape", "metrical_shape"],
      baseConds: ["match_status <> \"CONFLICT_NO_MATCH\"", "pos = 'v'", "mood = 'n'",
        "(conjugation IS NOT NULL OR morpheme IS NOT NULL)"],
      worksWhere: INF_WHERE,
      orderBy: '"work", CAST(book AS INTEGER), CAST(verse AS INTEGER)',
      // the Morpheme cell shows the row's ending tag (from its conjugation,
      // tense, and allomorph number); unmapped combinations keep the number
      transformResult(columns, values) {
        const lc = columns.map((c) => String(c).toLowerCase());
        const mi = lc.indexOf("morpheme"), ci = lc.indexOf("conjugation"), ti = lc.indexOf("tense");
        if (mi < 0 || ci < 0) return null;
        return { columns, values: values.map((row) => {
          const tag = infEndingTag(String(row[ci]), ti < 0 ? "" : String(row[ti]), row[mi]);
          if (!tag) return row;
          const out = row.slice(); out[mi] = tag; return out;
        }) };
      },
      extraConds() {
        const out = [];
        INF_SELECTS.forEach(([id, col]) => {
          const v = $(id).value;
          if (v) out.push(Search.niceId(col) + " = " + Search.sqlStr(v));
        });
        // an ending type pins its allomorph number and conjugation class; the
        // future classes (sf, cf) additionally pin tense = 'f', and the plain
        // sigmatic and contract endings exclude it (their future variants
        // share the same numbers)
        const em = $("infMorpheme").value;
        if (em) {
          const i = em.indexOf("|");
          const cls = em.slice(0, i), m = em.slice(i + 1), cj = cls.charAt(0);
          out.push(Search.niceId("morpheme") + " = " + Search.sqlStr(m));
          out.push(Search.niceId("conjugation") + " = " + Search.sqlStr(cj));
          if (cls.length > 1) out.push(Search.niceId("tense") + " = 'f'");
          else if (cj === "s" || cj === "c") out.push(Search.niceId("tense") + " <> 'f'");
        }
        INF_SHAPES.forEach(([id, , col]) => {
          const v = ($(id).value || "").trim().toUpperCase();
          if (v) out.push(Search.niceId(col) + " = " + Search.sqlStr(v));
        });
        return out;
      },
      onLock(on) { INF_CONTROLS.forEach((id) => { $(id).disabled = !on; }); },
      onReset() { INF_CONTROLS.forEach((id) => { $(id).value = ""; }); fillInfEndingSelect(); }
    });
    // The shape boxes work like the scansion card's: freetext with a browse of
    // the attested shapes, narrowed as the user types; picking one only fills
    // the box, and typed input is uppercased into the query as-is.
    const shapeCache = {};
    INF_SHAPES.forEach(([id, menuId, col]) => {
      UI.greekCombo($(id), $(menuId), {
        items() {
          if (!shapeCache[col]) {
            shapeCache[col] = SQL.objects("SELECT " + q(col) + " AS s, COUNT(*) c FROM " + q(TABLE) +
              " WHERE " + INF_WHERE + " AND " + naGuard(col) + " GROUP BY s ORDER BY c DESC;")
              .map((r) => ({ key: String(r.s).toLowerCase(), display: String(r.s), beta: String(r.s), meta: r.c + "\u00d7" }));
          }
          return shapeCache[col];
        },
        onSelect(it) { $(id).value = it.display; }
      });
      $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); card.apply(); } });
    });
  }

  /* ------------------------------------------------------------------------
   *  INFINITIVE VISUALIZATIONS
   *  Descriptive figures of allomorph choice, drawn straight from the corpus.
   *  Each figure is a live query over the same infinitive slice the Filter
   *  card uses; the classifier-derived diagnostics are deliberately not here.
   *  Endings are bucketed by the SAME (conjugation, tense, morpheme) -> tag
   *  map the Filter card uses (infEndingClass / INF_ENDING_TAGS), with the two
   *  descriptive numbers ("5"/"6") shown as Analogical / Contracted.
   * ---------------------------------------------------------------------- */
  const VIZ_BASE = INF_WHERE + " AND match_status <> \"CONFLICT_NO_MATCH\"" +
    " AND (conjugation IS NOT NULL OR morpheme IS NOT NULL)";
  const WORK_ORDER = ["Iliad", "Odyssey", "Theogony", "Works and Days"];
  const CONJ_NAME = { t: "Thematic", a: "Athematic", s: "Sigmatic", c: "Contract" };
  const TENSE_NAME = { p: "Present", a: "Aorist", r: "Perfect", f: "Future" };
  const VOICE_NAME = { a: "Active", p: "Passive" };

  /* Canonical allomorph buckets: display order + the fixed colours used in the
   * paper's figures (edit a colour here and every figure follows). */
  const ALLO = [
    ["\u2011ειν", "#1f9bd6"], ["\u2011έειν", "#8fcdea"], ["\u2011έμεν", "#2f9e44"],
    ["\u2011έμεναι", "#95d4a3"], ["\u2011μεν", "#7d2a86"], ["\u2011μεναι", "#e493c3"],
    ["\u2011ναι", "#f2ce5b"], ["\u2011σαι", "#d21f26"], ["\u2011σειν", "#9c2c1c"],
    ["\u2011σέμεν", "#cd8a78"], ["\u2011σέμεναι", "#efc9c2"],
    ["Contracted", "#a6a6a6"], ["Analogical", "#111111"]
  ];
  const ALLO_ORDER = ALLO.map((a) => a[0]);
  const ALLO_COLOR = Object.fromEntries(ALLO);

  function chartAllo(conj, tense, m) {
    const cls = INF_ENDING_TAGS[infEndingClass(String(conj || ""), String(tense || ""))];
    const raw = cls && cls.tags[String(m)];
    if (!raw) return null;
    if (/analog/i.test(raw)) return "Analogical";
    if (/contract/i.test(raw)) return "Contracted";
    return raw;
  }

  /* dark ink on light fills, white on dark fills, chosen by luminance */
  function idealText(hex) {
    const c = hex.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#1f2937" : "#ffffff";
  }

  /* "Lemma/Form contains" for the viz filters: same accent-insensitive,
   * #-anchored substring match the Filter card runs against the diacritic-free
   * *_search columns (reuses MopsosSearch.searchKey for the normalisation). */
  function vizLikeCond(col, el) {
    const raw = el ? String(el.value || "").trim() : "";
    if (!raw) return null;
    let start = false, end = false, core = raw;
    if (core.charAt(0) === "#") { start = true; core = core.slice(1); }
    if (core.slice(-1) === "#") { end = true; core = core.slice(0, -1); }
    const k = (Search && Search.searchKey) ? Search.searchKey(core) : core.toLowerCase();
    if (!k) return null;
    if (start && end) return q(col) + " = " + sqlStr(k);
    if (start) return q(col) + " LIKE " + sqlStr(k + "%");
    if (end) return q(col) + " LIKE " + sqlStr("%" + k);
    return q(col) + " LIKE " + sqlStr("%" + k + "%");
  }

  /* The optional pre-viz filters (tense, voice, conjugation, ending type,
   * lemma, form), mirroring the Filter card. Returns an AND-joined fragment
   * that narrows the slice fed to every preset figure, or "" when nothing is
   * set. Injected once, in vizRows, so all figures honour it. */
  function vizFilterWhere() {
    const out = [];
    [["infVizTense", "tense"], ["infVizVoice", "voice"], ["infVizConjugation", "conjugation"]]
      .forEach(([id, col]) => { const v = $(id) && $(id).value; if (v) out.push(q(col) + " = " + sqlStr(v)); });
    const em = $("infVizMorpheme") && $("infVizMorpheme").value;
    if (em) {
      const i = em.indexOf("|");
      const cls = em.slice(0, i), m = em.slice(i + 1), cj = cls.charAt(0);
      out.push(q("morpheme") + " = " + sqlStr(m));
      out.push(q("conjugation") + " = " + sqlStr(cj));
      if (cls.length > 1) out.push(q("tense") + " = 'f'");
      else if (cj === "s" || cj === "c") out.push(q("tense") + " <> 'f'");
    }
    const lc = vizLikeCond("lemma_search", $("infVizLemmaLike")); if (lc) out.push(lc);
    const fc = vizLikeCond("form_search", $("infVizFormLike")); if (fc) out.push(fc);
    return out.join(" AND ");
  }

  /* pull grouped (conjugation, tense, morpheme, …extra) counts over the slice */
  function vizRows(extraWhere, extraCols) {
    const cols = ["conjugation cj", "tense t", "morpheme m"].concat(extraCols || []);
    const grp = cols.map((s) => q(s.split(" ")[0])).join(", ");
    const w = andWhere(VIZ_BASE, vizFilterWhere(), extraWhere);
    return SQL.objects("SELECT " + cols.map((s) => {
      const p = s.split(" "); return p.length > 1 ? q(p[0]) + " " + p[1] : q(p[0]);
    }).join(", ") + ", COUNT(*) c FROM " + q(TABLE) + " WHERE " + w + " GROUP BY " + grp + ";");
  }

  /* rows -> [{label, n, counts:{allo:n}}], grouped by keyFn(row) */
  function accumulate(rows, keyFn) {
    const map = new Map();
    rows.forEach((r) => {
      const label = keyFn(r);
      if (label == null || label === "") return;
      const a = chartAllo(r.cj, r.t, r.m);
      if (!a) return;
      let g = map.get(label);
      if (!g) { g = { label: label, n: 0, counts: {} }; map.set(label, g); }
      g.counts[a] = (g.counts[a] || 0) + r.c; g.n += r.c;
    });
    return [...map.values()];
  }
  function orderGroups(groups, orderArr) {
    const idx = new Map(orderArr.map((l, i) => [l, i]));
    return groups.filter((g) => idx.has(g.label))
      .sort((x, y) => idx.get(x.label) - idx.get(y.label));
  }

  function vizWorkFilter() {
    const w = ($("infVizWork") && $("infVizWork").value) || "";
    return w ? q("work") + " = " + sqlStr(w) : "";
  }
  function andWhere() {
    return [...arguments].filter(Boolean).join(" AND ");
  }

  function vizClear(msg) {
    const el = $("infVizWrap");
    el.innerHTML = '<div class="small-muted" style="padding:.6rem;">' + (msg || "No infinitives match this selection.") + "</div>";
    return el;
  }

  /* attach a themed, downloadable <svg class="d3-svg"> the way the shared
   * charts do (so it gets the PNG / SVG / enlarge toolbar for free) */
  function mkSvg(el, w, h) {
    const s = window.d3.select(el).append("svg")
      .attr("viewBox", "0 0 " + w + " " + h)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("class", "d3-svg")
      .style("width", "100%").style("height", "auto")
      .style("--nat-w", w + "px");
    Chart.addToolbar(el);
    return s;
  }

  /* Horizontal stacked bars: one bar per group, coloured by allomorph.
   *   mode 'percent' -> 100 % bars; 'count' -> shared count axis.
   *   opts: { title, mode, allos (subset), unit } */
  function stackFig(el, groups, opts) {
    opts = opts || {};
    const d3 = window.d3;
    const mode = opts.mode || "percent";
    // which allomorphs actually occur (canonical order), optionally restricted
    const present = new Set();
    groups.forEach((g) => Object.keys(g.counts).forEach((a) => present.add(a)));
    let keys = ALLO_ORDER.filter((a) => present.has(a));
    if (opts.allos) keys = keys.filter((a) => opts.allos.indexOf(a) >= 0);

    const width = 850;
    const M = { top: opts.title ? 30 : 12, right: 16, left: 168 };
    const rowH = 30, barH = 21;
    const plotW = width - M.left - M.right;
    const plotTop = M.top;
    const plotBottom = plotTop + groups.length * rowH;
    const axisY = plotBottom + 16;

    // legend geometry (wrap swatches across the width)
    const legTop = axisY + 20;
    const legItemH = 18;
    let lx = M.left, ly = legTop, legRows = 1;
    const legPos = keys.map((k) => {
      const wpx = 20 + String(k).length * 7.2 + 14;
      if (lx + wpx > width - M.right) { lx = M.left; ly += legItemH; legRows++; }
      const p = { k: k, x: lx, y: ly }; lx += wpx; return p;
    });
    const height = legTop + legRows * legItemH + 8;

    const root = mkSvg(el, width, height);
    if (opts.title) root.append("text").attr("x", width / 2).attr("y", 18)
      .attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 600)
      .attr("fill", "#1f2937").text(opts.title);

    const maxN = d3.max(groups, (g) => g.n) || 1;
    const x = d3.scaleLinear().domain([0, mode === "percent" ? 100 : maxN]).range([M.left, M.left + plotW]);

    // x-axis ticks + gridlines
    const ticks = mode === "percent" ? [0, 25, 50, 75, 100] : x.ticks(6);
    ticks.forEach((t) => {
      root.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", plotTop - 2).attr("y2", plotBottom)
        .attr("stroke", "#e5e7eb").attr("stroke-width", 1);
      root.append("text").attr("x", x(t)).attr("y", axisY).attr("text-anchor", "middle")
        .attr("font-size", 10).attr("fill", "#6b7280").text(mode === "percent" ? t + "%" : t);
    });

    groups.forEach((g, i) => {
      const y = plotTop + i * rowH + (rowH - barH) / 2;
      const lab = root.append("text").attr("x", M.left - 10).attr("text-anchor", "end").attr("fill", "#374151");
      lab.append("tspan").attr("x", M.left - 10).attr("y", y + barH / 2 - 3)
        .attr("font-size", 11.5).attr("font-weight", 600).text(g.label);
      lab.append("tspan").attr("x", M.left - 10).attr("y", y + barH / 2 + 10)
        .attr("font-size", 9.5).attr("fill", "#94a3b8").text("N = " + g.n);

      let cursor = 0;
      keys.forEach((a) => {
        const cnt = g.counts[a] || 0;
        if (!cnt) return;
        const frac = cnt / g.n;
        const val = mode === "percent" ? frac * 100 : cnt;
        const x0 = mode === "percent" ? x(cursor) : x(cursor);
        const x1 = mode === "percent" ? x(cursor + frac * 100) : x(cursor + cnt);
        const wpx = Math.max(0, x1 - x0);
        const fill = ALLO_COLOR[a] || "#cccccc";
        const rect = root.append("rect").attr("x", x0).attr("y", y).attr("width", wpx).attr("height", barH)
          .attr("fill", fill);
        rect.append("title").text(g.label + " · " + a + ": " + cnt + " (" + (frac * 100).toFixed(1) + "%)");
        const pct = frac * 100;
        if (wpx >= 24 && pct >= 4) {
          root.append("text").attr("x", x0 + wpx / 2).attr("y", y + barH / 2)
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
            .attr("font-size", 10).attr("fill", idealText(fill)).attr("pointer-events", "none")
            .text(mode === "percent" ? Math.round(pct) + "%" : cnt);
        }
        cursor += mode === "percent" ? frac * 100 : cnt;
      });
    });

    // legend
    legPos.forEach((p) => {
      root.append("rect").attr("x", p.x).attr("y", p.y - 9).attr("width", 12).attr("height", 12)
        .attr("rx", 2).attr("fill", ALLO_COLOR[p.k] || "#ccc");
      root.append("text").attr("x", p.x + 17).attr("y", p.y).attr("font-size", 10.5)
        .attr("fill", "#475569").text(p.k);
    });
  }

  /* Metrical localization heatmap: allomorph (rows) × hexameter position
   * (cols), cell = share of that allomorph's tokens landing there. */
  function metricalFig(el, extraWhere) {
    const d3 = window.d3;
    const POS = { "1": "Princeps", "2": "Biceps 1", "3": "Biceps 2" };
    const rows = vizRows(andWhere(extraWhere, q("foot_end") + " IS NOT NULL", q("foot_end_pos") + " IS NOT NULL"),
      ["foot_end fe", "foot_end_pos fp"]);
    const perAllo = new Map();     // allo -> {total, cells:Map(colKey->n)}
    const colSet = new Map();      // colKey -> sortKey
    rows.forEach((r) => {
      const a = chartAllo(r.cj, r.t, r.m); if (!a) return;
      const posName = POS[String(r.fp)] || ("pos " + r.fp);
      const col = "Foot " + r.fe + " " + posName;
      colSet.set(col, Number(r.fe) * 10 + Number(r.fp));
      let e = perAllo.get(a); if (!e) { e = { total: 0, cells: new Map() }; perAllo.set(a, e); }
      e.cells.set(col, (e.cells.get(col) || 0) + r.c); e.total += r.c;
    });
    if (!perAllo.size) return vizClear();
    const cols = [...colSet.keys()].sort((x, y) => colSet.get(x) - colSet.get(y));
    const alloRows = ALLO_ORDER.filter((a) => perAllo.has(a));
    const rowLabels = alloRows.map((a) => a + " (" + perAllo.get(a).total + ")");
    const matrix = alloRows.map((a) => {
      const e = perAllo.get(a);
      return cols.map((c) => { const n = e.cells.get(c) || 0; return n ? (100 * n / e.total) : NaN; });
    });
    Chart.heatmap(el, matrix, rowLabels, cols, {
      interpolator: d3.interpolateBlues, showValues: true, min: 0,
      valueFormat: (v) => Math.round(v), valueLabel: "Share of the allomorph's tokens (%)",
      title: "Metrical localization of infinitive endings",
      xLabel: "Metrical position where the ending falls"
    });
  }

  function renderInfViz() {
    const el = $("infVizWrap");
    el.innerHTML = "";
    const chart = $("infVizChart").value;
    const minN = Math.max(0, parseInt($("infVizMinN").value, 10) || 0);
    const wf = vizWorkFilter();

    if (chart === "byText") {
      const g = orderGroups(accumulate(vizRows("", ["work"]), (r) => r.work), WORK_ORDER);
      if (!g.length) return vizClear();
      return stackFig(el, g, { title: "Distribution of infinitive endings by text" });
    }
    if (chart === "present" || chart === "aorist") {
      const isPres = chart === "present";
      const tense = isPres ? "p" : "a";
      const conjs = isPres ? [["t", "Thematic"], ["a", "Athematic"], ["c", "Contract"]]
                           : [["t", "Thematic"], ["a", "Athematic"], ["s", "Sigmatic"]];
      const allow = new Set(conjs.map((c) => c[0]));
      const cName = Object.fromEntries(conjs);
      const rows = vizRows(q("tense") + " = " + sqlStr(tense), ["work", "conjugation"]);
      const groups = accumulate(rows, (r) => allow.has(String(r.conjugation))
        ? r.work + " \u00b7 " + cName[String(r.conjugation)] : null);
      const order = [];
      WORK_ORDER.forEach((w) => conjs.forEach(([, cn]) => order.push(w + " \u00b7 " + cn)));
      const g = orderGroups(groups, order);
      if (!g.length) return vizClear();
      return stackFig(el, g, { title: (isPres ? "Present" : "Aorist") + " infinitives: allomorph by conjugation and text" });
    }
    if (chart === "perfect") {
      const rows = vizRows(q("tense") + " = 'r'", ["metrical_stem_shape mss", "lemma"]);
      const byShape = accumulate(rows, (r) => (r.mss && r.mss !== "-") ? r.mss : null)
        .sort((a, b) => b.n - a.n);
      const byLemma = accumulate(rows, (r) => (r.lemma && r.lemma !== "-" && r.lemma !== "") ? r.lemma : null)
        .sort((a, b) => b.n - a.n).slice(0, 16);
      if (!byShape.length && !byLemma.length) return vizClear("No perfect infinitives in this selection.");
      el.innerHTML = "";
      const head = document.createElement("p");
      head.className = "help"; head.style.margin = "0 0 .4rem";
      head.textContent = "Perfect infinitives are a near-closed \u2011μεν / \u2011μεναι system. Counts, not shares.";
      el.appendChild(head);
      if (byShape.length) {
        const w1 = document.createElement("div"); w1.className = "viz-wrap"; w1.style.marginBottom = ".7rem"; el.appendChild(w1);
        stackFig(w1, byShape, { title: "By metrical stem shape", mode: "count", allos: ["\u2011μεν", "\u2011μεναι"] });
      }
      if (byLemma.length) {
        const w2 = document.createElement("div"); w2.className = "viz-wrap"; el.appendChild(w2);
        stackFig(w2, byLemma, { title: "By lemma", mode: "count", allos: ["\u2011μεν", "\u2011μεναι"] });
      }
      return;
    }
    if (chart === "metrical") return metricalFig(el, wf);
    if (chart === "stemShape") {
      const rows = vizRows(andWhere(wf, naGuard("metrical_stem_shape")), ["metrical_stem_shape mss"]);
      const g = accumulate(rows, (r) => r.mss).filter((x) => x.n >= minN).sort((a, b) => b.n - a.n)
        .map((x) => (x.label = "Stem " + x.label, x));
      if (!g.length) return vizClear("No stem shapes reach the minimum token count.");
      return stackFig(el, g, { title: "Allomorph choice by metrical stem shape" });
    }
    if (chart === "lemma") {
      const rows = vizRows(andWhere(wf, q("lemma") + " NOT IN ('','-')"), ["lemma"]);
      const g = accumulate(rows, (r) => r.lemma).filter((x) => x.n >= minN)
        .sort((a, b) => b.n - a.n).slice(0, 24);
      if (!g.length) return vizClear("No lemmata reach the minimum token count.");
      return stackFig(el, g, { title: "Lexical idiosyncrasies in infinitive allomorphy" });
    }
    if (chart === "byTense") {
      const g = orderGroups(accumulate(vizRows(wf, []), (r) => TENSE_NAME[String(r.t)] || null),
        ["Present", "Aorist", "Perfect", "Future"]);
      if (!g.length) return vizClear();
      return stackFig(el, g, { title: "Allomorph by tense" });
    }
    if (chart === "byVoice") {
      const g = orderGroups(accumulate(vizRows(andWhere(wf, naGuard("voice")), ["voice"]),
        (r) => VOICE_NAME[String(r.voice)] || null), ["Active", "Passive"]);
      if (!g.length) return vizClear();
      return stackFig(el, g, { title: "Allomorph by voice" });
    }
    if (chart === "byConjugation") {
      const g = orderGroups(accumulate(vizRows(andWhere(wf, naGuard("conjugation")), []),
        (r) => CONJ_NAME[String(r.cj)] || null), ["Thematic", "Athematic", "Sigmatic", "Contract"]);
      if (!g.length) return vizClear();
      return stackFig(el, g, { title: "Allomorph by conjugation class" });
    }
    if (chart === "byBook") {
      const w = ($("infVizWork") && $("infVizWork").value) || "";
      if (!w) return vizClear("Choose a work under \u201cRestrict to work\u201d to break its endings down by book.");
      const rows = vizRows(andWhere(q("work") + " = " + sqlStr(w), naGuard("book")), ["book"]);
      const g = accumulate(rows, (r) => r.book).filter((x) => x.n >= minN)
        .sort((a, b) => (parseInt(a.label, 10) || 0) - (parseInt(b.label, 10) || 0))
        .map((x) => (x.label = "Book " + x.label, x));
      if (!g.length) return vizClear("No books reach the minimum token count.");
      return stackFig(el, g, { title: "Infinitive endings by book \u00b7 " + w });
    }
  }

  const VIZ_NOTES = {
    byText: "Share of each ending allomorph within each work. (Work restriction not applied.)",
    present: "Present infinitives only, split by work × conjugation class. (Work restriction not applied.)",
    aorist: "Aorist infinitives only, split by work × conjugation class. (Work restriction not applied.)",
    perfect: "Perfect infinitives: the \u2011μεν / \u2011μεναι split by stem shape and by lemma (raw counts).",
    metrical: "For each allomorph, where in the hexameter its final syllable lands. Honours the work restriction.",
    stemShape: "Ending share by the metrical shape of the bare stem. Honours the work restriction and minimum count.",
    lemma: "Ending share for individual verbs (top 24 by frequency). Honours the work restriction and minimum count.",
    byTense: "Ending share within each tense. Honours the work restriction.",
    byVoice: "Ending share within each voice. Honours the work restriction.",
    byConjugation: "Ending share within each conjugation class. Honours the work restriction.",
    byBook: "Requires a work: ending share across that work's books. Honours the minimum count."
  };
  function updateVizNote() {
    const n = $("infVizNote"); if (!n) return;
    let t = VIZ_NOTES[$("infVizChart").value] || "";
    if (vizFilterWhere()) t += (t ? " " : "") + "Extra filters (tense / voice / conjugation / ending / lemma / form) are applied to the slice.";
    n.textContent = t;
  }

  /* Ending-type list for the viz filter: attested (class, number) pairs,
   * narrowed to the chosen conjugation, shown by tag — same as the Filter
   * card's list but writing into the viz control. */
  function fillVizEndingSelect() {
    const sel = $("infVizMorpheme"); if (!sel) return;
    const conj = ($("infVizConjugation") && $("infVizConjugation").value) || "";
    const prev = sel.value;
    const rows = SQL.objects("SELECT conjugation cj, tense t, morpheme m, COUNT(*) c FROM " + q(TABLE) +
      " WHERE " + INF_WHERE + " AND " + naGuard("morpheme") + " AND " + naGuard("conjugation") +
      " GROUP BY cj, t, m;");
    const opts = new Map();
    rows.forEach((r) => {
      if (conj && String(r.cj) !== conj) return;
      const cls = infEndingClass(String(r.cj), String(r.t));
      const key = cls + "|" + r.m;
      const o = opts.get(key) || { cls: cls, m: String(r.m), n: 0 };
      o.n += r.c; opts.set(key, o);
    });
    const order = ["t", "a", "s", "sf", "c", "cf"];
    const list = [...opts.values()].sort((x, y) =>
      (order.indexOf(x.cls) - order.indexOf(y.cls)) || (Number(x.m) - Number(y.m)));
    sel.innerHTML = '<option value="">(any)</option>';
    list.forEach((o) => {
      const cls = INF_ENDING_TAGS[o.cls];
      const opt = document.createElement("option");
      opt.value = o.cls + "|" + o.m;
      opt.textContent = ((cls && cls.tags[o.m]) || ("morpheme " + o.m)) + (cls ? " \u00b7 " + cls.name : "");
      sel.appendChild(opt);
    });
    if ([...sel.options].some((op) => op.value === prev)) sel.value = prev;
  }

  /* ------------------------------------------------------------------------
   *  ADVANCED: chart the result of a user's own read-only SQL.
   *  Two shapes are auto-detected:
   *    (a) allomorph stack — result carries conjugation + tense + morpheme
   *        (+ optional count column c/n/count/freq); each row is bucketed into
   *        its ending allomorph and bars are grouped by the first other column.
   *    (b) generic — (category, value) -> bars; (group, series, value) -> stack.
   * ---------------------------------------------------------------------- */
  function vizSqlStatus(msg) { const s = $("infVizSqlStatus"); if (s) s.textContent = msg; }
  function numOr1(v) { const n = Number(v); return Number.isFinite(n) ? n : 1; }

  function renderInfVizSql() {
    const wrap = $("infVizSqlWrap"); if (wrap) wrap.innerHTML = "";
    const sql = ($("infVizSqlInput") && $("infVizSqlInput").value) || "";
    if (!sql.trim()) return vizSqlStatus("Write a SELECT and press Run & chart.");
    if (SQL.isReadOnly && !SQL.isReadOnly(sql)) return vizSqlStatus("Read-only: only SELECT / WITH / EXPLAIN / PRAGMA are allowed.");
    let res;
    try { res = SQL.query(sql); }
    catch (e) { return vizSqlStatus("SQL error: " + e.message); }
    const columns = (res.columns || []).map(String), values = res.values || [];
    if (!values.length) return vizSqlStatus("Query ran but returned no rows.");
    const lc = columns.map((c) => c.toLowerCase());
    const find = (names) => { for (const nm of names) { const i = lc.indexOf(nm); if (i >= 0) return i; } return -1; };
    const ci = find(["conjugation", "cj", "conj"]), ti = find(["tense", "t"]), mi = find(["morpheme", "m"]);
    const mode = ($("infVizSqlMode") && $("infVizSqlMode").value) || "percent";

    // (a) allomorph stack
    if (ci >= 0 && ti >= 0 && mi >= 0) {
      const ni = find(["c", "n", "count", "freq"]);
      const used = new Set([ci, ti, mi, ni].filter((x) => x >= 0));
      const li = columns.findIndex((_, idx) => !used.has(idx));
      const map = new Map();
      values.forEach((row) => {
        const a = chartAllo(row[ci], row[ti], row[mi]); if (!a) return;
        const label = li >= 0 ? String(row[li]) : "All";
        const w = ni >= 0 ? numOr1(row[ni]) : 1;
        let g = map.get(label); if (!g) { g = { label: label, n: 0, counts: {} }; map.set(label, g); }
        g.counts[a] = (g.counts[a] || 0) + w; g.n += w;
      });
      const groups = [...map.values()].filter((g) => g.n > 0);
      if (!groups.length) return vizSqlStatus("No rows bucketed into a known allomorph. Check that conjugation / tense / morpheme carry the corpus codes (e.g. t, p, 1).");
      stackFig(wrap, groups, { mode: mode, title: "Custom query \u00b7 allomorph " + (mode === "percent" ? "shares" : "counts") });
      return vizSqlStatus("Charted " + groups.length + " group(s) from " + values.length + " row(s) as an allomorph stack" + (li < 0 ? " (no label column; grouped as \u201cAll\u201d)." : "."));
    }

    // (b) generic: find a numeric value column (prefer the rightmost)
    let numIdx = -1;
    for (let j = columns.length - 1; j >= 0; j--) {
      if (values.every((r) => r[j] === null || Number.isFinite(Number(r[j])))) { numIdx = j; break; }
    }
    if (numIdx < 0) return vizSqlStatus("To chart, return conjugation + tense + morpheme (allomorph stack), or 1\u20132 label columns plus a numeric value column.");
    const labelIdxs = columns.map((_, j) => j).filter((j) => j !== numIdx);
    if (labelIdxs.length === 1) {
      const gi = labelIdxs[0];
      const items = values.map((r) => ({ label: String(r[gi]), value: Number(r[numIdx]) })).filter((d) => Number.isFinite(d.value));
      Chart.bars(wrap, items, { preserveOrder: true, labelWidth: 200 });
      return vizSqlStatus("Charted " + items.length + " bar(s): " + columns[gi] + " \u00d7 " + columns[numIdx] + ".");
    }
    const gi = labelIdxs[0], si = labelIdxs[1];
    const rowsL = [], cset = [], rmap = new Map();
    values.forEach((r) => {
      const rk = String(r[gi]), ck = String(r[si]), v = Number(r[numIdx]) || 0;
      if (!rmap.has(rk)) { rmap.set(rk, new Map()); rowsL.push(rk); }
      if (cset.indexOf(ck) < 0) cset.push(ck);
      rmap.get(rk).set(ck, (rmap.get(rk).get(ck) || 0) + v);
    });
    const matrix = rowsL.map((rk) => cset.map((ck) => rmap.get(rk).get(ck) || 0));
    Chart.stackedBars(wrap, matrix, rowsL, cset, { title: columns[gi] + " \u00d7 " + columns[si] });
    return vizSqlStatus("Charted " + rowsL.length + " \u00d7 " + cset.length + " stacked bars: " + columns[gi] + " \u00d7 " + columns[si] + " (" + columns[numIdx] + ").");
  }

  function initInfinitiveViz() {
    const wrap = $("infVizWrap"), sel = $("infVizChart"), btn = $("btnInfViz");
    if (!wrap || !sel || !btn) return;
    if ($("infVizWork")) UI.fillSelect($("infVizWork"), SQL.distinct("work"), { head: "(all works)" });
    // pre-viz filter drop-downs, populated exactly like the Filter card
    [["infVizTense", "tense"], ["infVizVoice", "voice"], ["infVizConjugation", "conjugation"]].forEach(([id, col]) => {
      if (!$(id)) return;
      let vals = SQL.objects("SELECT DISTINCT " + q(col) + " AS v FROM " + q(TABLE) +
        " WHERE " + INF_WHERE + " AND " + naGuard(col) + " ORDER BY v;").map((r) => String(r.v));
      if (col === "voice") vals = vals.filter((v) => v === "a" || v === "p");
      UI.fillSelect($(id), vals, { head: "(any)", field: col });
    });
    fillVizEndingSelect();
    if ($("infVizConjugation")) $("infVizConjugation").addEventListener("change", fillVizEndingSelect);
    btn.disabled = false;
    const run = () => {
      try { renderInfViz(); }
      catch (e) { wrap.innerHTML = '<div class="small-muted" style="padding:.6rem;">Could not draw this figure: ' + UI.esc(e.message) + "</div>"; }
    };
    btn.addEventListener("click", run);
    sel.addEventListener("change", updateVizNote);
    // keep the note's "filters applied" hint live as filters change
    ["infVizTense", "infVizVoice", "infVizConjugation", "infVizMorpheme", "infVizLemmaLike", "infVizFormLike"]
      .forEach((id) => { if ($(id)) $(id).addEventListener("input", updateVizNote); });
    $("infVizMinN").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    const reset = $("btnInfVizReset");
    if (reset) reset.addEventListener("click", () => {
      ["infVizTense", "infVizVoice", "infVizConjugation", "infVizMorpheme", "infVizLemmaLike", "infVizFormLike"]
        .forEach((id) => { if ($(id)) $(id).value = ""; });
      fillVizEndingSelect(); updateVizNote(); run();
    });
    const sqlRun = $("infVizSqlRun");
    if (sqlRun) sqlRun.addEventListener("click", renderInfVizSql);
    updateVizNote();
  }

  async function init() {
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

    // The quick-filter card is the shared MopsosSearch card; the three hooks
    // graft this page's part-of-speech feature drop-downs onto it, so their
    // conditions ride in the same generated query, lock with the same manual
    // mode, and clear with the same Reset.
    Search.card({
      prefix: "qf",
      applyBtn: "btnApplyFilter",
      resetBtn: "btnResetFilter",
      previewCols: PREVIEW_COLS,
      baseConds: ["match_status <> \"CONFLICT_NO_MATCH\""],
      extraConds() {
        const f = qf.read(), out = [];
        for (const k in f) if (f[k]) out.push(Search.niceId(k) + " = " + Search.sqlStr(f[k]));
        return out;
      },
      onLock(on) {
        const g = $("qfGroup");
        if (g) g.querySelectorAll("select, input").forEach((c) => { c.disabled = !on; });
      },
      onReset() { qf.reset(); }
    });
    initInfinitiveCard();
    initInfinitiveViz();

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
    // adaptive search on both word boxes: Greek (accents optional) or Beta Code
    if ($("exLemmaMenu")) UI.greekCombo($("exLemma"), $("exLemmaMenu"), {
      items: Search.lemmaItems,
      onSelect(it) { $("exLemma").value = it.display; runExplorer(); }
    });
    if ($("exSemanticMenu")) UI.greekCombo($("exSemantic"), $("exSemanticMenu"), {
      items: Search.lemmaItems,
      onSelect(it) { $("exSemantic").value = it.display; runExplorer(); }
    });
    // one lemma, or several comma-separated, each adaptively browsed
    if ($("exLemmata") && $("exLemmataMenu")) {
      UI.greekCombo($("exLemmata"), $("exLemmataMenu"), {
        items: Search.lemmaItems,
        multi: true,
        onSelect() { runExplorer(); }
      });
      $("exLemmata").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runExplorer(); } });
    }
    $("btnExRun").addEventListener("click", runExplorer);
    $("btnExReset").addEventListener("click", () => {
      ex.reset(); $("exSemantic").value = ""; $("exLimitWork").value = ""; $("exLimitAuthor").value = "";
      if ($("exLemmata")) $("exLemmata").value = "";
      runExplorer();
    });

    // No saved state is read: every load starts fresh. The search card built
    // and ran its default query when it was created above; the explorer draws
    // its default here.
    syncExplorerControls();
    runExplorer();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
