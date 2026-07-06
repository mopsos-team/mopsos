/* ============================================================================
 *  SCANSION (PROSODY) TAB
 *  One view at a time, chosen from a drop-down, computed live with SQL over
 *  the shared in-browser database and drawn with D3.
 *  Every view here runs on the merged morphology table. The corpus build
 *  (scripts/build_corpus.py) folds the scansion into that table, so each
 *  token carries its own metrical record: metrical_shape (H = heavy/long,
 *  L = light/short, one letter per syllable), the foot it begins and ends in
 *  (foot_start / foot_end, 1-6), its position within the starting foot
 *  (foot_start_pos, 1 = the princeps), and a match_status recording how the
 *  word aligned to the scanned line. Line-level figures (foot patterns,
 *  syllable and word counts, the line text itself) are reassembled from the
 *  per-token records rather than read from a separate line table.
 * ========================================================================== */
(function () {
  var SQL = window.MopsosSQL, UI = window.MopsosUI, Chart = window.MopsosChart;
  var el = {};

  function grab() {
    ["scanLoadStatus", "scanView", "scanWork", "scanBookWrap", "scanBook", "scanVerseWrap", "scanVerse", "btnRunScan",
     "scanViewDesc", "scanSummary", "scanChart", "scanTable",
     "scanWordWrap", "scanWord", "scanWordMenu", "scanFootWrap", "scanFoot",
     "scanGrammar", "scanGPos", "scanGCase", "scanGNumber", "scanGGender", "scanGTense", "scanGMood", "scanGVoice", "scanGPerson"]
      .forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  // The Top-N control is gone: the ranked views (foot patterns, foot words)
  // show a fixed top 15.
  var TOP_N = 15;

  // Verse(s): a single verse number or a range, matching the morphology card.
  // Returns a SQL condition, or null when the box is empty or malformed.
  function verseCond() {
    var m = (el.scanVerse.value || "").trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    return m[2]
      ? "CAST(verse AS INTEGER) BETWEEN " + parseInt(m[1], 10) + " AND " + parseInt(m[2], 10)
      : "CAST(verse AS INTEGER) = " + parseInt(m[1], 10);
  }

  // A figure title assembled from the options the user actually chose, so a
  // downloaded image says what it shows and over which scope.
  function scopeSuffix() {
    var w = el.scanWork.value || "All works";
    var b = el.scanBook.value ? " book " + el.scanBook.value : "";
    var vr = (el.scanVerse.value || "").trim();
    return " \u00b7 " + w + b + (vr ? " vv. " + vr : "");
  }
  function viewTitle(base) { return base + scopeSuffix(); }

  /* ----- the merged metrical record ---------------------------------------
   * scanWork offers the work names straight from the corpus, so every
   * scanned work is selectable. ------------------------------------------- */
  // Tokens whose alignment to the scansion is trustworthy.
  var MATCH_OK = "match_status IN ('OK','OK_ELIDED','OK_FUZZY') AND foot_start IS NOT NULL";
  // WHERE conditions restricting morphology to the tab's current scope.
  // An optional column prefix (e.g. "m.") qualifies columns in joined queries.
  function morphScope(px) {
    px = px || "";
    var conds = [px + "match_status IN ('OK','OK_ELIDED','OK_FUZZY') AND " + px + "foot_start IS NOT NULL"];
    if (el.scanWork.value) conds.push(px + "work = " + sqlStr(el.scanWork.value));
    if (el.scanBook.value) conds.push(px + "book = " + sqlStr(el.scanBook.value));
    var vc = verseCond(); if (vc) conds.push(vc);
    return conds;
  }
  // Line scope: like morphScope but with no match-status restriction, so a
  // line keeps all of its words (unmatched ones are flagged, not dropped).
  function lineScope() {
    var conds = ["verse IS NOT NULL AND verse <> ''"];
    if (el.scanWork.value) conds.push("work = " + sqlStr(el.scanWork.value));
    if (el.scanBook.value) conds.push("book = " + sqlStr(el.scanBook.value));
    var vc = verseCond(); if (vc) conds.push(vc);
    return conds;
  }

  // Parse a line's concatenated H/L syllable string into its six feet.
  // Returns e.g. "DDSDDS" (D = dactyl H L L, S = spondee H H; the sixth foot
  // has two syllables with a free final), or null if the string does not
  // resolve into a well-formed hexameter (e.g. a word failed to align).
  function parseFeet(shp) {
    if (!shp) return null;
    var out = "", i = 0, n = shp.length, f;
    for (f = 0; f < 6; f++) {
      if (shp[i] !== "H") return null;
      if (f === 5) {
        if (n - i !== 2) return null;
        out += "S"; i += 2;
      } else if (shp.substr(i + 1, 2) === "LL") {
        out += "D"; i += 3;
      } else if (shp[i + 1] === "H") {
        out += "S"; i += 2;
      } else return null;
    }
    return i === n ? out : null;
  }
  // Render an H/L shape as metrical marks: H -> ¯ (long), L -> ˘ (short);
  // macron and breve sit on the same vertical level.
  function shapeMarks(shape) {
    return String(shape || "").split("").map(function (c) { return c === "H" ? "\u00af" : "\u02d8"; }).join("\u2009");
  }

  /* ----- per-line aggregate, reassembled from the tokens -------------------
   * One row per (work, book, verse): word count, the concatenated syllable
   * shape, the line text rebuilt from the forms, how many tokens failed to
   * align, and the derived six-foot pattern. Cached per scope. ------------ */
  var LINES_CACHE = {};
  function linesAgg() {
    var key = (el.scanWork.value || "") + "|" + (el.scanBook.value || "") + "|" + (el.scanVerse.value || "").trim();
    if (LINES_CACHE[key]) return LINES_CACHE[key];
    var rows = SQL.objects(
      "SELECT work, book, CAST(verse AS INTEGER) line_num, COUNT(*) n_words, " +
      "GROUP_CONCAT(metrical_shape, '' ORDER BY CAST(sentence_id AS INTEGER), id) shp, " +
      "GROUP_CONCAT(form, ' ' ORDER BY CAST(sentence_id AS INTEGER), id) line_text, " +
      "SUM(CASE WHEN " + MATCH_OK + " THEN 0 ELSE 1 END) bad " +
      "FROM morphology WHERE " + lineScope().join(" AND ") +
      " GROUP BY work, book, verse" +
      " ORDER BY work, CAST(book AS INTEGER), CAST(verse AS INTEGER);");
    rows.forEach(function (r) {
      r.shp = r.shp || "";
      r.n_syllables = r.shp.length;
      r.pattern = r.bad ? null : parseFeet(r.shp);
    });
    LINES_CACHE[key] = rows;
    return rows;
  }
  // The words of one line with their metrical records, in order.
  function lineTokens(work, book, line_num) {
    return SQL.objects("SELECT form, metrical_shape, foot_start, foot_start_pos, foot_end, foot_end_pos, match_status FROM morphology WHERE work = " +
      sqlStr(work) + " AND book = " + sqlStr(String(book)) + " AND verse = " + sqlStr(String(line_num)) + " ORDER BY CAST(sentence_id AS INTEGER), id;");
  }
  // The text of one line, rebuilt from its forms.
  function lineTextFor(work, book, line_num) {
    return SQL.scalar("SELECT GROUP_CONCAT(form, ' ' ORDER BY CAST(sentence_id AS INTEGER), id) FROM morphology WHERE work = " +
      sqlStr(work) + " AND book = " + sqlStr(String(book)) + " AND verse = " + sqlStr(String(line_num)) + ";");
  }

  function stripDia(s) { return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function normGr(w) { return stripDia(w).replace(/[\u2019'\u02bc]/g, ""); }

  /* ----- grammatical category (each token carries its own analysis) -------- */
  var GFIELDS = ["pos", "case", "number", "gender", "tense", "mood", "voice", "person"];
  var GLABEL = {
    pos: { n: "noun", v: "verb", a: "adjective", p: "pronoun", d: "adverb", l: "article", r: "preposition", c: "conjunction", g: "particle", m: "numeral", i: "interjection" },
    "case": { n: "nominative", g: "genitive", d: "dative", a: "accusative", v: "vocative" },
    number: { s: "singular", d: "dual", p: "plural" },
    gender: { m: "masculine", f: "feminine", n: "neuter" },
    tense: { p: "present", i: "imperfect", a: "aorist", r: "perfect", l: "pluperfect", f: "future", t: "future-perfect" },
    mood: { i: "indicative", s: "subjunctive", o: "optative", m: "imperative", n: "infinitive", p: "participle" },
    voice: { a: "active", m: "middle", p: "passive", e: "mediopassive" },
    person: { "1": "1st-person", "2": "2nd-person", "3": "3rd-person" }
  };
  // Each token in the merged table carries its own analysis, so grammatical
  // restrictions are plain SQL conditions rather than a per-form heuristic.
  function grammarWhere(f) {
    var conds = [];
    GFIELDS.forEach(function (k) {
      if (f[k]) conds.push('"' + k + '" = ' + sqlStr(f[k]));
    });
    return conds;
  }
  var GMAP = { pos: "scanGPos", "case": "scanGCase", number: "scanGNumber", gender: "scanGGender", tense: "scanGTense", mood: "scanGMood", voice: "scanGVoice", person: "scanGPerson" };
  function readGrammar() {
    var f = {};
    GFIELDS.forEach(function (k) { var c = el[GMAP[k]]; if (c && c.value) f[k] = c.value; });
    return f;
  }
  function grammarActive(f) { return Object.keys(f).length > 0; }
  function grammarLabel(f) {
    var parts = GFIELDS.filter(function (k) { return f[k]; }).map(function (k) { return GLABEL[k][f[k]] || f[k]; });
    return parts.length ? parts.join(" ") : "words";
  }

  /* ----- word autocomplete: Greek prefix, or English via the LSJ bridge ---- */
  var FORMS = null, FORMLIST = null, LEMMAFORMS = null, FORMBETA = null;
  function buildForms() {
    if (FORMS) return;
    FORMS = {};
    SQL.objects("SELECT form, COUNT(*) n FROM morphology WHERE " + MATCH_OK +
      " GROUP BY form;").forEach(function (r) {
      var wn = normGr(r.form); if (!wn) return;
      var e = FORMS[wn]; if (!e) e = FORMS[wn] = { forms: {}, c: 0 };
      e.c += r.n; e.forms[r.form] = (e.forms[r.form] || 0) + r.n;
    });
    FORMLIST = Object.keys(FORMS).map(function (wn) {
      var fm = FORMS[wn].forms, disp = Object.keys(fm).sort(function (a, b) { return fm[b] - fm[a]; })[0];
      return { wn: wn, disp: disp, c: FORMS[wn].c };
    }).sort(function (a, b) { return b.c - a.c; });
  }
  function buildLemmaForms() {
    if (LEMMAFORMS) return;
    buildForms();
    LEMMAFORMS = {};
    SQL.objects("SELECT DISTINCT lemma, form FROM morphology WHERE form NOT IN ('','-');").forEach(function (r) {
      var nf = normGr(r.form); if (!FORMS[nf]) return;
      var nl = normGr(r.lemma); (LEMMAFORMS[nl] = LEMMAFORMS[nl] || {})[nf] = 1;
    });
  }
  function suggestFor(query) {
    var q = (query || "").trim();
    if (!q) { buildForms(); return FORMLIST; }            // empty -> browse every form
    var hasLatin = /[a-z]/i.test(q.replace(/[\u0370-\u03ff\u1f00-\u1fff]/g, ""));
    if (hasLatin) {
      buildLemmaForms();
      var out = [], seen = {};
      // 1. Beta Code: prefix-match the transliteration of every form
      var T = window.MopsosText;
      if (T && T.toBetaCode && T.looseBetaKey) {
        var nb = T.looseBetaKey(q);
        if (nb) {
          if (!FORMBETA) { FORMBETA = {}; FORMLIST.forEach(function (e) { FORMBETA[e.wn] = T.looseBetaKey(T.toBetaCode(e.disp)); }); }
          FORMLIST.forEach(function (e) {
            if (FORMBETA[e.wn] && FORMBETA[e.wn].indexOf(nb) === 0 && !seen[e.wn]) { seen[e.wn] = 1; out.push(e); }
          });
        }
      }
      // 2. English: the LSJ bridge maps the word to Greek lemmata
      var sem = window.MopsosSemantics, seeds = [];
      if (sem && sem.resolve) { var res = sem.resolve(q); seeds = (res && res.seeds) || []; }
      seeds.forEach(function (lem) {
        var forms = LEMMAFORMS[normGr(lem)]; if (!forms) return;
        Object.keys(forms).forEach(function (nf) {
          if (seen[nf] || !FORMS[nf]) return; seen[nf] = 1;
          var fm = FORMS[nf].forms, disp = Object.keys(fm).sort(function (a, b) { return fm[b] - fm[a]; })[0];
          out.push({ disp: disp, c: FORMS[nf].c, hint: lem });
        });
      });
      return out.sort(function (a, b) { return b.c - a.c; });
    }
    buildForms();
    var nq = normGr(q);
    return FORMLIST.filter(function (e) { return e.wn.indexOf(nq) === 0; });
  }
  // The menu renders in chunks and grows as the user scrolls, so even the full
  // 30k-form list opens instantly instead of building one giant <select>.
  var MENU_CHUNK = 80, menuItems = [], menuShown = 0;
  function appendChunk() {
    var slice = menuItems.slice(menuShown, menuShown + MENU_CHUNK);
    if (!slice.length) return;
    el.scanWordMenu.insertAdjacentHTML("beforeend", slice.map(function (it) {
      return '<div class="combo-item" data-form="' + UI.esc(it.disp) + '"><span class="combo-form">' + UI.esc(it.disp) +
        '</span><span class="combo-meta">' + (it.hint ? UI.esc(it.hint) + " \u00b7 " : "") + it.c + "</span></div>";
    }).join(""));
    menuShown += slice.length;
  }
  function setMenu(items) {
    menuItems = items || []; menuShown = 0; el.scanWordMenu.innerHTML = "";
    if (!menuItems.length) { el.scanWordMenu.hidden = true; return; }
    el.scanWordMenu.hidden = false; el.scanWordMenu.scrollTop = 0;
    appendChunk();
  }
  function wireCombo() {
    if (!el.scanWord || !el.scanWordMenu) return;
    var refresh = function () { setMenu(suggestFor(el.scanWord.value)); };
    el.scanWord.addEventListener("input", refresh);
    el.scanWord.addEventListener("focus", function () {
      if (window.MopsosSemantics && window.MopsosSemantics.loadBridge) window.MopsosSemantics.loadBridge();
      if (SQL && SQL.isReady()) refresh();
    });
    el.scanWordMenu.addEventListener("scroll", function () {
      if (menuShown < menuItems.length &&
          el.scanWordMenu.scrollTop + el.scanWordMenu.clientHeight >= el.scanWordMenu.scrollHeight - 60) appendChunk();
    });
    el.scanWordMenu.addEventListener("mousedown", function (ev) {
      var it = ev.target.closest && ev.target.closest(".combo-item"); if (!it) return;
      ev.preventDefault();
      el.scanWord.value = it.getAttribute("data-form");
      el.scanWordMenu.hidden = true;
    });
    el.scanWord.addEventListener("blur", function () { setTimeout(function () { if (el.scanWordMenu) el.scanWordMenu.hidden = true; }, 160); });
    el.scanWord.addEventListener("keydown", function (e) { if (e.key === "Escape") el.scanWordMenu.hidden = true; });
  }

  /* ----- line rendering: each word under its own metrical marks ------------ */
  function footSize(pattern, f) { return pattern && pattern[f - 1] === "D" ? 3 : 2; }
  // Marks for one word, with a light | before every syllable that opens a
  // new foot (intra-word foot boundaries, from foot_start / foot_start_pos
  // walked against the line's derived pattern).
  function wordMarks(shape, ft, fsp, pattern) {
    var f = parseInt(ft, 10), p = parseInt(fsp, 10) || 1;
    var parts = [];
    for (var k = 0; k < shape.length; k++) {
      if (k > 0 && p === 1 && pattern) parts.push('<span class="scan-fdiv">|</span>');
      parts.push(shape[k] === "H" ? "\u00af" : "\u02d8");
      p++;
      if (pattern && p > footSize(pattern, f)) { f++; p = 1; }
    }
    return parts.join("\u2009");
  }
  // Foot-end boundaries (diaereses) are marked wherever they occur: | when a
  // word ends exactly at a foot boundary, tinted after foot 4 (the bucolic
  // diaeresis).
  function diaeresisMark(fe, fep, pattern) {
    if (!pattern || fe == null) return "";
    var f = parseInt(fe, 10), p = parseInt(fep, 10) || 1;
    if (!isFinite(f) || f < 1 || f > 6) return "";
    if (p < footSize(pattern, f)) return "";
    if (f === 4) return '<span class="scan-junc scan-bdia" title="bucolic diaeresis (word end at the close of foot 4)">|</span>';
    return '<span class="scan-junc scan-fdiv" title="foot boundary at word end (diaeresis)">|</span>';
  }
  // The principal caesura: ONE per line. Candidate word breaks (inside foot 3
  // masculine or feminine, or inside foot 4 = hephthemimeral) are filtered by
  // a light appositive heuristic: a break does not count before a postpositive
  // (\u03b4\u03ad, \u03c4\u03b5, \u03b3\u03ac\u03c1\u2026 lean back on the previous word) or after a prepositive
  // (prepositions, \u03ba\u03b1\u03af, negatives\u2026 lean forward). A third-foot caesura
  // outranks the hephthemimeral; when masculine and feminine breaks both
  // survive the filter, both are marked dotted to signal the uncertainty.
  var POSTPOS = { "\u03b4\u03b5": 1, "\u03c4\u03b5": 1, "\u03b3\u03b5": 1, "\u03ba\u03b5": 1, "\u03ba\u03b5\u03bd": 1, "\u03b1\u03bd": 1, "\u03c1\u03b1": 1, "\u03b3\u03b1\u03c1": 1, "\u03bc\u03b5\u03bd": 1, "\u03b4\u03b7": 1, "\u03c0\u03b5\u03c1": 1, "\u03c4\u03bf\u03b9": 1, "\u03bd\u03c5": 1, "\u03bc\u03b9\u03bd": 1, "\u03bc\u03bf\u03b9": 1, "\u03bc\u03b5": 1, "\u03c3\u03b5": 1, "\u03c3\u03c6\u03b9": 1, "\u03c3\u03c6\u03b9\u03bd": 1, "\u03b4": 1, "\u03c4": 1, "\u03b3": 1, "\u03ba": 1, "\u03c1": 1, "\u03bc": 1, "\u03c3": 1 };
  var PREPOS = { "\u03ba\u03b1\u03b9": 1, "\u03bf\u03c5\u03b4\u03b5": 1, "\u03bc\u03b7\u03b4\u03b5": 1, "\u03bf\u03c5": 1, "\u03bf\u03c5\u03ba": 1, "\u03bf\u03c5\u03c7": 1, "\u03bc\u03b7": 1, "\u03b5\u03b9": 1, "\u03b1\u03bb\u03bb\u03b1": 1, "\u03b1\u03bb\u03bb": 1, "\u03b5\u03bd": 1, "\u03b5\u03bd\u03b9": 1, "\u03b5\u03ba": 1, "\u03b5\u03be": 1, "\u03b5\u03c3": 1, "\u03b5\u03b9\u03c3": 1, "\u03c0\u03c1\u03bf\u03c3": 1, "\u03c0\u03bf\u03c4\u03b9": 1, "\u03c0\u03b5\u03c1\u03b9": 1, "\u03c0\u03b1\u03c1\u03b1": 1, "\u03c0\u03b1\u03c1": 1, "\u03c5\u03c0\u03bf": 1, "\u03c5\u03c0": 1, "\u03b5\u03c0\u03b9": 1, "\u03b5\u03c0": 1, "\u03b1\u03c0\u03bf": 1, "\u03b1\u03c0": 1, "\u03b4\u03b9\u03b1": 1, "\u03ba\u03b1\u03c4\u03b1": 1, "\u03ba\u03b1\u03c4": 1, "\u03bc\u03b5\u03c4\u03b1": 1, "\u03bc\u03b5\u03c4": 1, "\u03c3\u03c5\u03bd": 1, "\u03be\u03c5\u03bd": 1, "\u03b1\u03bc\u03c6\u03b9": 1, "\u03b1\u03bd\u03b1": 1, "\u03b1\u03bd\u03c4\u03b9": 1, "\u03c5\u03c0\u03b5\u03c1": 1, "\u03c0\u03c1\u03bf": 1 };
  function caesuraHtml(cls, uncertain) {
    var name = cls === "masc" ? "penthemimeral (masculine) caesura"
      : cls === "fem" ? "trochaic (feminine) caesura" : "hephthemimeral caesura";
    if (uncertain) return '<span class="scan-junc scan-caes scan-caes-unc" title="' + name + ': position uncertain (two third-foot word breaks)">\u2016</span>';
    return '<span class="scan-junc scan-caes" title="' + name + '">\u2016</span>';
  }
  // -> { boundaryIndex: html } for the single caesura of this line.
  function caesuraPlan(tokens, pattern, okFn, feOf, fepOf, formOf) {
    var plan = {};
    if (!pattern) return plan;
    var third = [], heph = [];
    for (var i = 1; i < tokens.length; i++) {
      var prev = tokens[i - 1], next = tokens[i];
      if (!okFn(prev) || feOf(prev) == null) continue;
      var f = parseInt(feOf(prev), 10), pp = parseInt(fepOf(prev), 10) || 1;
      if (!isFinite(f) || f < 1 || f > 6) continue;
      if (pp >= footSize(pattern, f)) continue;               // foot end: diaeresis, not caesura
      var cls = (f === 3 && pp === 1) ? "masc"
        : (f === 3 && pp === 2 && pattern[2] === "D") ? "fem"
        : (f === 4 && pp === 1) ? "heph" : null;
      if (!cls) continue;
      if (POSTPOS[normGr(formOf(next))]) continue;            // break before a postpositive is no break
      if (PREPOS[normGr(formOf(prev))]) continue;             // break after a prepositive is no break
      (cls === "heph" ? heph : third).push({ i: i, cls: cls });
    }
    if (third.length === 1) plan[third[0].i] = caesuraHtml(third[0].cls, false);
    else if (third.length > 1) third.forEach(function (c) { plan[c.i] = caesuraHtml(c.cls, true); });
    else if (heph.length) plan[heph[0].i] = caesuraHtml("heph", false);
    return plan;
  }
  // One line, word by word: the marks above each word are its stored
  // metrical_shape (¯ long, ˘ short); the subscript is the foot it begins in
  // (with the ending foot when the word straddles feet). Elided monosyllables
  // carry no syllable of their own; unaligned words are flagged with "?".
  function renderWordScan(tokens, pattern) {
    var spans = tokens.map(function (t) {
      var ok = /^OK/.test(String(t.match_status || "")) && t.foot_start != null;
      var cls = "scan-w" + (ok ? (t.metrical_shape ? "" : " elided") : " unk");
      var marks = ok ? (t.metrical_shape ? wordMarks(t.metrical_shape, t.foot_start, t.foot_start_pos, pattern) : "\u2019") : "?";
      var feet = "";
      if (ok) feet = t.foot_end && t.foot_end !== t.foot_start ? t.foot_start + "\u2013" + t.foot_end : String(t.foot_start);
      var title = ok ? (t.metrical_shape ? "feet " + feet : "elided") : "not aligned to the scansion";
      return '<span class="' + cls + '" title="' + UI.esc(title) + '"><span class="scan-wm">' + marks +
        '</span><span class="scan-wt">' + UI.esc(t.form) + "</span>" + (ok && feet ? "<sub>" + feet + "</sub>" : "") + "</span>";
    });
    var okT = function (t) { return /^OK/.test(String(t.match_status || "")) && t.foot_start != null; };
    var caes = caesuraPlan(tokens, pattern, okT,
      function (t) { return t.foot_end; }, function (t) { return t.foot_end_pos; }, function (t) { return t.form; });
    var out = [];
    for (var i = 0; i < spans.length; i++) {
      if (i > 0) {
        var jm = caes[i] || "";
        if (!jm) {
          var prev = tokens[i - 1];
          if (okT(prev) && prev.metrical_shape) jm = diaeresisMark(prev.foot_end, prev.foot_end_pos, pattern);
        }
        if (jm) out.push(jm);
      }
      out.push(spans[i]);
    }
    return '<div class="scan-wordscan">' + out.join(" ") + "</div>";
  }

  /* ----- paginated passage for the line-by-line scansion (50 lines/page) --- */
  var SCAN_PAGE_SIZE = 50;
  var scanLineState = { page: 0 };
  var scanLineRows = null;
  function drawLineScan(rows) {
    scanLineRows = rows;
    var total = rows.length, pages = Math.max(1, Math.ceil(total / SCAN_PAGE_SIZE));
    if (scanLineState.page >= pages) scanLineState.page = pages - 1;
    if (scanLineState.page < 0) scanLineState.page = 0;
    var start = scanLineState.page * SCAN_PAGE_SIZE, end = Math.min(total, start + SCAN_PAGE_SIZE);
    var body = rows.slice(start, end).map(function (r) {
      var toks = lineTokens(r.work, r.book, r.line_num);
      var patt = r.pattern ? r.pattern : "pattern not derivable";
      return '<div class="scan-line">' +
        '<div class="scan-ref">' + UI.esc(r.work) + " " + UI.esc(r.book) + "." + r.line_num +
          ' <span class="scan-ds">' + UI.esc(patt) + "</span></div>" +
        '<div class="scan-greek">' + UI.esc(r.line_text) + "</div>" + renderWordScan(toks, r.pattern) + "</div>";
    }).join("");
    var pager = "";
    if (total > SCAN_PAGE_SIZE) {
      pager = '<div class="pager"><span class="pager-info">Lines ' + (start + 1) + "\u2013" + end + " of " + total +
        " \u00b7 page " + (scanLineState.page + 1) + " / " + pages + '</span><span class="pager-controls">' +
        '<button class="btn btn-sm" data-scan-act="prev"' + (scanLineState.page === 0 ? " disabled" : "") + ">\u2039 Previous</button>" +
        '<button class="btn btn-sm" data-scan-act="next"' + (scanLineState.page >= pages - 1 ? " disabled" : "") + ">Next \u203a</button>" +
        '<button class="btn btn-sm" data-scan-act="last"' + (scanLineState.page >= pages - 1 ? " disabled" : "") + ">Last \u00bb</button>" +
        "</span></div>";
    }
    el.scanChart.innerHTML = pager + '<div class="scan-passage">' + body + "</div>" + (total > SCAN_PAGE_SIZE ? pager : "");
  }

  function statCards(pairs) {
    el.scanSummary.innerHTML = '<div class="analysis-grid">' + pairs.map(function (c) {
      return '<div class="analysis-card"><div class="metric">' + c[1] +
        '</div><div class="metric-label">' + UI.esc(c[0]) + "</div></div>";
    }).join("") + "</div>";
  }

  function summaryStats(vals, unit) {
    if (!vals.length) return [["Lines", 0]];
    var sum = 0, mn = Infinity, mx = -Infinity;
    for (var i = 0; i < vals.length; i++) { sum += vals[i]; if (vals[i] < mn) mn = vals[i]; if (vals[i] > mx) mx = vals[i]; }
    return [["Lines", vals.length.toLocaleString()], ["Mean " + unit, (sum / vals.length).toFixed(2)], ["Range", mn + "\u2013" + mx]];
  }

  function clearOut() { el.scanSummary.innerHTML = ""; el.scanChart.innerHTML = ""; el.scanTable.innerHTML = ""; }

  /* ----- views ------------------------------------------------------------ */

  var VIEWS = {
    line_scan: {
      desc: "Each line word by word, from the merged metrical record: \u00af marks a long syllable, \u02d8 a short, and the subscript gives the feet each word occupies (D = dactyl, S = spondee in the derived pattern). | marks a foot boundary; a tinted | after foot 4 is the bucolic diaeresis; \u2016 marks the line's single principal caesura (masculine, feminine, or hephthemimeral; postpositives and prepositives do not count as word ends), shown dotted when two third-foot breaks leave its position uncertain.",
      run: function () {
        var rows = linesAgg();
        if (!rows.length) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No lines in this range.</div>'; el.scanSummary.innerHTML = ""; return; }
        drawLineScan(rows);
        statCards([["Lines matched", rows.length.toLocaleString()], ["First", rows[0].work + " " + rows[0].book + "." + rows[0].line_num]]);
      }
    },
    word_foot: {
      desc: "Where a given word begins in the verse: its distribution over the six feet (accent-insensitive), read from the word-to-foot alignment stored in the corpus. Leave the box empty and set a grammatical category to chart that whole category instead.",
      run: function () {
        var f = readGrammar();
        var qn = normGr((el.scanWord.value || "").trim());
        if (!qn && grammarActive(f)) {
          var conds = morphScope().concat(grammarWhere(f));
          var grows = SQL.objects("SELECT foot_start ft, foot_start_pos fp, COUNT(*) n FROM morphology WHERE " +
            conds.join(" AND ") + " GROUP BY ft, fp;");
          var cc = [0, 0, 0, 0, 0, 0], pr = 0, tot = 0;
          grows.forEach(function (r) {
            var fi = (parseInt(r.ft, 10) || 0) - 1; if (fi < 0 || fi > 5) return;
            cc[fi] += r.n; tot += r.n; if (String(r.fp) === "1") pr += r.n;
          });
          if (!tot) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No ' + UI.esc(grammarLabel(f)) + ' found in this scope.</div>'; el.scanSummary.innerHTML = ""; el.scanTable.innerHTML = ""; return; }
          el.scanViewDesc.textContent = "Metrical position of all " + grammarLabel(f) + " (by the foot they begin in).";
          Chart.bars(el.scanChart, cc.map(function (v, i) { return { label: "Foot " + (i + 1), value: v }; }),
            { preserveOrder: true, valueLabel: "occurrences", labelWidth: 90,
              title: viewTitle("Starting foot of " + grammarLabel(f)) });
          statCards([["Category", grammarLabel(f)], ["Occurrences", tot.toLocaleString()], ["On the princeps", pr + " (" + (100 * pr / tot).toFixed(0) + "%)"]]);
          el.scanTable.innerHTML = "";
          return;
        }
        if (!qn) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Type a Greek or English word above, or leave it empty and pick a grammatical category below.</div>'; el.scanSummary.innerHTML = ""; return; }
        buildForms();
        var entry = FORMS[qn];
        var counts = [0, 0, 0, 0, 0, 0], princeps = 0, total = 0, ex = [];
        if (entry) {
          var variants = Object.keys(entry.forms).map(sqlStr).join(", ");
          var conds2 = morphScope().concat(["form IN (" + variants + ")"]);
          SQL.objects("SELECT foot_start ft, foot_start_pos fp, COUNT(*) n FROM morphology WHERE " +
            conds2.join(" AND ") + " GROUP BY ft, fp;").forEach(function (r) {
            var fi = (parseInt(r.ft, 10) || 0) - 1; if (fi < 0 || fi > 5) return;
            counts[fi] += r.n; total += r.n; if (String(r.fp) === "1") princeps += r.n;
          });
          var exRows = SQL.objects("SELECT DISTINCT work w, book b, CAST(verse AS INTEGER) v FROM morphology WHERE " +
            conds2.join(" AND ") + " ORDER BY work, CAST(book AS INTEGER), CAST(verse AS INTEGER) LIMIT 8;");
          ex = exRows.map(function (r) { return r.w + " " + r.b + "." + r.v + ": " + (lineTextFor(r.w, r.b, r.v) || ""); });
        }
        if (!total) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No aligned occurrences of \u201c' + UI.esc(el.scanWord.value) + '\u201d in this scope.</div>'; el.scanSummary.innerHTML = ""; el.scanTable.innerHTML = ""; return; }
        Chart.bars(el.scanChart, counts.map(function (c, i) { return { label: "Foot " + (i + 1), value: c }; }),
          { preserveOrder: true, valueLabel: "occurrences", labelWidth: 90,
            title: viewTitle("Starting foot of \u201c" + el.scanWord.value.trim() + "\u201d") });
        statCards([["Occurrences", total.toLocaleString()], ["On the princeps", princeps + " (" + (100 * princeps / total).toFixed(0) + "%)"]]);
        el.scanTable.innerHTML = ex.length ? '<div class="small-muted" style="margin:.2rem 0 .3rem;">Example lines</div>' +
          ex.map(function (e) { return '<div class="scan-ex">' + UI.esc(e) + "</div>"; }).join("") : "";
      }
    },
    foot_words: {
      desc: "The commonest word forms that begin in a chosen foot, read from the word-to-foot alignment stored in the corpus. A grammatical category restricts the words counted.",
      run: function () {
        var f = readGrammar(), useG = grammarActive(f);
        var fi = (parseInt(el.scanFoot.value, 10) || 1) - 1;
        var conds = morphScope().concat(["foot_start = " + sqlStr(String(fi + 1))]);
        if (useG) conds = conds.concat(grammarWhere(f));
        var map = new Map();
        SQL.objects("SELECT form, COUNT(*) n FROM morphology WHERE " + conds.join(" AND ") +
          " GROUP BY form;").forEach(function (r) {
          var wn = normGr(r.form); if (!wn) return;
          var e = map.get(wn); if (!e) { e = { c: 0, forms: {} }; map.set(wn, e); }
          e.c += r.n; e.forms[r.form] = (e.forms[r.form] || 0) + r.n;
        });
        var arr = Array.from(map.entries()).sort(function (a, b) { return b[1].c - a[1].c; }).slice(0, TOP_N);
        if (!arr.length) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No matching words for this foot in scope.</div>'; return; }
        Chart.bars(el.scanChart, arr.map(function (e) {
          var disp = Object.keys(e[1].forms).sort(function (a, b) { return e[1].forms[b] - e[1].forms[a]; })[0];
          return { label: disp, value: e[1].c };
        }), { valueLabel: "words starting here", labelWidth: 120,
          title: viewTitle("Commonest words beginning in foot " + (fi + 1) + (useG ? " (" + grammarLabel(f) + ")" : "")) });
        statCards([["Foot", fi + 1], ["Filter", useG ? grammarLabel(f) : "all words"], ["Distinct forms", map.size.toLocaleString()]]);
      }
    },
    lines_by_book: {
      desc: "Number of lines in each book, counted from the merged metrical record.",
      run: function () {
        var rows = SQL.objects("SELECT work, book, COUNT(DISTINCT verse) c FROM morphology WHERE " + lineScope().join(" AND ") +
          " GROUP BY work, book ORDER BY work, CAST(book AS INTEGER);");
        var both = !el.scanWork.value;
        Chart.bars(el.scanChart, rows.map(function (r) {
          return { label: both ? (r.work + " " + r.book) : ("Book " + r.book), value: r.c };
        }), { preserveOrder: true, valueLabel: "lines", labelWidth: 120, title: viewTitle("Lines per book") });
        var tot = rows.reduce(function (a, b) { return a + b.c; }, 0);
        statCards([["Books", rows.length], ["Lines", tot.toLocaleString()]]);
      }
    },
    feet_patterns: {
      desc: "The most frequent six-foot patterns (D = dactyl, S = spondee), derived line by line from the per-word metrical shapes.",
      run: function () {
        var rows = linesAgg();
        var tally = new Map(), und = 0;
        rows.forEach(function (r) {
          if (!r.pattern) { und++; return; }
          tally.set(r.pattern, (tally.get(r.pattern) || 0) + 1);
        });
        var arr = Array.from(tally.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, TOP_N);
        Chart.bars(el.scanChart, arr.map(function (e) { return { label: e[0], value: e[1] }; }),
          { valueLabel: "lines", labelWidth: 120, title: viewTitle("Commonest foot patterns (D = dactyl, S = spondee)") });
        statCards([["Distinct patterns", tally.size], ["Lines with a derived pattern", (rows.length - und).toLocaleString()],
          ["Underivable", und.toLocaleString()]]);
      }
    },
    foot_composition: {
      desc: "Share of dactyls vs spondees at each of the six metrical positions, from the derived line patterns.",
      run: function () {
        var dact = [0, 0, 0, 0, 0, 0], spon = [0, 0, 0, 0, 0, 0];
        linesAgg().forEach(function (r) {
          if (!r.pattern) return;
          for (var i = 0; i < 6; i++) { if (r.pattern[i] === "D") dact[i] += 1; else spon[i] += 1; }
        });
        var matrix = [0, 1, 2, 3, 4, 5].map(function (i) { return [dact[i], spon[i]]; });
        Chart.stackedBars(el.scanChart, matrix,
          ["Foot 1", "Foot 2", "Foot 3", "Foot 4", "Foot 5", "Foot 6"],
          ["Dactyl", "Spondee"], { valueLabel: "lines", title: viewTitle("Dactyls vs spondees by foot"), yLabel: "lines" });
        el.scanTable.innerHTML = "";
      }
    },
    quantity: {
      desc: "Total long (\u00af) and short (\u02d8) syllables across the selected lines, summed from the per-word metrical shapes.",
      run: function () {
        var r = SQL.objects("SELECT SUM(LENGTH(metrical_shape) - LENGTH(REPLACE(metrical_shape, 'H', ''))) h, " +
          "SUM(LENGTH(metrical_shape) - LENGTH(REPLACE(metrical_shape, 'L', ''))) l FROM morphology WHERE " +
          morphScope().join(" AND ") + ";")[0] || {};
        var L = r.h || 0, S = r.l || 0;
        Chart.bars(el.scanChart, [{ label: "Long (\u00af)", value: L }, { label: "Short (\u02d8)", value: S }],
          { preserveOrder: true, valueLabel: "syllables", labelWidth: 120, title: viewTitle("Long vs short syllables") });
        var tot = L + S;
        statCards([["Long", L.toLocaleString()], ["Short", S.toLocaleString()], ["% long", tot ? (100 * L / tot).toFixed(1) + "%" : "\u2013"]]);
      }
    },
    syllables: {
      desc: "Distribution of syllable counts per line, from the per-word metrical shapes.",
      run: function () {
        var vals = linesAgg().filter(function (r) { return !r.bad; }).map(function (r) { return r.n_syllables; });
        Chart.histogram(el.scanChart, vals, { color: Chart.color(0), title: viewTitle("Syllables per line"), xLabel: "syllables in the line", yLabel: "lines" });
        statCards(summaryStats(vals, "syllables"));
      }
    },
    words: {
      desc: "Distribution of word counts per line.",
      run: function () {
        var vals = linesAgg().map(function (r) { return r.n_words; });
        Chart.histogram(el.scanChart, vals, { color: Chart.color(2), title: viewTitle("Words per line"), xLabel: "words in the line", yLabel: "lines" });
        statCards(summaryStats(vals, "words"));
      }
    },
    book_summary: {
      desc: "Per-book totals, computed from the merged metrical record.",
      run: function () {
        var res = SQL.query("SELECT work, book, COUNT(DISTINCT verse) n_lines, COUNT(*) total_words, " +
          "SUM(CAST(n_syllables AS INTEGER)) total_syllables FROM morphology WHERE " + lineScope().join(" AND ") +
          " GROUP BY work, book ORDER BY work, CAST(book AS INTEGER);");
        el.scanChart.innerHTML = "";
        UI.renderTable(el.scanTable, res.columns, res.values, { paginate: true, pageSize: 50 });
      }
    },
    lines_table: {
      desc: "Individual lines with their derived foot pattern (D = dactyl, S = spondee). First 500.",
      run: function () {
        var rows = linesAgg().slice(0, 500);
        el.scanChart.innerHTML = "";
        UI.renderTable(el.scanTable, ["work", "book", "line", "syllables", "pattern", "text"],
          rows.map(function (r) { return [r.work, r.book, r.line_num, r.n_syllables, r.pattern || "\u2013", r.line_text]; }),
          { paginate: true, pageSize: 50 });
      }
    }
  };

  function syncScanControls() {
    var v = el.scanView.value;
    el.scanWordWrap.hidden = (v !== "word_foot");
    el.scanFootWrap.hidden = (v !== "foot_words");
    el.scanGrammar.hidden = !(v === "word_foot" || v === "foot_words");
  }

  function run() {
    if (!SQL || !SQL.isReady()) return;
    syncScanControls();
    scanLineState.page = 0;
    if (el.scanWordMenu) el.scanWordMenu.hidden = true;
    var view = VIEWS[el.scanView.value] || VIEWS.line_scan;
    el.scanViewDesc.textContent = view.desc;
    clearOut();
    try { view.run(); }
    catch (e) {
      el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Could not render this view: ' + UI.esc(e.message) + "</div>";
    }
  }

  // Book and verse only make sense within one work: both controls stay hidden
  // (values cleared) until a work is chosen, and the book list is rebuilt from
  // the books attested in that work — the same behaviour as the morphology
  // scope filters.
  function populateBooks() {
    var work = el.scanWork.value;
    el.scanBookWrap.hidden = !work;
    el.scanVerseWrap.hidden = !work;
    if (!work) {
      el.scanBook.innerHTML = '<option value="">(all books)</option>';
      el.scanBook.value = "";
      el.scanVerse.value = "";
      return;
    }
    var books = SQL.query("SELECT DISTINCT book FROM morphology WHERE work = " + sqlStr(work) +
      " AND book IS NOT NULL AND book <> '' ORDER BY CAST(book AS INTEGER), book;").values.map(function (r) { return r[0]; });
    UI.fillSelect(el.scanBook, books, { head: "(all books)" });
  }

  // The word-search panel is the shared MopsosSearch card (mopsos-shared.js);
  // this page grafts the metrical filters onto it through the card's hooks,
  // the same way morphology grafts its part-of-speech drop-downs: their
  // conditions ride in the same generated query, lock with the same manual
  // mode, and clear with the same Reset. Only this card orders numerically by
  // work, book, and verse (the config's orderBy), so the matches read in line
  // order; the morphology card keeps its own ordering.
  var PS_EXTRA = ["psShape", "psFootStart", "psFootStartPos", "psFootEnd", "psFootEndPos"];
  var PS_FOOT = [["psFootStart", "foot_start"], ["psFootStartPos", "foot_start_pos"],
                 ["psFootEnd", "foot_end"], ["psFootEndPos", "foot_end_pos"]];
  function initSearchCard() {
    if (!window.MopsosSearch || !document.getElementById("psResults")) return;
    var Search = window.MopsosSearch;
    var $ = function (id) { return document.getElementById(id); };

    // Foot and position drop-downs offer the values attested in the corpus.
    PS_FOOT.forEach(function (p) {
      var c = $(p[0]); if (c) UI.fillSelect(c, SQL.distinct(p[1]), { head: "(any)" });
    });

    var card = Search.card({
      prefix: "ps",
      applyBtn: "btnPsApply",
      resetBtn: "btnPsReset",
      previewCols: ["work", "book", "verse", "form", "lemma", "metrical_shape",
                    "foot_start", "foot_start_pos", "foot_end", "foot_end_pos"],
      baseConds: ['match_status <> "CONFLICT_NO_MATCH"', "is_valid = 1"],
      worksWhere: 'match_status <> "CONFLICT_NO_MATCH" AND is_valid = 1',
      orderBy: '"work", CAST(book AS INTEGER), CAST(verse AS INTEGER)',
      extraConds: function () {
        var out = [];
        var shp = ($("psShape").value || "").trim().toUpperCase();
        if (shp) out.push("metrical_shape = " + Search.sqlStr(shp));
        PS_FOOT.forEach(function (p) {
          var v = $(p[0]).value;
          if (v) out.push(p[1] + " = " + Search.sqlStr(String(v)));
        });
        return out;
      },
      onLock: function (on) { PS_EXTRA.forEach(function (id) { var c = $(id); if (c) c.disabled = !on; }); },
      onReset: function () { PS_EXTRA.forEach(function (id) { var c = $(id); if (c) c.value = ""; }); }
    });

    // The shape box is freetext with a browse of the shapes actually attested,
    // narrowed as the user types (typing "HL" offers HL, HLL, HLH, ...);
    // whatever is typed is uppercased into the query as-is, so an unattested
    // shape honestly matches nothing.
    var shapes = null;
    function shapeItems() {
      if (shapes) return shapes;
      shapes = SQL.objects("SELECT metrical_shape s, COUNT(*) c FROM morphology" +
        " WHERE metrical_shape IS NOT NULL AND metrical_shape <> '' GROUP BY s ORDER BY c DESC;")
        .map(function (r) { return { key: String(r.s).toLowerCase(), display: r.s, beta: r.s, meta: r.c + "\u00d7" }; });
      return shapes;
    }
    if ($("psShape") && $("psShapeMenu")) {
      UI.greekCombo($("psShape"), $("psShapeMenu"), {
        items: shapeItems,
        onSelect: function (it) { $("psShape").value = it.display; }
      });
      $("psShape").addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); card.apply(); }
      });
    }
  }

  function init() {
    grab();
    if (!el.scanView) return; // not on this page
    // The on-page summary element is gone, but the views still write their
    // stat cards; give them a detached sink rather than touching each one
    // (they come back with the other views later).
    if (!el.scanSummary) el.scanSummary = document.createElement("div");

    // Changing a control never reruns the view: rendering happens only on
    // "Show view" (or Enter in a text box, its keyboard synonym). Changing
    // the work still rebuilds the dependent book list, and changing the view
    // still reveals its controls — neither touches the output.
    el.scanView.addEventListener("change", syncScanControls);
    el.scanWork.addEventListener("change", populateBooks);
    el.scanVerse.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
    el.scanWord.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
    wireCombo();
    el.scanChart.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-scan-act]");
      if (!b || el.scanView.value !== "line_scan" || !scanLineRows) return;
      var pages = Math.max(1, Math.ceil(scanLineRows.length / SCAN_PAGE_SIZE));
      var act = b.getAttribute("data-scan-act");
      if (act === "first") scanLineState.page = 0;
      else if (act === "prev") scanLineState.page = Math.max(0, scanLineState.page - 1);
      else if (act === "next") scanLineState.page = Math.min(pages - 1, scanLineState.page + 1);
      else if (act === "last") scanLineState.page = pages - 1;
      drawLineScan(scanLineRows);
    });
    el.btnRunScan.addEventListener("click", run);

    SQL.ready().then(function () {
      if (el.scanLoadStatus) el.scanLoadStatus.style.display = "none";
      el.btnRunScan.disabled = false;
      // Every scanned work is offered, straight from the corpus. Nothing is
      // saved or restored across page loads: every visit starts at the same
      // place, Iliad 1.1-5, scanned line by line.
      UI.fillSelect(el.scanWork, SQL.distinct("work"), { head: "(all works)" });
      el.scanWork.value = "Iliad";
      populateBooks();
      if (el.scanWork.value) {
        el.scanBook.value = "1";
        el.scanVerse.value = "1-5";
      }
      syncScanControls();
      run();
      initSearchCard();
    }).catch(function (e) {
      if (el.scanLoadStatus) el.scanLoadStatus.innerHTML = '<span>Could not load scansion corpus: ' + UI.esc(e.message) + "</span>";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
