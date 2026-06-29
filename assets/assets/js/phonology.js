/* =====================================================================
 * MOPSOS — Phonology (D3 + SQL)
 * ---------------------------------------------------------------------
 * One SQL query selects the tokens to analyse; one drop-down selects a
 * single view. Every statistic is derived from a single, structured
 * syllabification pass (maximal-onset principle) so the numbers across
 * views are mutually consistent. All charts are drawn with MopsosChart.
 * Depends on: window.MopsosSQL, window.MopsosUI, window.MopsosChart.
 * ===================================================================== */
(function () {
  "use strict";

  // ---- Greek phonological constants ---------------------------------
  var VOWELS = "αεηιουω";
  var CONSONANTS = "βγδζθκλμνξπρστφχψ";
  var DIPHTHONGS = ["αι", "ει", "οι", "υι", "ου", "αυ", "ευ", "ηυ", "ωυ"];
  var DIPH_SET = new Set(DIPHTHONGS);
  var LONG_V = new Set(["η", "ω"]);
  var SHORT_V = new Set(["ε", "ο"]);
  var AMBIG_V = new Set(["α", "ι", "υ"]);

  // Legal complex onsets (maximal-onset principle). Single C is always legal.
  var STOPS = "πβφτδθκγχ";
  var SON = "ρλμν";
  var TWO_ONSETS = new Set();
  for (var i = 0; i < STOPS.length; i++)
    for (var j = 0; j < SON.length; j++) TWO_ONSETS.add(STOPS[i] + SON[j]);
  ["σπ","στ","σκ","σφ","σθ","σχ","σμ","σν","σλ","μν","γν","βδ","πτ","κτ","φθ","χθ","σβ","τμ","δμ","θμ","κμ","γμ"]
    .forEach(function (c) { TWO_ONSETS.add(c); });
  var THREE_ONSETS = new Set(["στρ","σπρ","σπλ","σκλ","σκρ","σθλ","στλ"]);

  function isLegalOnset(cluster) {
    if (cluster.length <= 1) return true;
    if (cluster.length === 2) return TWO_ONSETS.has(cluster);
    if (cluster.length === 3) return THREE_ONSETS.has(cluster);
    return false;
  }

  // ---- Normalisation -------------------------------------------------
  function normalize(word) {
    if (word == null) return "";
    var s = String(word).toLowerCase().normalize("NFD");
    s = s.replace(/[\u0300-\u036f\u0345]/g, ""); // strip combining diacritics + ypogegrammeni
    s = s.replace(/\u03c2/g, "\u03c3");          // final sigma -> sigma
    s = s.replace(/[^\u03b1-\u03c9]/g, "");      // keep only Greek lowercase letters
    return s;
  }

  function isVowel(ch) { return VOWELS.indexOf(ch) >= 0; }

  // ---- Syllabification (single structured pass) ---------------------
  // Returns [{onset, nucleus, coda, shape}], plus we can derive everything.
  function syllabify(word) {
    if (!word) return [];
    // 1) Parse into units: V (vowel/diphthong) or C (single consonant)
    var units = [];
    for (var k = 0; k < word.length; ) {
      var ch = word[k];
      if (isVowel(ch)) {
        var pair = word.substr(k, 2);
        if (pair.length === 2 && DIPH_SET.has(pair)) { units.push({ t: "V", s: pair }); k += 2; }
        else { units.push({ t: "V", s: ch }); k += 1; }
      } else {
        units.push({ t: "C", s: ch }); k += 1;
      }
    }
    // 2) Locate nuclei (V units)
    var nucIdx = [];
    units.forEach(function (u, idx) { if (u.t === "V") nucIdx.push(idx); });
    if (!nucIdx.length) return []; // no vowel -> not syllabifiable

    var sylls = [];
    // leading consonants -> onset of first syllable
    var leading = units.slice(0, nucIdx[0]).map(function (u) { return u.s; });
    for (var n = 0; n < nucIdx.length; n++) {
      var here = nucIdx[n];
      var onset, coda = [];
      if (n === 0) onset = leading;
      else onset = []; // filled by previous split
      // consonant run after this nucleus, up to next nucleus (or end)
      var nextNuc = (n + 1 < nucIdx.length) ? nucIdx[n + 1] : units.length;
      var run = units.slice(here + 1, nextNuc).map(function (u) { return u.s; });
      if (n + 1 < nucIdx.length) {
        // split run: maximal legal onset suffix -> next onset, rest -> this coda
        var split = splitCluster(run);
        coda = split.coda;
        // store next onset on a temp; handled below
        var nextOnset = split.onset;
        sylls.push({ onset: onset, nucleus: units[here].s, coda: coda, _nextOnset: nextOnset });
      } else {
        coda = run; // final cluster -> coda
        sylls.push({ onset: onset, nucleus: units[here].s, coda: coda });
      }
    }
    // stitch _nextOnset into following syllable's onset
    for (var m = 0; m < sylls.length - 1; m++) {
      sylls[m + 1].onset = sylls[m]._nextOnset || [];
      delete sylls[m]._nextOnset;
    }
    if (sylls.length) delete sylls[sylls.length - 1]._nextOnset;
    // attach shape strings
    sylls.forEach(function (s) {
      s.onsetStr = s.onset.join("");
      s.codaStr = s.coda.join("");
      s.shape = "C".repeat(s.onset.length) + "V" + "C".repeat(s.coda.length);
    });
    return sylls;
  }

  // Split an intervocalic consonant run into {coda(left), onset(right)}.
  function splitCluster(run) {
    if (!run.length) return { coda: [], onset: [] };
    // try longest suffix that is a legal onset
    for (var start = 0; start < run.length; start++) {
      var suffix = run.slice(start).join("");
      if (isLegalOnset(suffix)) return { coda: run.slice(0, start), onset: run.slice(start) };
    }
    // fallback: last consonant is onset, rest coda
    return { coda: run.slice(0, run.length - 1), onset: run.slice(run.length - 1) };
  }

  // ---- Feature helpers ---------------------------------------------
  function quantity(nucleus) {
    if (nucleus.length === 2) return "long";       // diphthong
    if (LONG_V.has(nucleus)) return "long";
    if (SHORT_V.has(nucleus)) return "short";
    if (AMBIG_V.has(nucleus)) return "ambiguous";
    return "ambiguous";
  }
  function sonorityScore(ch) {
    if (isVowel(ch)) return 6;
    if ("ρλ".indexOf(ch) >= 0) return 4;
    if ("μν".indexOf(ch) >= 0) return 3;
    if ("σζφθχ".indexOf(ch) >= 0) return 2;
    return 1; // stops + ξ ψ
  }
  function sonorityBucket(ch) {
    if (isVowel(ch)) return "vowel";
    if ("ρλ".indexOf(ch) >= 0) return "liquid";
    if ("μν".indexOf(ch) >= 0) return "nasal";
    if ("σζφθχ".indexOf(ch) >= 0) return "fricative";
    return "stop";
  }

  function inc(map, key, by) { map.set(key, (map.get(key) || 0) + (by || 1)); }
  function mapToItems(map, labelFn) {
    var items = [];
    map.forEach(function (v, k) { items.push({ label: labelFn ? labelFn(k) : k, value: v }); });
    items.sort(function (a, b) { return b.value - a.value; });
    return items;
  }

  // ---- Core analysis ------------------------------------------------
  function analyze(tokens) {
    var A = {
      nTokens: 0, nSyll: 0,
      phonemes: new Map(), shapes: new Map(), onsets: new Map(), codas: new Map(),
      diphthongs: new Map(), quantity: new Map(), sonority: new Map(),
      sylLen: new Map(), initials: new Map(), alliteration: new Map(),
      vowelCount: 0, consCount: 0, openSyll: 0, closedSyll: 0,
      onsetSizes: [], codaSizes: [], report: []
    };
    var prevInitial = null;
    for (var t = 0; t < tokens.length; t++) {
      var norm = normalize(tokens[t]);
      if (!norm) { prevInitial = null; continue; }
      var sylls = syllabify(norm);
      if (!sylls.length) { prevInitial = null; continue; }
      A.nTokens++;
      A.nSyll += sylls.length;
      inc(A.sylLen, sylls.length);

      // phonemes + balance
      for (var c = 0; c < norm.length; c++) {
        inc(A.phonemes, norm[c]);
        if (isVowel(norm[c])) A.vowelCount++; else A.consCount++;
        inc(A.sonority, sonorityBucket(norm[c]));
      }

      // per-syllable features
      var shapesStr = [];
      sylls.forEach(function (s) {
        inc(A.shapes, s.shape);
        shapesStr.push(s.shape);
        if (s.onset.length >= 2) inc(A.onsets, s.onsetStr);
        if (s.coda.length >= 2) inc(A.codas, s.codaStr);
        if (s.nucleus.length === 2) inc(A.diphthongs, s.nucleus);
        inc(A.quantity, quantity(s.nucleus));
        A.onsetSizes.push(s.onset.length);
        A.codaSizes.push(s.coda.length);
        if (s.coda.length === 0) A.openSyll++; else A.closedSyll++;
      });

      // initials + alliteration
      var init = norm[0];
      inc(A.initials, init);
      if (prevInitial !== null && prevInitial === init && !isVowel(init)) inc(A.alliteration, init);
      prevInitial = init;

      if (A.report.length < 5000) {
        A.report.push([norm, sylls.map(function (s) {
          return (s.onsetStr || "") + s.nucleus + (s.codaStr || "");
        }).join("·"), shapesStr.join(" "), sylls.length]);
      }
    }
    A.meanSyll = A.nTokens ? A.nSyll / A.nTokens : 0;
    A.meanOnset = mean(A.onsetSizes);
    A.maxOnset = A.onsetSizes.length ? Math.max.apply(null, A.onsetSizes) : 0;
    A.meanCoda = mean(A.codaSizes);
    A.maxCoda = A.codaSizes.length ? Math.max.apply(null, A.codaSizes) : 0;
    return A;
  }
  function mean(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }

  // ---- View metadata ------------------------------------------------
  var VIEW_DESCS = {
    phonemes: "Frequency of each phoneme (normalised letters) across the selected tokens.",
    shapes: "Distribution of syllable shapes (V, CV, CVC, CCV…) by the maximal-onset principle.",
    onsets: "Complex syllable onsets (two or more consonants).",
    codas: "Complex syllable codas (two or more consonants).",
    diphthongs: "Counts of the recognised diphthong nuclei.",
    quantity: "Vowel quantity of syllable nuclei: long, short, or ambiguous (dichrona α ι υ).",
    balance: "Total vowel vs. consonant segments across all tokens.",
    syllen: "How many syllables words have (1-syllable, 2-syllable…).",
    complexity: "Average and maximum onset/coda cluster sizes.",
    sonority: "Segments grouped by sonority class (vowel > liquid > nasal > fricative > stop).",
    initials: "The word-initial sound of each token.",
    alliteration: "Adjacent tokens (in query order) sharing the same consonant initial.",
    table: "Per-token syllabification and shape, paginated."
  };

  // ---- DOM ----------------------------------------------------------
  var el = {};
  function grab() {
    ["phonLoadingBar","phonSql","phonSqlExamples","phonTokenCol","btnRunPhon","btnRunPhonSql","phonStatus",
     "phonAnalyze","phonLimitPos","phonLimitCase","phonLimitCaseWrap","phonLimitWork","phonAdvPanel",
     "phonView","phonTopN","phonViewDesc","phonSummary","phonChart","phonTable"]
      .forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  // Build the token-source query from the drop-downs in card 1.
  function buildSourceSql() {
    var asLemma = el.phonAnalyze && el.phonAnalyze.value === "lemma";
    var col = asLemma ? "lemma" : "form";
    var where = ['"' + col + '" IS NOT NULL', '"' + col + "\" NOT IN ('','-')"];
    if (el.phonLimitPos && el.phonLimitPos.value) where.push("pos = " + sqlStr(el.phonLimitPos.value));
    if (el.phonLimitCase && !el.phonLimitCaseWrap.hasAttribute("hidden") && el.phonLimitCase.value) where.push('"case" = ' + sqlStr(el.phonLimitCase.value));
    if (el.phonLimitWork && el.phonLimitWork.value) where.push("work = " + sqlStr(el.phonLimitWork.value));
    var sel = asLemma ? "SELECT DISTINCT lemma AS form" : "SELECT form";
    return sel + " FROM morphology WHERE " + where.join(" AND ") + ";";
  }

  var EXAMPLES = [
    { label: "All forms", sql: "SELECT form, lemma FROM morphology;" },
    { label: "Verbs only", sql: "SELECT form FROM morphology WHERE pos = 'v';" },
    { label: "Genitive nouns", sql: "SELECT form FROM morphology WHERE pos = 'n' AND \"case\" = 'g';" },
    { label: "Distinct lemmata", sql: "SELECT DISTINCT lemma AS form FROM morphology WHERE lemma <> '';" },
    { label: "Theogony forms", sql: "SELECT form FROM morphology WHERE work LIKE 'TH%';" }
  ];

  var state = { tokens: [], analysis: null };

  function setStatus(msg) { if (el.phonStatus) el.phonStatus.textContent = msg; }

  function runQueryAndAnalyze(sqlOverride) {
    if (!window.MopsosSQL || !window.MopsosSQL.isReady()) { setStatus("Corpus not ready yet…"); return; }
    var sql = (sqlOverride != null ? sqlOverride : (el.phonSql.value || "")).trim();
    if (!sql) { setStatus("Enter a SQL query first."); return; }
    if (!window.MopsosSQL.isReadOnly(sql)) { setStatus("Only read-only queries (SELECT / WITH) are allowed here."); return; }
    setStatus("Running query…");
    var res;
    try { res = window.MopsosSQL.query(sql); }
    catch (e) { setStatus("SQL error: " + e.message); return; }
    if (!res.columns.length) { setStatus("Query returned no columns."); return; }

    // populate token-column selector (prefer 'form' then 'lemma')
    var prev = el.phonTokenCol.value;
    el.phonTokenCol.innerHTML = "";
    res.columns.forEach(function (col) {
      var o = document.createElement("option"); o.value = col; o.textContent = col; el.phonTokenCol.appendChild(o);
    });
    el.phonTokenCol.disabled = false;
    var pick = res.columns.indexOf("form") >= 0 ? "form"
             : res.columns.indexOf("lemma") >= 0 ? "lemma"
             : (res.columns.indexOf(prev) >= 0 ? prev : res.columns[0]);
    el.phonTokenCol.value = pick;
    var colIdx = res.columns.indexOf(el.phonTokenCol.value);

    state.tokens = res.values.map(function (r) { return r[colIdx]; }).filter(function (v) { return v != null && v !== ""; });
    setStatus("Analyzing " + state.tokens.length.toLocaleString() + " tokens…");
    // defer so the status paints before the (possibly heavy) analysis
    setTimeout(function () {
      state.analysis = analyze(state.tokens);
      setStatus("Analyzed " + state.analysis.nTokens.toLocaleString() + " tokens · " +
        state.analysis.nSyll.toLocaleString() + " syllables.");
      renderAll();
    }, 20);
  }

  function reanalyzeColumnOnly() {
    // when user changes token column without re-running SQL we still have res? -> simplest: rerun
    runQueryAndAnalyze();
  }

  function topN() {
    var n = parseInt(el.phonTopN.value, 10);
    return (isFinite(n) && n > 0) ? n : 24;
  }

  function renderAll() {
    savePhonState();
    var view = el.phonView.value;
    el.phonViewDesc.textContent = VIEW_DESCS[view] || "";
    renderSummary();
    renderChart(view);
  }

  function renderSummary() {
    var A = state.analysis;
    if (!A) { el.phonSummary.innerHTML = ""; return; }
    var pctOpen = A.openSyll + A.closedSyll ? (100 * A.openSyll / (A.openSyll + A.closedSyll)) : 0;
    var vc = A.vowelCount + A.consCount;
    var pctVowel = vc ? (100 * A.vowelCount / vc) : 0;
    var cards = [
      ["Tokens", A.nTokens.toLocaleString()],
      ["Syllables", A.nSyll.toLocaleString()],
      ["Distinct phonemes", A.phonemes.size],
      ["Mean syllables / word", A.meanSyll.toFixed(2)],
      ["Open syllables", pctOpen.toFixed(1) + "%"],
      ["Vowel segments", pctVowel.toFixed(1) + "%"]
    ];
    el.phonSummary.innerHTML = '<div class="analysis-grid">' + cards.map(function (c) {
      return '<div class="analysis-card"><div class="metric">' + c[1] +
        '</div><div class="metric-label">' + window.MopsosUI.esc(c[0]) + "</div></div>";
    }).join("") + "</div>";
  }

  function renderChart(view) {
    var A = state.analysis;
    el.phonTable.innerHTML = "";
    var C = window.MopsosChart, host = el.phonChart;
    if (!A) { host.innerHTML = '<div class="small-muted" style="padding:1rem;">Run a query to see results.</div>'; return; }
    var N = topN();

    if (view === "phonemes") {
      C.bars(host, mapToItems(A.phonemes).slice(0, N), { valueLabel: "Count", labelWidth: 90 });
    } else if (view === "shapes") {
      C.bars(host, mapToItems(A.shapes).slice(0, N), { valueLabel: "Count", labelWidth: 110 });
    } else if (view === "onsets") {
      C.bars(host, mapToItems(A.onsets).slice(0, N), { valueLabel: "Count", labelWidth: 110, emptyMsg: "No complex onsets found." });
    } else if (view === "codas") {
      C.bars(host, mapToItems(A.codas).slice(0, N), { valueLabel: "Count", labelWidth: 110, emptyMsg: "No complex codas found." });
    } else if (view === "diphthongs") {
      C.bars(host, mapToItems(A.diphthongs).slice(0, N), { valueLabel: "Count", labelWidth: 90, emptyMsg: "No diphthongs found." });
    } else if (view === "quantity") {
      var order = ["long", "short", "ambiguous"];
      C.bars(host, order.filter(function (q) { return A.quantity.has(q); }).map(function (q) {
        return { label: q, value: A.quantity.get(q) };
      }), { valueLabel: "Nuclei", labelWidth: 120 });
    } else if (view === "balance") {
      C.bars(host, [{ label: "Vowels", value: A.vowelCount }, { label: "Consonants", value: A.consCount }],
        { valueLabel: "Segments", labelWidth: 120 });
    } else if (view === "syllen") {
      var keys = Array.from(A.sylLen.keys()).sort(function (a, b) { return a - b; });
      C.bars(host, keys.map(function (k) { return { label: k + (k === 1 ? " syllable" : " syllables"), value: A.sylLen.get(k) }; }),
        { valueLabel: "Words", labelWidth: 130 });
    } else if (view === "complexity") {
      C.bars(host, [
        { label: "Mean onset size", value: +A.meanOnset.toFixed(3) },
        { label: "Max onset size", value: A.maxOnset },
        { label: "Mean coda size", value: +A.meanCoda.toFixed(3) },
        { label: "Max coda size", value: A.maxCoda }
      ], { valueLabel: "Consonants", labelWidth: 150, valueFormat: function (v) { return v.toFixed ? v.toFixed(2) : v; } });
    } else if (view === "sonority") {
      var so = ["vowel", "liquid", "nasal", "fricative", "stop"];
      C.bars(host, so.filter(function (s) { return A.sonority.has(s); }).map(function (s) {
        return { label: s, value: A.sonority.get(s) };
      }), { valueLabel: "Segments", labelWidth: 120 });
    } else if (view === "initials") {
      C.bars(host, mapToItems(A.initials).slice(0, N), { valueLabel: "Words", labelWidth: 90 });
    } else if (view === "alliteration") {
      C.bars(host, mapToItems(A.alliteration).slice(0, N), { valueLabel: "Adjacent pairs", labelWidth: 90, emptyMsg: "No adjacent alliteration found." });
    } else if (view === "table") {
      host.innerHTML = "";
      window.MopsosUI.renderTable(el.phonTable, ["form", "syllabification", "shapes", "syllables"], A.report,
        { paginate: true, pageSize: 50 });
    }
  }

  // ---- Init ---------------------------------------------------------
  function refreshCaseLimiter() {
    if (!el.phonLimitCaseWrap) return;
    var pos = el.phonLimitPos ? el.phonLimitPos.value : "";
    var applies = pos ? window.MopsosSQL.nonEmptyColumns(["case"], { pos: pos }).length > 0 : false;
    if (applies) {
      var vals = window.MopsosSQL.distinctFor("case", { pos: pos });
      window.MopsosUI.fillSelect(el.phonLimitCase, vals, { field: "case", head: "(any)" });
      el.phonLimitCaseWrap.removeAttribute("hidden");
    } else {
      el.phonLimitCase.value = "";
      el.phonLimitCaseWrap.setAttribute("hidden", "");
    }
  }

  function savePhonState() {
    if (!el.phonAnalyze) return;
    window.MopsosUI.saveState("phon", {
      analyze: el.phonAnalyze.value,
      limitPos: el.phonLimitPos.value,
      limitCase: el.phonLimitCaseWrap.hasAttribute("hidden") ? "" : el.phonLimitCase.value,
      limitWork: el.phonLimitWork.value,
      view: el.phonView.value,
      topN: el.phonTopN.value
    });
  }

  function init() {
    grab();
    if (!el.phonSql) return; // not on this page

    // advanced custom-SQL examples
    EXAMPLES.forEach(function (ex) {
      var b = document.createElement("button");
      b.className = "btn btn-sm"; b.textContent = ex.label;
      b.addEventListener("click", function () { el.phonSql.value = ex.sql; });
      el.phonSqlExamples.appendChild(b);
    });

    el.btnRunPhon.addEventListener("click", function () { runQueryAndAnalyze(buildSourceSql()); });
    if (el.btnRunPhonSql) el.btnRunPhonSql.addEventListener("click", function () { runQueryAndAnalyze(); });
    if (el.phonLimitPos) el.phonLimitPos.addEventListener("change", refreshCaseLimiter);
    el.phonView.addEventListener("change", renderAll);
    el.phonTopN.addEventListener("change", renderAll);
    el.phonTokenCol.addEventListener("change", reanalyzeColumnOnly);
    el.phonSql.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQueryAndAnalyze(); }
    });

    setStatus("Loading corpus…");
    window.MopsosSQL.ready().then(function () {
      if (el.phonLoadingBar) el.phonLoadingBar.style.display = "none";
      // populate limiter drop-downs (labels only)
      window.MopsosUI.fillSelect(el.phonLimitPos, window.MopsosSQL.distinct("pos"), { field: "pos", head: "(all)" });
      window.MopsosUI.fillSelect(el.phonLimitWork, window.MopsosSQL.distinct("work"), { head: "(all)" });
      el.phonLimitPos.disabled = false;
      el.phonLimitWork.disabled = false;
      var st = window.MopsosUI.loadState("phon");
      if (st) {
        if (st.analyze) el.phonAnalyze.value = st.analyze;
        if (st.limitPos != null) el.phonLimitPos.value = st.limitPos;
        if (st.limitWork != null) el.phonLimitWork.value = st.limitWork;
      }
      refreshCaseLimiter();
      if (st) {
        if (st.limitCase && !el.phonLimitCaseWrap.hasAttribute("hidden")) el.phonLimitCase.value = st.limitCase;
        if (st.view) el.phonView.value = st.view;
        if (st.topN) el.phonTopN.value = st.topN;
      }
      el.btnRunPhon.disabled = false;
      setStatus("Corpus ready. Analyzing…");
      runQueryAndAnalyze(buildSourceSql());
    }).catch(function (e) {
      setStatus("Failed to load corpus: " + e.message);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
