/* ============================================================================
 *  SCANSION (PROSODY) TAB
 *  One view at a time, chosen from a drop-down, computed live with SQL over
 *  the shared in-browser database (tables scansion_lines, scansion_books)
 *  and drawn with D3. Each Homeric line is scanned into six hexameter feet,
 *  each a dactyl (LSS) or spondee (LL); feet_pattern stores them as
 *  "LSS|LSS|LL|LSS|LSS|LL".
 * ========================================================================== */
(function () {
  var SQL = window.MopsosSQL, UI = window.MopsosUI, Chart = window.MopsosChart;
  var el = {};

  function grab() {
    ["scanLoadStatus", "scanView", "scanWork", "scanBook", "scanTopN", "btnRunScan",
     "scanViewDesc", "scanSummary", "scanChart", "scanTable",
     "scanLineWrap", "scanLineFrom", "scanWordWrap", "scanWord", "scanWordMenu", "scanFootWrap", "scanFoot",
     "scanGrammar", "scanGPos", "scanGCase", "scanGNumber", "scanGGender", "scanGTense", "scanGMood", "scanGVoice", "scanGPerson"]
      .forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  function scopeWhere() {
    var w = [];
    if (el.scanWork.value) w.push("work = " + sqlStr(el.scanWork.value));
    if (el.scanBook.value && !el.scanBook.disabled) w.push("book = " + sqlStr(el.scanBook.value));
    return w.length ? " WHERE " + w.join(" AND ") : "";
  }

  function topN() {
    var n = parseInt(el.scanTopN.value, 10);
    if (!isFinite(n) || n < 1) n = 15;
    return Math.min(n, 55);
  }

  // "LSS|LL|..." -> compact "DS..." (D = dactyl, S = spondee)
  function footLabel(p) {
    return String(p).split("|").map(function (f) {
      return f === "LSS" ? "D" : f === "LL" ? "S" : "?";
    }).join("");
  }

  /* ----- word-to-foot alignment ------------------------------------------- */

  var DIPH = { "αι": 1, "αυ": 1, "ει": 1, "ευ": 1, "ηυ": 1, "οι": 1, "ου": 1, "υι": 1, "ωυ": 1 };
  function stripDia(s) { return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function normGr(w) { return stripDia(w).replace(/[\u2019'\u02bc]/g, ""); }
  function tokenize(line) {
    return String(line).split(/\s+/)
      .map(function (t) { return t.replace(/[^\u0370-\u03ff\u1f00-\u1fff\u2019'\u02bc]/g, ""); })
      .filter(Boolean);
  }
  function sylCount(w) {
    var r = stripDia(w), n = 0, i = 0;
    while (i < r.length) {
      var c = r[i];
      if ("αεηιουω".indexOf(c) >= 0) {
        if (DIPH[r.substr(i, 2)]) { n++; i += 2; } else { n++; i++; }
      } else i++;
    }
    return n;
  }
  // Align each word of a line to its starting foot; null if syllables don't match.
  function alignLine(text, pattern, nSyl) {
    var ws = tokenize(text), counts = ws.map(sylCount);
    var tot = counts.reduce(function (a, b) { return a + b; }, 0);
    if (tot !== nSyl) return null;
    var feet = String(pattern).split("|"), footStart = [], acc = 0, i;
    for (i = 0; i < feet.length; i++) { footStart.push(acc); acc += feet[i].length; }
    function footOf(si) { var fi = 0; for (var k = 0; k < feet.length; k++) { if (si >= footStart[k]) fi = k; else break; } return fi; }
    var out = [], si = 0;
    for (i = 0; i < ws.length; i++) {
      var sf = footOf(si);
      out.push({ w: ws[i], wn: normGr(ws[i]), foot: sf, princeps: si === footStart[sf], syl: counts[i] });
      si += counts[i];
    }
    return out;
  }

  var ALIGN = null;
  function buildAlign() {
    if (ALIGN) return;
    var rows = SQL.objects("SELECT work, book, line_num, n_syllables, feet_pattern, line_text FROM scansion_lines;");
    ALIGN = rows.map(function (r) { r.al = alignLine(r.line_text, r.feet_pattern, r.n_syllables); return r; });
  }
  function inScope(L) {
    if (el.scanWork.value && L.work !== el.scanWork.value) return false;
    if (el.scanBook.value && !el.scanBook.disabled && String(L.book) !== el.scanBook.value) return false;
    return true;
  }

  /* ----- grammatical category (form -> commonest analysis in the corpus) --- */
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
  var FORMFEAT = null;
  function buildFormFeat() {
    if (FORMFEAT) return;
    var rows = SQL.objects('SELECT form, pos, "case" c, number num, gender gen, tense tns, mood md, voice vc, person prs, COUNT(*) n FROM morphology WHERE form NOT IN (\'\',\'-\') GROUP BY form, pos, c, num, gen, tns, md, vc, prs;');
    var best = {};
    rows.forEach(function (r) {
      var k = normGr(r.form);
      if (!best[k] || r.n > best[k]._n) best[k] = { pos: r.pos, "case": r.c, number: r.num, gender: r.gen, tense: r.tns, mood: r.md, voice: r.vc, person: r.prs, _n: r.n };
    });
    FORMFEAT = best;
  }
  var GMAP = { pos: "scanGPos", "case": "scanGCase", number: "scanGNumber", gender: "scanGGender", tense: "scanGTense", mood: "scanGMood", voice: "scanGVoice", person: "scanGPerson" };
  function readGrammar() {
    var f = {};
    GFIELDS.forEach(function (k) { var c = el[GMAP[k]]; if (c && c.value) f[k] = c.value; });
    return f;
  }
  function grammarActive(f) { return Object.keys(f).length > 0; }
  function featMatch(wn, f) { var a = FORMFEAT[wn]; if (!a) return false; for (var k in f) if (a[k] !== f[k]) return false; return true; }
  function grammarLabel(f) {
    var parts = GFIELDS.filter(function (k) { return f[k]; }).map(function (k) { return GLABEL[k][f[k]] || f[k]; });
    return parts.length ? parts.join(" ") : "words";
  }

  /* ----- word autocomplete: Greek prefix, or English via the LSJ bridge ---- */
  var FORMS = null, FORMLIST = null, LEMMAFORMS = null;
  function buildForms() {
    if (FORMS) return;
    buildAlign();
    FORMS = {};
    ALIGN.forEach(function (L) { if (!L.al) return; L.al.forEach(function (w) {
      var e = FORMS[w.wn]; if (!e) e = FORMS[w.wn] = { forms: {}, c: 0 }; e.c++; e.forms[w.w] = (e.forms[w.w] || 0) + 1;
    }); });
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
      var sem = window.MopsosSemantics, seeds = [];
      if (sem && sem.resolve) { var res = sem.resolve(q); seeds = (res && res.seeds) || []; }
      var out = [], seen = {};
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
      run();
    });
    el.scanWord.addEventListener("blur", function () { setTimeout(function () { if (el.scanWordMenu) el.scanWordMenu.hidden = true; }, 160); });
    el.scanWord.addEventListener("keydown", function (e) { if (e.key === "Escape") el.scanWordMenu.hidden = true; });
  }

  // Render a foot pattern as metrical marks (— long, ‿ short) grouped into feet.
  function renderFeet(pattern, al) {
    var feet = String(pattern).split("|");
    var cells = feet.map(function (f) {
      var marks = f.split("").map(function (c) { return c === "L" ? "\u2014" : "\u203f"; }).join("\u2009");
      var lab = f === "LSS" ? "D" : f === "LL" ? "S" : "?";
      return '<span class="scan-foot"><span class="scan-marks">' + marks + '</span><span class="scan-flab">' + lab + "</span></span>";
    }).join('<span class="scan-div">|</span>');
    var words = "";
    if (al) {
      words = '<div class="scan-words">' + al.map(function (x) {
        return UI.esc(x.w) + '<sub>' + (x.foot + 1) + '</sub>';
      }).join(" ") + "</div>";
    }
    return '<div class="scan-feet">' + cells + "</div>" + words;
  }

  /* ----- per-syllable scansion (syllabify + align weights to syllables) ---- */

  var VOWS = "αεηιουω";
  var DIPHSET = { "αι": 1, "αυ": 1, "ει": 1, "ευ": 1, "ηυ": 1, "οι": 1, "ου": 1, "υι": 1, "ωυ": 1 };
  var ONSET2 = { "βρ":1,"βλ":1,"γρ":1,"γλ":1,"γν":1,"δρ":1,"θρ":1,"θλ":1,"θν":1,"κρ":1,"κλ":1,"κν":1,"κτ":1,"πρ":1,"πλ":1,"πν":1,"πτ":1,"τρ":1,"τλ":1,"φρ":1,"φλ":1,"φθ":1,"χρ":1,"χλ":1,"χθ":1,"στ":1,"σπ":1,"σκ":1,"σφ":1,"σθ":1,"σχ":1,"σμ":1,"σβ":1,"μν":1,"δμ":1,"τμ":1 };

  function unitize(word) {
    var out = [], chars = Array.from(word.normalize("NFC"));
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i], d = ch.normalize("NFD"), base = d[0].toLowerCase();
      out.push({
        ch: ch, base: base,
        circ: d.indexOf("\u0342") >= 0, iotasub: d.indexOf("\u0345") >= 0, dia: d.indexOf("\u0308") >= 0,
        apo: /[\u2019'\u02bc]/.test(ch), isV: VOWS.indexOf(base) >= 0
      });
    }
    return out;
  }
  // Syllabify one word into syllables carrying weight class + diaeresis split text.
  function syllabify(word) {
    var u = unitize(word), n = u.length, nuc = [], i = 0;
    while (i < n) {
      if (u[i].isV) {
        var len = 1;
        if (i + 1 < n && u[i + 1].isV && !u[i + 1].dia && !u[i].dia && DIPHSET[u[i].base + u[i + 1].base]) len = 2;
        nuc.push({ s: i, e: i + len - 1 }); i += len;
      } else i++;
    }
    if (!nuc.length) return [{ text: word, startsVowel: false, endsVowel: false, diph: false, wc: "L" }];
    var segs = nuc.map(function (nk) { return { nuc: nk, uStart: 0, uEnd: n - 1 }; }), k;
    for (k = 0; k < nuc.length; k++) {
      if (k === 0) { segs[k].uStart = 0; continue; }
      var run = [], j;
      for (j = nuc[k - 1].e + 1; j < nuc[k].s; j++) run.push(j);
      var split;
      if (run.length <= 1) split = 0;
      else { var last2 = u[run[run.length - 2]].base + u[run[run.length - 1]].base; split = ONSET2[last2] ? run.length - 2 : run.length - 1; }
      segs[k].uStart = run.length ? (split < run.length ? run[split] : nuc[k].s) : nuc[k].s;
    }
    for (k = 0; k < segs.length; k++) segs[k].uEnd = (k + 1 < segs.length ? segs[k + 1].uStart - 1 : n - 1);
    return segs.map(function (s) {
      var text = u.slice(s.uStart, s.uEnd + 1).map(function (x) { return x.ch; }).join("");
      var startsVowel = s.uStart === s.nuc.s, lastU = u[s.uEnd];
      var endsVowel = lastU.isV && !lastU.apo, diph = s.nuc.e > s.nuc.s;
      var closed = false, j;
      for (j = s.nuc.e + 1; j <= s.uEnd; j++) if (!u[j].isV && !u[j].apo) closed = true;
      var nb = u[s.nuc.s], circ = nb.circ || (diph && u[s.nuc.e].circ), wc;
      if (closed || diph || circ || nb.iotasub || nb.base === "η" || nb.base === "ω") wc = "L";
      else if (nb.base === "ε" || nb.base === "ο") wc = "S";
      else wc = "?";
      var diaSplit = null;
      if (diph) {
        diaSplit = [u.slice(s.uStart, s.nuc.e).map(function (x) { return x.ch; }).join(""),
                    u.slice(s.nuc.e, s.uEnd + 1).map(function (x) { return x.ch; }).join("")];
      }
      return { text: text, startsVowel: startsVowel, endsVowel: endsVowel, diph: diph, wc: wc, diaSplit: diaSplit };
    });
  }
  function lineSyllables(line) {
    var ws = tokenize(line), out = [];
    ws.forEach(function (w, wi) { syllabify(w).forEach(function (s) { s.wi = wi; out.push(s); }); });
    return out;
  }
  // Align orthographic syllables to the metrical weight sequence, using each
  // syllable's natural weight to place synizesis (merge) and diaeresis (split)
  // where the metre actually requires them. Returns metrical-position cells.
  function alignSyllables(line, pattern, nSyl) {
    var S = lineSyllables(line), W = String(pattern).split("|").join("").split("");
    var m = S.length, k = W.length;
    if (k !== nSyl) return null;
    var INF = 1e9, i, j;
    var dp = [], bk = [];
    for (i = 0; i <= m; i++) { dp.push(new Array(k + 1).fill(INF)); bk.push(new Array(k + 1).fill(null)); }
    dp[0][0] = 0;
    function mcost(wc, w) { return wc === "?" ? 0 : (wc === w ? 0 : 3); }
    for (i = 0; i <= m; i++) for (j = 0; j <= k; j++) {
      var cur = dp[i][j]; if (cur >= INF) continue;
      if (i < m && j < k) { var c1 = cur + mcost(S[i].wc, W[j]); if (c1 < dp[i + 1][j + 1]) { dp[i + 1][j + 1] = c1; bk[i + 1][j + 1] = [i, j, "m"]; } }
      if (i + 1 < m && j < k && S[i].endsVowel && S[i + 1].startsVowel) { var c2 = cur + 0.6 + (W[j] === "L" ? 0 : 1.5); if (c2 < dp[i + 2][j + 1]) { dp[i + 2][j + 1] = c2; bk[i + 2][j + 1] = [i, j, "syn"]; } }
      if (i < m && j + 1 < k && S[i].diph) { var c3 = cur + 1.0; if (c3 < dp[i + 1][j + 2]) { dp[i + 1][j + 2] = c3; bk[i + 1][j + 2] = [i, j, "dia"]; } }
    }
    if (dp[m][k] >= INF) return null;
    var cells = []; i = m; j = k;
    while (i > 0 || j > 0) {
      var b = bk[i][j]; if (!b) return null;
      var pi = b[0], pj = b[1], op = b[2];
      if (op === "m") cells.unshift({ text: S[pi].text, weight: W[pj] });
      else if (op === "syn") cells.unshift({ text: S[pi].text + S[pi + 1].text, weight: W[pj], syn: true });
      else { var sp = S[pi].diaSplit || [S[pi].text, ""];
        cells.unshift({ text: sp[1], weight: W[pj + 1], dia: true });
        cells.unshift({ text: sp[0], weight: W[pj], dia: true }); }
      i = pi; j = pj;
    }
    return cells;
  }
  // Render the per-syllable scansion: marks above each syllable, grouped by foot.
  function renderSylScan(pattern, cells) {
    var lens = String(pattern).split("|").map(function (f) { return f.length; });
    var idx = 0;
    var feet = lens.map(function (len) {
      var cols = "";
      for (var p = 0; p < len; p++) {
        var c = cells[idx++]; if (!c) continue;
        var mark = c.weight === "L" ? "\u00af" : "\u02d8";
        var cls = "syl-col" + (c.syn ? " syn" : "") + (c.dia ? " dia" : "");
        cols += '<span class="' + cls + '"' + (c.syn ? ' title="synizesis"' : (c.dia ? ' title="diaeresis"' : "")) +
          '><span class="syl-mark">' + mark + '</span><span class="syl-txt">' + UI.esc(c.text) + "</span></span>";
      }
      return '<span class="syl-foot">' + cols + '<span class="syl-flab">' + (len === 3 ? "D" : len === 2 ? "S" : "?") + "</span></span>";
    }).join('<span class="syl-div">|</span>');
    return '<div class="syl-scan">' + feet + "</div>";
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
      var cells = alignSyllables(r.line_text, r.feet_pattern, r.n_syllables);
      var inner = cells ? renderSylScan(r.feet_pattern, cells)
        : renderFeet(r.feet_pattern, alignLine(r.line_text, r.feet_pattern, r.n_syllables));
      return '<div class="scan-line">' +
        '<div class="scan-ref">' + UI.esc(r.work) + " " + UI.esc(r.book) + "." + r.line_num +
          ' <span class="scan-ds">' + footLabel(r.feet_pattern) + (cells ? "" : " \u00b7 syllabified loosely") + "</span></div>" +
        '<div class="scan-greek">' + UI.esc(r.line_text) + "</div>" + inner + "</div>";
    }).join("");
    var pager = "";
    if (total > SCAN_PAGE_SIZE) {
      pager = '<div class="pager"><span class="pager-info">Lines ' + (start + 1) + "\u2013" + end + " of " + total +
        " \u00b7 page " + (scanLineState.page + 1) + " / " + pages + '</span><span class="pager-controls">' +
        '<button class="btn btn-sm" data-scan-act="first"' + (scanLineState.page === 0 ? " disabled" : "") + ">\u00ab First</button>" +
        '<button class="btn btn-sm" data-scan-act="prev"' + (scanLineState.page === 0 ? " disabled" : "") + ">\u2039 Prev</button>" +
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
    return [["Lines", vals.length.toLocaleString()], ["Mean " + unit, (sum / vals.length).toFixed(2)], ["Range", mn + "–" + mx]];
  }

  function clearOut() { el.scanSummary.innerHTML = ""; el.scanChart.innerHTML = ""; el.scanTable.innerHTML = ""; }

  /* ----- views ------------------------------------------------------------ */

  var VIEWS = {
    line_scan: {
      desc: "Each line scanned syllable by syllable \u2014 \u00af marks a long position, \u02d8 a short; D dactyl, S spondee. Synizesis (two written vowels scanned as one) and diaeresis are aligned to the metre.",
      run: function () {
        var from = parseInt(el.scanLineFrom.value, 10); if (!isFinite(from) || from < 1) from = 1;
        var sc = scopeWhere();
        var clause = sc ? sc + " AND line_num >= " + from : " WHERE line_num >= " + from;
        var rows = SQL.objects("SELECT work, book, line_num, n_syllables, feet_pattern, line_text FROM scansion_lines" +
          clause + " ORDER BY work, CAST(book AS INTEGER), line_num;");
        if (!rows.length) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No lines in this range.</div>'; el.scanSummary.innerHTML = ""; return; }
        drawLineScan(rows);
        statCards([["Lines matched", rows.length.toLocaleString()], ["First", rows[0].work + " " + rows[0].book + "." + rows[0].line_num]]);
      }
    },
    word_foot: {
      desc: "Where a given word begins in the verse \u2014 its distribution over the six feet (accent-insensitive, on alignable lines). Leave the box empty and set a grammatical category to chart that whole category instead.",
      run: function () {
        var f = readGrammar();
        var qn = normGr((el.scanWord.value || "").trim());
        if (!qn && grammarActive(f)) {
          buildAlign(); buildFormFeat();
          var cc = [0, 0, 0, 0, 0, 0], pr = 0, tot = 0;
          ALIGN.forEach(function (L) {
            if (!L.al || !inScope(L)) return;
            L.al.forEach(function (w) { if (featMatch(w.wn, f)) { cc[w.foot]++; tot++; if (w.princeps) pr++; } });
          });
          if (!tot) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No ' + UI.esc(grammarLabel(f)) + ' found in this scope.</div>'; el.scanSummary.innerHTML = ""; el.scanTable.innerHTML = ""; return; }
          el.scanViewDesc.textContent = "Metrical position of all " + grammarLabel(f) + " (by the foot they begin in).";
          Chart.bars(el.scanChart, cc.map(function (v, i) { return { label: "Foot " + (i + 1), value: v }; }),
            { preserveOrder: true, valueLabel: "occurrences", labelWidth: 90 });
          statCards([["Category", grammarLabel(f)], ["Occurrences", tot.toLocaleString()], ["On the princeps", pr + " (" + (100 * pr / tot).toFixed(0) + "%)"]]);
          el.scanTable.innerHTML = "";
          return;
        }
        if (!qn) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Type a Greek or English word above, or leave it empty and pick a grammatical category below.</div>'; el.scanSummary.innerHTML = ""; return; }
        buildAlign();
        var counts = [0, 0, 0, 0, 0, 0], princeps = 0, total = 0, ex = [];
        ALIGN.forEach(function (L) {
          if (!L.al || !inScope(L)) return;
          L.al.forEach(function (w) {
            if (w.wn === qn) { counts[w.foot]++; total++; if (w.princeps) princeps++; if (ex.length < 8) ex.push(L.work + " " + L.book + "." + L.line_num + ": " + L.line_text); }
          });
        });
        if (!total) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No alignable occurrences of \u201c' + UI.esc(el.scanWord.value) + '\u201d in this scope.</div>'; el.scanSummary.innerHTML = ""; el.scanTable.innerHTML = ""; return; }
        Chart.bars(el.scanChart, counts.map(function (c, i) { return { label: "Foot " + (i + 1), value: c }; }),
          { preserveOrder: true, valueLabel: "occurrences", labelWidth: 90 });
        statCards([["Occurrences", total.toLocaleString()], ["On the princeps", princeps + " (" + (100 * princeps / total).toFixed(0) + "%)"]]);
        el.scanTable.innerHTML = '<div class="small-muted" style="margin:.2rem 0 .3rem;">Example lines</div>' +
          ex.map(function (e) { return '<div class="scan-ex">' + UI.esc(e) + "</div>"; }).join("");
      }
    },
    foot_words: {
      desc: "The commonest word forms that begin in a chosen foot, on alignable lines. A grammatical category restricts the words counted.",
      run: function () {
        buildAlign();
        var f = readGrammar(), useG = grammarActive(f); if (useG) buildFormFeat();
        var fi = (parseInt(el.scanFoot.value, 10) || 1) - 1;
        var map = new Map();
        ALIGN.forEach(function (L) {
          if (!L.al || !inScope(L)) return;
          L.al.forEach(function (w) {
            if (w.foot !== fi) return;
            if (useG && !featMatch(w.wn, f)) return;
            var e = map.get(w.wn); if (!e) { e = { c: 0, forms: {} }; map.set(w.wn, e); } e.c++; e.forms[w.w] = (e.forms[w.w] || 0) + 1;
          });
        });
        var arr = Array.from(map.entries()).sort(function (a, b) { return b[1].c - a[1].c; }).slice(0, topN());
        if (!arr.length) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No matching words for this foot in scope.</div>'; return; }
        Chart.bars(el.scanChart, arr.map(function (e) {
          var disp = Object.keys(e[1].forms).sort(function (a, b) { return e[1].forms[b] - e[1].forms[a]; })[0];
          return { label: disp, value: e[1].c };
        }), { valueLabel: "words starting here", labelWidth: 120 });
        statCards([["Foot", fi + 1], ["Filter", useG ? grammarLabel(f) : "all words"], ["Distinct forms", map.size.toLocaleString()]]);
      }
    },
    lines_by_book: {
      desc: "Number of scanned lines in each book.",
      run: function () {
        var rows = SQL.objects("SELECT work, book, COUNT(*) c FROM scansion_lines" + scopeWhere() +
          " GROUP BY work, book ORDER BY work, CAST(book AS INTEGER);");
        var both = !el.scanWork.value;
        Chart.bars(el.scanChart, rows.map(function (r) {
          return { label: both ? (r.work + " " + r.book) : ("Book " + r.book), value: r.c };
        }), { preserveOrder: true, valueLabel: "lines", labelWidth: 120 });
        var tot = rows.reduce(function (a, b) { return a + b.c; }, 0);
        statCards([["Books", rows.length], ["Lines", tot.toLocaleString()]]);
      }
    },
    feet_patterns: {
      desc: "The most frequent six-foot patterns (D = dactyl LSS, S = spondee LL).",
      run: function () {
        var rows = SQL.objects("SELECT feet_pattern p, COUNT(*) c FROM scansion_lines" + scopeWhere() +
          " GROUP BY feet_pattern ORDER BY c DESC LIMIT " + topN() + ";");
        Chart.bars(el.scanChart, rows.map(function (r) { return { label: footLabel(r.p), value: r.c }; }),
          { valueLabel: "lines", labelWidth: 120 });
        statCards([["Distinct patterns", SQL.scalar("SELECT COUNT(DISTINCT feet_pattern) FROM scansion_lines" + scopeWhere() + ";")]]);
      }
    },
    foot_composition: {
      desc: "Share of dactyls vs spondees at each of the six metrical positions.",
      run: function () {
        var rows = SQL.objects("SELECT feet_pattern p, COUNT(*) c FROM scansion_lines" + scopeWhere() + " GROUP BY feet_pattern;");
        var dact = [0, 0, 0, 0, 0, 0], spon = [0, 0, 0, 0, 0, 0];
        rows.forEach(function (r) {
          var feet = String(r.p).split("|");
          for (var i = 0; i < 6; i++) { if (feet[i] === "LSS") dact[i] += r.c; else if (feet[i] === "LL") spon[i] += r.c; }
        });
        var matrix = [0, 1, 2, 3, 4, 5].map(function (i) { return [dact[i], spon[i]]; });
        Chart.stackedBars(el.scanChart, matrix,
          ["Foot 1", "Foot 2", "Foot 3", "Foot 4", "Foot 5", "Foot 6"],
          ["Dactyl", "Spondee"], { valueLabel: "lines" });
        el.scanTable.innerHTML = "";
      }
    },
    quantity: {
      desc: "Total long (—) and short (‿) syllables across the selected lines, from the foot patterns.",
      run: function () {
        var rows = SQL.objects("SELECT feet_pattern p, COUNT(*) c FROM scansion_lines" + scopeWhere() + " GROUP BY feet_pattern;");
        var L = 0, S = 0;
        rows.forEach(function (r) {
          var s = String(r.p);
          L += (s.match(/L/g) || []).length * r.c;
          S += (s.match(/S/g) || []).length * r.c;
        });
        Chart.bars(el.scanChart, [{ label: "Long (—)", value: L }, { label: "Short (‿)", value: S }],
          { preserveOrder: true, valueLabel: "syllables", labelWidth: 120 });
        var tot = L + S;
        statCards([["Long", L.toLocaleString()], ["Short", S.toLocaleString()], ["% long", tot ? (100 * L / tot).toFixed(1) + "%" : "—"]]);
      }
    },
    syllables: {
      desc: "Distribution of syllable counts per line.",
      run: function () {
        var vals = SQL.query("SELECT n_syllables FROM scansion_lines" + scopeWhere() + ";").values
          .map(function (r) { return r[0]; }).filter(function (v) { return v != null; });
        Chart.histogram(el.scanChart, vals, { color: Chart.color(0) });
        statCards(summaryStats(vals, "syllables"));
      }
    },
    words: {
      desc: "Distribution of word counts per line.",
      run: function () {
        var vals = SQL.query("SELECT n_words FROM scansion_lines" + scopeWhere() + ";").values
          .map(function (r) { return r[0]; }).filter(function (v) { return v != null; });
        Chart.histogram(el.scanChart, vals, { color: Chart.color(2) });
        statCards(summaryStats(vals, "words"));
      }
    },
    speech: {
      desc: "Lines in direct speech vs narration.",
      run: function () {
        var rows = SQL.objects("SELECT is_speech s, COUNT(*) c FROM scansion_lines" + scopeWhere() + " GROUP BY is_speech;");
        var map = {}; rows.forEach(function (r) { map[r.s] = r.c; });
        var nar = map[0] || 0, spe = map[1] || 0, tot = nar + spe;
        Chart.bars(el.scanChart, [{ label: "Narrative", value: nar }, { label: "Speech", value: spe }],
          { preserveOrder: true, valueLabel: "lines", labelWidth: 120 });
        statCards([["Narrative", nar.toLocaleString()], ["Speech", spe.toLocaleString()], ["% speech", tot ? (100 * spe / tot).toFixed(1) + "%" : "—"]]);
      }
    },
    book_summary: {
      desc: "Per-book totals from the scansion summary table.",
      run: function () {
        var where = el.scanWork.value ? " WHERE work = " + sqlStr(el.scanWork.value) : "";
        var res = SQL.query("SELECT work, book, n_lines, total_words, total_syllables, n_speech_lines FROM scansion_books" +
          where + " ORDER BY work, CAST(book AS INTEGER);");
        el.scanChart.innerHTML = "";
        UI.renderTable(el.scanTable, res.columns, res.values, { paginate: true, pageSize: 50 });
      }
    },
    lines_table: {
      desc: "Individual scanned lines (foot pattern shown as D = dactyl, S = spondee). First 500.",
      run: function () {
        var res = SQL.query("SELECT work, book, line_num, n_syllables, feet_pattern, line_text FROM scansion_lines" +
          scopeWhere() + " ORDER BY work, CAST(book AS INTEGER), line_num LIMIT 500;");
        var fpIdx = res.columns.indexOf("feet_pattern");
        if (fpIdx >= 0) res.values.forEach(function (r) { r[fpIdx] = footLabel(r[fpIdx]); });
        el.scanChart.innerHTML = "";
        UI.renderTable(el.scanTable, res.columns, res.values, { paginate: true, pageSize: 50 });
      }
    }
  };

  function syncScanControls() {
    var v = el.scanView.value;
    el.scanLineWrap.hidden = (v !== "line_scan");
    el.scanWordWrap.hidden = (v !== "word_foot");
    el.scanFootWrap.hidden = (v !== "foot_words");
    el.scanGrammar.hidden = !(v === "word_foot" || v === "foot_words");
  }

  function grammarState() { var s = {}; GFIELDS.forEach(function (k) { s[k] = el[GMAP[k]] ? el[GMAP[k]].value : ""; }); return s; }

  function run() {
    if (!SQL || !SQL.isReady()) return;
    syncScanControls();
    scanLineState.page = 0;
    UI.saveState("scan", {
      view: el.scanView.value, work: el.scanWork.value, book: el.scanBook.value, topN: el.scanTopN.value,
      lineFrom: el.scanLineFrom.value, word: el.scanWord.value, foot: el.scanFoot.value, grammar: grammarState()
    });
    if (el.scanWordMenu) el.scanWordMenu.hidden = true;
    var view = VIEWS[el.scanView.value] || VIEWS.line_scan;
    el.scanViewDesc.textContent = view.desc;
    clearOut();
    try { view.run(); }
    catch (e) {
      el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Could not render this view: ' + UI.esc(e.message) + "</div>";
    }
  }

  function populateBooks() {
    var work = el.scanWork.value;
    if (!work) {
      el.scanBook.innerHTML = '<option value="">(all books)</option>';
      el.scanBook.value = "";
      el.scanBook.disabled = true;
      return;
    }
    var books = SQL.query("SELECT DISTINCT book FROM scansion_lines WHERE work = " + sqlStr(work) +
      " ORDER BY CAST(book AS INTEGER);").values.map(function (r) { return r[0]; });
    UI.fillSelect(el.scanBook, books, { head: "(all books)" });
    el.scanBook.disabled = false;
  }

  function init() {
    grab();
    if (!el.scanView) return; // not on this page

    el.scanView.addEventListener("change", run);
    el.scanWork.addEventListener("change", function () { populateBooks(); run(); });
    el.scanBook.addEventListener("change", run);
    el.scanTopN.addEventListener("change", run);
    el.scanFoot.addEventListener("change", run);
    el.scanLineFrom.addEventListener("change", run);
    el.scanLineFrom.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
    el.scanWord.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
    GFIELDS.forEach(function (k) { if (el[GMAP[k]]) el[GMAP[k]].addEventListener("change", run); });
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
      var st = UI.loadState("scan");
      if (st) {
        if (st.view) el.scanView.value = st.view;
        if (st.work != null) el.scanWork.value = st.work;
      }
      populateBooks();
      if (st) {
        if (st.book != null && !el.scanBook.disabled) el.scanBook.value = st.book;
        if (st.topN) el.scanTopN.value = st.topN;
        if (st.lineFrom != null) el.scanLineFrom.value = st.lineFrom;
        if (st.word != null) el.scanWord.value = st.word;
        if (st.foot != null) el.scanFoot.value = st.foot;
        if (st.grammar) GFIELDS.forEach(function (k) { if (el[GMAP[k]] && st.grammar[k] != null) el[GMAP[k]].value = st.grammar[k]; });
      }
      syncScanControls();
      run();
    }).catch(function (e) {
      if (el.scanLoadStatus) el.scanLoadStatus.innerHTML = '<span>Could not load scansion corpus: ' + UI.esc(e.message) + "</span>";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
