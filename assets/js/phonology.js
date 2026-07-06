/* =====================================================================
 * MOPSOS — Phonology (D3 + SQL)
 * ---------------------------------------------------------------------
 * One SQL query selects the tokens to analyse; one drop-down selects a
 * single view. Every orthographic statistic is derived from a single,
 * structured syllabification pass (maximal-onset principle) so numbers
 * are mutually consistent across views. Where a view needs more than
 * the letter string, it draws on the rest of the corpus:
 *   - the merged metrical record (metrical_shape: H = heavy, L = light,
 *     one letter per syllable) for weight-by-position vs. weight-by-
 *     nature, the dichrona, and syllable-weight questions;
 *   - the accentuation of the raw (un-normalised) forms for the accent
 *     placement views;
 *   - line order (sentence_id, id) for elision and hiatus at word
 *     boundaries.
 * All charts are drawn with MopsosChart and carry an in-image title so
 * downloads are self-describing.
 * Depends on: window.MopsosSQL, window.MopsosUI, window.MopsosChart.
 * ===================================================================== */
(function () {
  "use strict";

  // ---- Greek phonological constants ---------------------------------
  var VOWELS = "αεηιουω";
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

  // Was the token elided in the text (final vowel dropped before a vowel)?
  // Elided forms end in an apostrophe-like mark or a combining koronis.
  function isElidedForm(raw) {
    return /[\u2019'\u02bc\u1fbd\u0313]\s*$/.test(String(raw == null ? "" : raw).normalize("NFD"));
  }

  // ---- Syllabification (single structured pass) ---------------------
  // Returns [{onset, nucleus, coda, shape, ...}].
  function syllabify(word) {
    if (!word) return [];
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
    var nucIdx = [];
    units.forEach(function (u, idx) { if (u.t === "V") nucIdx.push(idx); });
    if (!nucIdx.length) return []; // no vowel -> not syllabifiable

    var sylls = [];
    var leading = units.slice(0, nucIdx[0]).map(function (u) { return u.s; });
    for (var n = 0; n < nucIdx.length; n++) {
      var here = nucIdx[n];
      var onset, coda = [];
      if (n === 0) onset = leading;
      else onset = []; // filled by previous split
      var nextNuc = (n + 1 < nucIdx.length) ? nucIdx[n + 1] : units.length;
      var run = units.slice(here + 1, nextNuc).map(function (u) { return u.s; });
      if (n + 1 < nucIdx.length) {
        var split = splitCluster(run);
        coda = split.coda;
        sylls.push({ onset: onset, nucleus: units[here].s, coda: coda, _nextOnset: split.onset });
      } else {
        coda = run; // final cluster -> coda
        sylls.push({ onset: onset, nucleus: units[here].s, coda: coda });
      }
    }
    for (var m = 0; m < sylls.length - 1; m++) {
      sylls[m + 1].onset = sylls[m]._nextOnset || [];
      delete sylls[m]._nextOnset;
    }
    if (sylls.length) delete sylls[sylls.length - 1]._nextOnset;
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
    for (var start = 0; start < run.length; start++) {
      var suffix = run.slice(start).join("");
      if (isLegalOnset(suffix)) return { coda: run.slice(0, start), onset: run.slice(start) };
    }
    return { coda: run.slice(0, run.length - 1), onset: run.slice(run.length - 1) };
  }

  // ---- Feature helpers ---------------------------------------------
  function quantity(nucleus) {
    if (nucleus.length === 2) return "long";       // diphthong
    if (LONG_V.has(nucleus)) return "long";
    if (SHORT_V.has(nucleus)) return "short";
    return "ambiguous";                            // dichrona α ι υ
  }
  // Sonority scale: stop 1 < fricative 2 < nasal 3 < liquid 4 < vowel 6.
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
  // Rising / plateau / falling sonority across a complex onset.
  function onsetProfile(cluster) {
    var a = sonorityScore(cluster[0]);
    var b = sonorityScore(cluster[cluster.length - 1]);
    return b > a ? "rising" : (b === a ? "plateau" : "falling");
  }

  // Which syllable (index) of the word carries an accent, and which accent.
  // Walks the raw NFD form, tracking the nucleus index with the same
  // diphthong logic as syllabify(), and reports the first accent found.
  var ACC = { "\u0301": "acute", "\u0300": "grave", "\u0342": "circumflex" };
  function accentOf(raw) {
    var s = String(raw == null ? "" : raw).toLowerCase().normalize("NFD");
    var nuc = -1;            // current nucleus index (0-based)
    var lastBase = "";       // last vowel letter, to detect diphthong second members
    var prevWasVowel = false;
    var out = null;
    for (var k = 0; k < s.length; k++) {
      var ch = s[k];
      if (ch >= "\u03b1" && ch <= "\u03c9") {
        var v = VOWELS.indexOf(ch) >= 0;
        if (v) {
          if (prevWasVowel && DIPH_SET.has(lastBase + ch)) {
            // second half of a diphthong: same nucleus
            prevWasVowel = false; lastBase = "";
          } else {
            nuc += 1; prevWasVowel = true; lastBase = ch;
          }
        } else { prevWasVowel = false; lastBase = ""; }
      } else if (ACC[ch] && out == null && nuc >= 0) {
        out = { type: ACC[ch], nucleus: nuc };
      } else if (ch === "\u0308") {
        // diaeresis: the vowel it sits on was its own nucleus already if the
        // pair was not treated as a diphthong; nothing to correct here because
        // the combining mark follows the vowel we just counted.
        prevWasVowel = false; lastBase = "";
      }
    }
    if (out) out.total = nuc + 1;
    return out;
  }

  function inc(map, key, by) { map.set(key, (map.get(key) || 0) + (by || 1)); }
  function mapToItems(map, labelFn) {
    var items = [];
    map.forEach(function (v, k) { items.push({ label: labelFn ? labelFn(k) : String(k), value: v }); });
    items.sort(function (a, b) { return b.value - a.value; });
    return items;
  }
  function mean(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }

  // ---- Core analysis ------------------------------------------------
  // tokens: [{ w: rawForm, shape: metrical_shape|null }]
  function analyze(tokens) {
    var A = {
      nTokens: 0, nSyll: 0,
      phonemes: new Map(), shapes: new Map(), onsets: new Map(), codas: new Map(),
      diphthongs: new Map(), quantity: new Map(),
      sylLen: new Map(), initials: new Map(), finals: new Map(), alliteration: new Map(),
      posInitial: new Map(), posMedial: new Map(), posFinal: new Map(),
      bigrams: new Map(), uni: new Map(), nBigrams: 0,
      ssp: new Map(), sspClusters: { rising: new Map(), plateau: new Map(), falling: new Map() },
      weight: { HH: 0, HL: 0, LH: 0, LL: 0, AH: 0, AL: 0 },  // predicted x scanned
      weightN: 0, weightForms: 0, closedLight: new Map(),
      dichrona: { "α": { H: 0, L: 0 }, "ι": { H: 0, L: 0 }, "υ": { H: 0, L: 0 } },
      accent: { acute: [0, 0, 0, 0], grave: [0, 0, 0, 0], circumflex: [0, 0, 0, 0] }, // [ultima, penult, antepenult, deeper]
      accN: 0, circLongUltima: 0, circPenult: 0, acuteAntepenultLongUltima: 0, acuteAntepenult: 0,
      vowelCount: 0, consCount: 0, openSyll: 0, closedSyll: 0,
      onsetSum: 0, onsetMax: 0, codaSum: 0, codaMax: 0, report: [],
      types: new Set()
    };
    var prevInitial = null;
    for (var t = 0; t < tokens.length; t++) {
      var raw = tokens[t].w;
      var norm = normalize(raw);
      var elided = isElidedForm(raw);
      if (!norm) { prevInitial = null; continue; }
      var sylls = syllabify(norm);
      if (!sylls.length) { prevInitial = null; continue; }
      A.nTokens++;
      A.nSyll += sylls.length;
      inc(A.sylLen, sylls.length);
      A.types.add(norm);

      // segments, balance, positional distribution, bigrams
      for (var c = 0; c < norm.length; c++) {
        var ch = norm[c];
        inc(A.phonemes, ch);
        if (isVowel(ch)) A.vowelCount++; else A.consCount++;
        // an elided token's last letter is not word-final (the word ran on
        // into the next); count it as medial and give it no # boundary
        inc(c === 0 ? A.posInitial : (c === norm.length - 1 && !elided ? A.posFinal : A.posMedial), ch);
      }
      var bg = "#" + norm + (elided ? "" : "#");
      for (var b = 0; b + 1 < bg.length; b++) {
        inc(A.bigrams, bg[b] + bg[b + 1]);
        inc(A.uni, bg[b]);
        A.nBigrams++;
      }
      if (!elided) inc(A.uni, "#"); // the final boundary counts as a unigram too

      // per-syllable features
      var shapesStr = [];
      sylls.forEach(function (s) {
        inc(A.shapes, s.shape);
        shapesStr.push(s.shape);
        if (s.onset.length >= 2) {
          inc(A.onsets, s.onsetStr);
          var prof = onsetProfile(s.onsetStr);
          inc(A.ssp, prof);
          inc(A.sspClusters[prof], s.onsetStr);
        }
        if (s.coda.length >= 2) inc(A.codas, s.codaStr);
        if (s.nucleus.length === 2) inc(A.diphthongs, s.nucleus);
        inc(A.quantity, quantity(s.nucleus));
        A.onsetSum += s.onset.length; if (s.onset.length > A.onsetMax) A.onsetMax = s.onset.length;
        A.codaSum += s.coda.length; if (s.coda.length > A.codaMax) A.codaMax = s.coda.length;
        if (s.coda.length === 0) A.openSyll++; else A.closedSyll++;
      });

      // weight by nature (orthography) vs weight by position (the scansion)
      var shape = tokens[t].shape;
      if (shape && shape.length === sylls.length) {
        A.weightForms++;
        for (var y = 0; y < sylls.length; y++) {
          var s2 = sylls[y];
          var scanned = shape[y]; // 'H' or 'L'
          if (scanned !== "H" && scanned !== "L") continue;
          var isFinalSyll = (y === sylls.length - 1);
          var q = quantity(s2.nucleus);
          var predicted;
          if (q === "long") predicted = "H";
          else if (s2.coda.length && !isFinalSyll) predicted = "H"; // word-internally closed
          else if (q === "short" && !s2.coda.length) predicted = "L";
          else predicted = "?"; // dichronon nucleus, or word-final coda (weight depends on the next word)
          A.weightN++;
          if (predicted === "H") { if (scanned === "H") A.weight.HH++; else { A.weight.HL++; inc(A.closedLight, norm + " \u00b7 syll " + (y + 1) + (s2.coda.length ? " (" + s2.codaStr + (y + 1 < sylls.length ? sylls[y + 1].onsetStr : "") + ")" : "")); } }
          else if (predicted === "L") { if (scanned === "L") A.weight.LL++; else A.weight.LH++; }
          else { if (scanned === "H") A.weight.AH++; else A.weight.AL++; }
          // dichrona: open syllable, single ambiguous vowel -> its scanned quantity
          if (s2.nucleus.length === 1 && AMBIG_V.has(s2.nucleus) && !s2.coda.length) {
            A.dichrona[s2.nucleus][scanned] += 1;
          }
        }
      }

      // accent placement (from the raw, still-accented form)
      var acc = accentOf(raw);
      if (acc && acc.total === sylls.length) {
        var fromEnd = acc.total - 1 - acc.nucleus; // 0 = ultima
        var slot = Math.min(fromEnd, 3);
        A.accent[acc.type][slot] += 1;
        A.accN++;
        var lastS = sylls[sylls.length - 1];
        var ultQ = quantity(lastS.nucleus);
        // for the accent laws, word-final -αι / -οι count as short
        if ((lastS.nucleus === "αι" || lastS.nucleus === "οι") && !lastS.coda.length) ultQ = "short";
        if (acc.type === "circumflex" && fromEnd === 1) {
          A.circPenult++;
          if (ultQ === "long") A.circLongUltima++;
        }
        if (acc.type === "acute" && fromEnd === 2) {
          A.acuteAntepenult++;
          if (ultQ === "long") A.acuteAntepenultLongUltima++;
        }
      }

      // initials, finals, alliteration
      var init = norm[0], fin = norm[norm.length - 1];
      inc(A.initials, init);
      if (!elided) inc(A.finals, fin);
      if (prevInitial !== null && prevInitial === init && !isVowel(init)) inc(A.alliteration, init);
      prevInitial = init;

      if (A.report.length < 5000) {
        A.report.push([norm, sylls.map(function (s) {
          return (s.onsetStr || "") + s.nucleus + (s.codaStr || "");
        }).join("\u00b7"), shapesStr.join(" "), sylls.length]);
      }
    }
    A.meanSyll = A.nTokens ? A.nSyll / A.nTokens : 0;
    A.meanOnset = A.nSyll ? A.onsetSum / A.nSyll : 0;
    A.maxOnset = A.onsetMax;
    A.meanCoda = A.nSyll ? A.codaSum / A.nSyll : 0;
    A.maxCoda = A.codaMax;
    return A;
  }

  // ---- Minimal pairs / functional load (computed lazily, on demand) --
  // Over the distinct normalised forms of the current token set: two forms
  // are a minimal pair if they differ in exactly one segment slot. The count
  // per segment pair is a corpus-based proxy for the functional load of that
  // contrast.
  function minimalPairs(types) {
    var groups = new Map(); // wildcard key -> [{form, seg}]
    types.forEach(function (f) {
      for (var i = 0; i < f.length; i++) {
        var key = f.slice(0, i) + "\u0000" + f.slice(i + 1);
        var arr = groups.get(key);
        if (!arr) { arr = []; groups.set(key, arr); }
        arr.push(f[i]);
      }
    });
    var contrasts = new Map();
    var totalPairs = 0;
    groups.forEach(function (arr) {
      if (arr.length < 2) return;
      arr.sort();
      for (var a = 0; a < arr.length; a++)
        for (var b = a + 1; b < arr.length; b++) {
          if (arr[a] === arr[b]) continue;
          totalPairs++;
          inc(contrasts, arr[a] + " / " + arr[b]);
        }
    });
    return { contrasts: contrasts, totalPairs: totalPairs };
  }

  // ---- View metadata ------------------------------------------------
  var VIEW_DESCS = {
    segments: "Frequency of each segment (normalised letters as phoneme proxies) across the selected tokens.",
    positions: "Where each segment occurs within the word: word-initially, medially, or word-finally. Positional restrictions (e.g. which consonants can end a word) show up as missing bands.",
    initials: "The word-initial segment of each token.",
    finals: "The word-final segment of each token. Classical Greek words end only in a vowel or in \u03bd, \u03c1, \u03c2 (plus \u03be \u03c8 = \u2026\u03ba\u03c2 \u2026\u03c0\u03c2), read directly off the corpus.",
    bigrams: "Segment-to-segment transitions (with # as the word boundary): which sequences the language uses and, in the table, which are over- and under-represented relative to chance (pointwise mutual information).",
    fload: "Minimal pairs among the distinct normalised forms of the current selection: which segment contrasts actually distinguish words, and how often. A corpus-based proxy for the functional load of each contrast.",
    shapes: "Distribution of syllable shapes (V, CV, CVC, CCV\u2026) by the maximal-onset principle.",
    syllen: "How many syllables words have (1-syllable, 2-syllable\u2026).",
    complexity: "Average and maximum onset/coda cluster sizes.",
    onsets: "Complex syllable onsets (two or more consonants).",
    codas: "Complex syllable codas (two or more consonants).",
    sonority: "Complex onsets classified by their sonority contour (stop < fricative < nasal < liquid): the Sonority Sequencing Principle predicts rising contours, and the exceptions (mostly \u03c3-clusters) are itemised below the chart.",
    diphthongs: "Counts of the recognised diphthong nuclei.",
    weight: "Weight by nature (from the letters: long nucleus or a word-internal coda) checked against weight by position (how the syllable actually scans in the verse, from the merged metrical record). Disagreements are where the interesting phonology lives: muta cum liquida, epic correption, synizesis.",
    elision: "Which words are actually elided in the verse (final vowel dropped before a following vowel), from the alignment record of the corpus; counted and named by their unelided citation form.",
    hiatus: "Vowel boundaries between adjacent words in the same line: how often a vowel-final word meets a vowel-initial one without elision, and which vowel pairs meet. Computed from the words in verse order.",
    table: "Per-token syllabification and shape, paginated."
  };

  // Views that ignore the token-source query and read the corpus directly
  // (they need word order in the line / the alignment record).
  var CORPUS_VIEWS = { elision: 1, hiatus: 1 };

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
    // metrical_shape rides along so the weight / dichrona views can use it
    var sel = asLemma ? "SELECT DISTINCT lemma AS form" : "SELECT form, metrical_shape";
    return sel + " FROM morphology WHERE " + where.join(" AND ") + ";";
  }

  var EXAMPLES = [
    { label: "All forms", sql: "SELECT form, metrical_shape FROM morphology;" },
    { label: "Verbs only", sql: "SELECT form, metrical_shape FROM morphology WHERE pos = 'v';" },
    { label: "Genitive nouns", sql: "SELECT form, metrical_shape FROM morphology WHERE pos = 'n' AND \"case\" = 'g';" },
    { label: "Distinct lemmata", sql: "SELECT DISTINCT lemma AS form FROM morphology WHERE lemma <> '';" },
    { label: "Theogony forms", sql: "SELECT form FROM morphology WHERE work = 'Theogony';" }
  ];

  var state = { tokens: [], analysis: null, fload: null, floadKey: "", corpusCache: {} };

  function setStatus(msg) { if (el.phonStatus) el.phonStatus.textContent = msg; }

  function runQueryAndAnalyze(sqlOverride) {
    if (!window.MopsosSQL || !window.MopsosSQL.isReady()) { setStatus("Corpus not ready yet\u2026"); return; }
    var sql = (sqlOverride != null ? sqlOverride : (el.phonSql.value || "")).trim();
    if (!sql) { setStatus("Enter a SQL query first."); return; }
    if (!window.MopsosSQL.isReadOnly(sql)) { setStatus("Only read-only queries (SELECT / WITH) are allowed here."); return; }
    if (sqlOverride != null) el.phonSql.value = sqlOverride;
    setStatus("Running query\u2026");
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
    var shapeIdx = res.columns.indexOf("metrical_shape");

    state.tokens = [];
    res.values.forEach(function (r) {
      var w = r[colIdx];
      if (w == null || w === "") return;
      state.tokens.push({ w: w, shape: shapeIdx >= 0 ? (r[shapeIdx] || null) : null });
    });
    state.fload = null; state.floadKey = "";
    setStatus("Analyzing " + state.tokens.length.toLocaleString() + " tokens\u2026");
    setTimeout(function () {
      state.analysis = analyze(state.tokens);
      setStatus("Analyzed " + state.analysis.nTokens.toLocaleString() + " tokens \u00b7 " +
        state.analysis.nSyll.toLocaleString() + " syllables \u00b7 " +
        state.analysis.types.size.toLocaleString() + " distinct normalised forms" +
        (state.analysis.weightForms ? " \u00b7 " + state.analysis.weightForms.toLocaleString() + " with a metrical shape" : "") + ".");
      renderAll();
    }, 20);
  }

  function topN() {
    var n = parseInt(el.phonTopN.value, 10);
    return (isFinite(n) && n > 0) ? n : 24;
  }

  // Figure titles built from the options the user chose.
  function scopeSuffix() {
    var bits = [];
    if (el.phonAnalyze.value === "lemma") bits.push("distinct lemmata");
    if (el.phonLimitPos.value) bits.push(window.MopsosUI.label("pos", el.phonLimitPos.value) + "s");
    if (el.phonLimitCase && !el.phonLimitCaseWrap.hasAttribute("hidden") && el.phonLimitCase.value) bits.push(window.MopsosUI.label("case", el.phonLimitCase.value));
    if (el.phonLimitWork.value) bits.push(el.phonLimitWork.value);
    return bits.length ? " \u00b7 " + bits.join(", ") : "";
  }
  function vTitle(base) { return base + scopeSuffix(); }

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
      ["Distinct segments", A.phonemes.size],
      ["Mean syllables / word", A.meanSyll.toFixed(2)],
      ["Open syllables", pctOpen.toFixed(1) + "%"],
      ["Vowel segments", pctVowel.toFixed(1) + "%"]
    ];
    el.phonSummary.innerHTML = '<div class="analysis-grid">' + cards.map(function (c) {
      return '<div class="analysis-card"><div class="metric">' + c[1] +
        '</div><div class="metric-label">' + window.MopsosUI.esc(c[0]) + "</div></div>";
    }).join("") + "</div>";
  }

  // ---- Corpus-order views (elision / hiatus) -------------------------
  function corpusScopeWhere() {
    var conds = ["verse IS NOT NULL AND verse <> ''"];
    if (el.phonLimitWork.value) conds.push("work = " + sqlStr(el.phonLimitWork.value));
    return conds.join(" AND ");
  }

  function renderElision(C, host) {
    var SQL = window.MopsosSQL, UI = window.MopsosUI;
    var whereAll = corpusScopeWhere();
    var total = SQL.scalar("SELECT COUNT(*) FROM morphology WHERE " + whereAll + ";");
    var rows = SQL.objects("SELECT lemma f, COUNT(*) n FROM morphology WHERE match_status = 'OK_ELIDED' AND " +
      whereAll + " GROUP BY f ORDER BY n DESC LIMIT " + topN() + ";");
    var nEl = SQL.scalar("SELECT COUNT(*) FROM morphology WHERE match_status = 'OK_ELIDED' AND " + whereAll + ";");
    if (!rows.length) { host.innerHTML = '<div class="small-muted" style="padding:.7rem;">No elided tokens recorded in this scope.</div>'; return; }
    C.bars(host, rows.map(function (r) { return { label: r.f, value: r.n }; }),
      { valueLabel: "elided tokens", labelWidth: 110, title: vTitle("Commonest elided forms (given unelided)") });
    statCards([["Elided tokens", nEl.toLocaleString()], ["All tokens in scope", total.toLocaleString()],
      ["Elision rate", total ? (100 * nEl / total).toFixed(2) + "%" : "\u2013"]]);
    el.phonTable.innerHTML = '<p class="small-muted">Elision is read from the corpus alignment record (match_status = OK_ELIDED), i.e. tokens whose final vowel was dropped before a following vowel in the verse. Each bar names the unelided citation form (the lemma), not the elided surface. The part-of-speech and case limiters do not apply here; the work limiter does.</p>';
  }

  function renderHiatus(C, host) {
    var SQL = window.MopsosSQL, UI = window.MopsosUI;
    var key = "hiatus|" + (el.phonLimitWork.value || "");
    var H = state.corpusCache[key];
    if (!H) {
      var rows = SQL.objects("SELECT work w, book b, verse v, form f FROM morphology WHERE " + corpusScopeWhere() +
        " ORDER BY work, CAST(book AS INTEGER), CAST(verse AS INTEGER), CAST(sentence_id AS INTEGER), id;");
      H = { boundaries: 0, vowelMeet: 0, elided: 0, pairs: new Map() };
      var prev = null, prevLine = "";
      for (var i2 = 0; i2 < rows.length; i2++) {
        var r = rows[i2];
        var line = r.w + "|" + r.b + "|" + r.v;
        var norm = normalize(r.f);
        var cur = norm ? {
          first: norm[0], last: norm[norm.length - 1],
          elided: isElidedForm(r.f)
        } : null;
        if (prev && cur && line === prevLine) {
          H.boundaries++;
          if (isVowel(prev.last) && isVowel(cur.first)) {
            if (prev.elided) H.elided++;
            else { H.vowelMeet++; inc(H.pairs, prev.last + " + " + cur.first); }
          } else if (prev.elided) H.elided++;
        }
        prev = cur; prevLine = line;
      }
      state.corpusCache[key] = H;
    }
    if (!H.boundaries) { host.innerHTML = '<div class="small-muted" style="padding:.7rem;">No word boundaries found in this scope.</div>'; return; }
    var items = mapToItems(H.pairs).slice(0, topN());
    C.bars(host, items, { valueLabel: "boundaries", labelWidth: 110, title: vTitle("Vowel + vowel word boundaries (unelided)") });
    statCards([["Word boundaries", H.boundaries.toLocaleString()],
      ["Vowel meets vowel (hiatus)", H.vowelMeet.toLocaleString() + " (" + (100 * H.vowelMeet / H.boundaries).toFixed(2) + "%)"],
      ["Elided boundaries", H.elided.toLocaleString() + " (" + (100 * H.elided / H.boundaries).toFixed(2) + "%)"]]);
    el.phonTable.innerHTML = '<p class="small-muted">Adjacent words within the same line, in verse order. A boundary counts as hiatus when the first word ends in a vowel (and is not elided) and the next begins with one; digamma-initial and correpted boundaries are included, so this is an upper bound on true hiatus. The part-of-speech and case limiters do not apply here; the work limiter does.</p>';
  }

  function statCards(pairs) {
    el.phonSummary.innerHTML = '<div class="analysis-grid">' + pairs.map(function (c) {
      return '<div class="analysis-card"><div class="metric">' + c[1] +
        '</div><div class="metric-label">' + window.MopsosUI.esc(c[0]) + "</div></div>";
    }).join("") + "</div>";
  }

  function renderChart(view) {
    var A = state.analysis;
    el.phonTable.innerHTML = "";
    var C = window.MopsosChart, UI = window.MopsosUI, host = el.phonChart;
    if (CORPUS_VIEWS[view]) {
      if (!window.MopsosSQL || !window.MopsosSQL.isReady()) { host.innerHTML = '<div class="small-muted" style="padding:1rem;">Corpus not ready.</div>'; return; }
      try { if (view === "elision") renderElision(C, host); else renderHiatus(C, host); }
      catch (e) { host.innerHTML = '<div class="small-muted" style="padding:1rem;">Error: ' + UI.esc(e.message) + "</div>"; }
      return;
    }
    if (!A) { host.innerHTML = '<div class="small-muted" style="padding:1rem;">Run a query to see results.</div>'; return; }
    var N = topN();

    if (view === "segments") {
      C.bars(host, mapToItems(A.phonemes).slice(0, N), { valueLabel: "count", labelWidth: 90, title: vTitle("Segment frequencies") });
    } else if (view === "positions") {
      var segs = mapToItems(A.phonemes).slice(0, N).map(function (d) { return d.label; });
      var matrix = segs.map(function (s) {
        return [A.posInitial.get(s) || 0, A.posMedial.get(s) || 0, A.posFinal.get(s) || 0];
      });
      C.stackedBars(host, matrix, segs, ["word-initial", "medial", "word-final"],
        { valueLabel: "occurrences", title: vTitle("Segment position within the word"), xLabel: "segment", yLabel: "occurrences" });
      var finalC = mapToItems(A.posFinal).filter(function (d) { return !isVowel(d.label); });
      el.phonTable.innerHTML = '<p class="small-muted">Word-final consonants attested: ' +
        finalC.map(function (d) { return UI.esc(d.label) + " (" + d.value + ")"; }).join(", ") + ".</p>";
    } else if (view === "initials") {
      C.bars(host, mapToItems(A.initials).slice(0, N), { valueLabel: "words", labelWidth: 90, title: vTitle("Word-initial segments") });
    } else if (view === "finals") {
      C.bars(host, mapToItems(A.finals).slice(0, N), { valueLabel: "words", labelWidth: 90, title: vTitle("Word-final segments") });
      var off = mapToItems(A.finals).filter(function (d) { return !isVowel(d.label) && "\u03bd\u03c1\u03c3\u03be\u03c8".indexOf(d.label) < 0; });
      el.phonTable.innerHTML = off.length
        ? '<p class="small-muted">Finals outside the final law (\u03bd \u03c1 \u03c2 \u03be \u03c8 or a vowel): ' + off.map(function (d) { return UI.esc(d.label) + " (" + d.value + ")"; }).join(", ") + ", typically proclitics like \u1f10\u03ba (and \u03bf\u1f50\u03c7) or textual artefacts.</p>"
        : '<p class="small-muted">Every word-final segment in this selection obeys the final law (a vowel or \u03bd \u03c1 \u03c2 \u03be \u03c8).</p>';
    } else if (view === "bigrams") {
      var alpha = "#\u03b1\u03b5\u03b7\u03b9\u03bf\u03c5\u03c9\u03b2\u03b3\u03b4\u03b6\u03b8\u03ba\u03bb\u03bc\u03bd\u03be\u03c0\u03c1\u03c3\u03c4\u03c6\u03c7\u03c8".split("");
      var present = alpha.filter(function (a) { return A.uni.get(a); });
      var mat = present.map(function (a) { return present.map(function (b) { return A.bigrams.get(a + b) || 0; }); });
      C.heatmap(host, mat, present, present,
        { valueLabel: "transitions", title: vTitle("Segment bigrams (# = word boundary)"), yLabel: "first segment", xLabel: "second segment" });
      // PMI table: over- and under-represented transitions
      var pmi = [];
      A.bigrams.forEach(function (n, k) {
        if (n < 20) return;
        var pa = A.uni.get(k[0]) || 1, pb = A.uni.get(k[1]) || 1;
        var v = Math.log2((n * A.nBigrams) / (pa * pb));
        pmi.push([k[0] + " " + k[1], n, +v.toFixed(2)]);
      });
      pmi.sort(function (a, b) { return b[2] - a[2]; });
      var over = pmi.slice(0, 12), under = pmi.slice(-12).reverse();
      UI.renderTable(el.phonTable, ["Transition", "Count", "PMI (bits)"], over.concat(under), { paginate: false });
    } else if (view === "fload") {
      var tkey = String(A.types.size);
      if (!state.fload || state.floadKey !== tkey) {
        host.innerHTML = '<div class="small-muted" style="padding:1rem;">Computing minimal pairs over ' + A.types.size.toLocaleString() + " distinct forms\u2026</div>";
        setTimeout(function () {
          state.fload = minimalPairs(A.types);
          state.floadKey = tkey;
          renderChart("fload");
        }, 20);
        return;
      }
      var F = state.fload;
      C.bars(host, mapToItems(F.contrasts).slice(0, N),
        { valueLabel: "minimal pairs", labelWidth: 110, title: vTitle("Segment contrasts by minimal-pair count") });
      statCards([["Distinct forms", A.types.size.toLocaleString()], ["Minimal pairs", F.totalPairs.toLocaleString()],
        ["Distinct contrasts", F.contrasts.size.toLocaleString()]]);
      el.phonTable.innerHTML = '<p class="small-muted">Pairs of distinct normalised forms differing in exactly one segment slot, counted per segment contrast. Accentual and quantity distinctions are not visible here (forms are diacritic-stripped), so this measures segmental functional load only.</p>';
    } else if (view === "shapes") {
      C.bars(host, mapToItems(A.shapes).slice(0, N), { valueLabel: "syllables", labelWidth: 110, title: vTitle("Syllable shapes") });
    } else if (view === "syllen") {
      var keys = Array.from(A.sylLen.keys()).sort(function (a, b) { return a - b; });
      C.bars(host, keys.map(function (k) { return { label: k + (k === 1 ? " syllable" : " syllables"), value: A.sylLen.get(k) }; }),
        { valueLabel: "words", labelWidth: 130, preserveOrder: true, title: vTitle("Syllables per word") });
    } else if (view === "complexity") {
      C.bars(host, [
        { label: "Mean onset size", value: +A.meanOnset.toFixed(3) },
        { label: "Max onset size", value: A.maxOnset },
        { label: "Mean coda size", value: +A.meanCoda.toFixed(3) },
        { label: "Max coda size", value: A.maxCoda }
      ], { valueLabel: "consonants", labelWidth: 150, valueFormat: function (v) { return v.toFixed ? v.toFixed(2) : v; },
           title: vTitle("Onset and coda complexity") });
    } else if (view === "onsets") {
      C.bars(host, mapToItems(A.onsets).slice(0, N), { valueLabel: "syllables", labelWidth: 110, emptyMsg: "No complex onsets found.", title: vTitle("Complex onsets") });
    } else if (view === "codas") {
      C.bars(host, mapToItems(A.codas).slice(0, N), { valueLabel: "syllables", labelWidth: 110, emptyMsg: "No complex codas found.", title: vTitle("Complex codas") });
    } else if (view === "sonority") {
      var order = ["rising", "plateau", "falling"];
      C.bars(host, order.filter(function (k) { return A.ssp.has(k); }).map(function (k) { return { label: k + " sonority", value: A.ssp.get(k) }; }),
        { valueLabel: "complex onsets", labelWidth: 150, preserveOrder: true, title: vTitle("Sonority contour of complex onsets") });
      var vio = mapToItems(A.sspClusters.plateau).concat(mapToItems(A.sspClusters.falling));
      vio.sort(function (a, b) { return b.value - a.value; });
      UI.renderTable(el.phonTable, ["Non-rising onset", "Count"],
        vio.slice(0, 25).map(function (d) { return [d.label, d.value]; }), { paginate: false });
    } else if (view === "diphthongs") {
      C.bars(host, mapToItems(A.diphthongs).slice(0, N), { valueLabel: "nuclei", labelWidth: 90, emptyMsg: "No diphthongs found.", title: vTitle("Diphthong nuclei") });
    } else if (view === "weight") {
      if (!A.weightN) {
        host.innerHTML = '<div class="small-muted" style="padding:1rem;">No metrical shapes in this selection. Analyse word forms (not lemmata) and include the metrical_shape column, e.g. via the default query.</div>';
        return;
      }
      var W = A.weight;
      var mat2 = [[W.HH, W.HL], [W.LH, W.LL], [W.AH, W.AL]];
      C.groupedBars(host, mat2, ["predicted heavy", "predicted light", "dichronon / final"], ["scans heavy", "scans light"],
        { valueLabel: "syllables", title: vTitle("Weight by nature vs weight by position"), xLabel: "orthographic prediction", yLabel: "syllables" });
      var predN = W.HH + W.HL + W.LH + W.LL;
      statCards([["Syllables compared", A.weightN.toLocaleString()],
        ["Prediction agrees", predN ? (100 * (W.HH + W.LL) / predN).toFixed(1) + "%" : "\u2013"],
        ["Heavy-but-light", W.HL.toLocaleString()], ["Light-but-heavy", W.LH.toLocaleString()]]);
      var mcl = mapToItems(A.closedLight).slice(0, 15);
      el.phonTable.innerHTML = mcl.length
        ? '<p class="small-muted" style="margin-bottom:.25rem;"><strong>Predicted heavy but scanned light</strong> (muta cum liquida and correption candidates; the bracket shows the consonants around the syllable break):</p>'
        : "";
      if (mcl.length) UI.renderTable(el.phonTable.appendChild(document.createElement("div")), ["Word \u00b7 syllable", "Tokens"],
        mcl.map(function (d) { return [d.label, d.value]; }), { paginate: false });
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
    el.phonTokenCol.addEventListener("change", function () { runQueryAndAnalyze(); });
    el.phonSql.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQueryAndAnalyze(); }
    });

    setStatus("Loading corpus\u2026");
    window.MopsosSQL.ready().then(function () {
      if (el.phonLoadingBar) el.phonLoadingBar.style.display = "none";
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
        if (st.view && VIEW_DESCS[st.view]) el.phonView.value = st.view;
        if (st.topN) el.phonTopN.value = st.topN;
      }
      el.btnRunPhon.disabled = false;
      setStatus("Corpus ready. Analyzing\u2026");
      runQueryAndAnalyze(buildSourceSql());
    }).catch(function (e) {
      setStatus("Failed to load corpus: " + e.message);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
