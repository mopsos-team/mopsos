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
     "scanLineWrap", "scanLineFrom", "scanWordWrap", "scanWord", "scanFootWrap", "scanFoot"]
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
      desc: "Each line scanned into its six feet \u2014 \u2014 long, \u203f short; D dactyl, S spondee. Words are tagged with the foot they begin in.",
      run: function () {
        var from = parseInt(el.scanLineFrom.value, 10); if (!isFinite(from) || from < 1) from = 1;
        var sc = scopeWhere();
        var clause = sc ? sc + " AND line_num >= " + from : " WHERE line_num >= " + from;
        var rows = SQL.objects("SELECT work, book, line_num, n_syllables, feet_pattern, line_text FROM scansion_lines" +
          clause + " ORDER BY work, CAST(book AS INTEGER), line_num LIMIT " + topN() + ";");
        if (!rows.length) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No lines in this range.</div>'; return; }
        el.scanChart.innerHTML = '<div class="scan-passage">' + rows.map(function (r) {
          var al = alignLine(r.line_text, r.feet_pattern, r.n_syllables);
          return '<div class="scan-line">' +
            '<div class="scan-ref">' + UI.esc(r.work) + " " + UI.esc(r.book) + "." + r.line_num +
              ' <span class="scan-ds">' + footLabel(r.feet_pattern) + (al ? "" : " \u00b7 unaligned") + "</span></div>" +
            '<div class="scan-greek">' + UI.esc(r.line_text) + "</div>" +
            renderFeet(r.feet_pattern, al) + "</div>";
        }).join("") + "</div>";
        statCards([["Lines shown", rows.length], ["First", rows[0].work + " " + rows[0].book + "." + rows[0].line_num]]);
      }
    },
    word_foot: {
      desc: "Where a given word form begins in the verse \u2014 its distribution over the six feet (accent-insensitive, on alignable lines).",
      run: function () {
        var qn = normGr((el.scanWord.value || "").trim());
        if (!qn) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">Type a Greek word form above (e.g. \u03bc\u1fc6\u03bd\u03b9\u03bd, \u03b8\u03b5\u03ac).</div>'; el.scanSummary.innerHTML = ""; return; }
        buildAlign();
        var counts = [0, 0, 0, 0, 0, 0], princeps = 0, tot = 0, ex = [];
        ALIGN.forEach(function (L) {
          if (!L.al || !inScope(L)) return;
          L.al.forEach(function (w) {
            if (w.wn === qn) { counts[w.foot]++; tot++; if (w.princeps) princeps++; if (ex.length < 8) ex.push(L.work + " " + L.book + "." + L.line_num + ": " + L.line_text); }
          });
        });
        if (!tot) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No alignable occurrences of \u201c' + UI.esc(el.scanWord.value) + '\u201d in this scope.</div>'; el.scanSummary.innerHTML = ""; el.scanTable.innerHTML = ""; return; }
        Chart.bars(el.scanChart, counts.map(function (c, i) { return { label: "Foot " + (i + 1), value: c }; }),
          { preserveOrder: true, valueLabel: "occurrences", labelWidth: 90 });
        statCards([["Occurrences", tot.toLocaleString()], ["On the princeps", princeps + " (" + (100 * princeps / tot).toFixed(0) + "%)"]]);
        el.scanTable.innerHTML = '<div class="small-muted" style="margin:.2rem 0 .3rem;">Example lines</div>' +
          ex.map(function (e) { return '<div class="scan-ex">' + UI.esc(e) + "</div>"; }).join("");
      }
    },
    foot_words: {
      desc: "The commonest word forms that begin in a chosen foot, on alignable lines.",
      run: function () {
        buildAlign();
        var fi = (parseInt(el.scanFoot.value, 10) || 1) - 1;
        var map = new Map();
        ALIGN.forEach(function (L) {
          if (!L.al || !inScope(L)) return;
          L.al.forEach(function (w) {
            if (w.foot === fi) { var e = map.get(w.wn); if (!e) { e = { c: 0, forms: {} }; map.set(w.wn, e); } e.c++; e.forms[w.w] = (e.forms[w.w] || 0) + 1; }
          });
        });
        var arr = Array.from(map.entries()).sort(function (a, b) { return b[1].c - a[1].c; }).slice(0, topN());
        if (!arr.length) { el.scanChart.innerHTML = '<div class="small-muted" style="padding:.7rem;">No alignable words for this foot in scope.</div>'; return; }
        Chart.bars(el.scanChart, arr.map(function (e) {
          var disp = Object.keys(e[1].forms).sort(function (a, b) { return e[1].forms[b] - e[1].forms[a]; })[0];
          return { label: disp, value: e[1].c };
        }), { valueLabel: "words starting here", labelWidth: 120 });
        statCards([["Foot", fi + 1], ["Distinct forms", map.size.toLocaleString()]]);
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
  }

  function run() {
    if (!SQL || !SQL.isReady()) return;
    syncScanControls();
    UI.saveState("scan", {
      view: el.scanView.value, work: el.scanWork.value, book: el.scanBook.value, topN: el.scanTopN.value,
      lineFrom: el.scanLineFrom.value, word: el.scanWord.value, foot: el.scanFoot.value
    });
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
