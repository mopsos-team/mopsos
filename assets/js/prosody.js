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
     "scanViewDesc", "scanSummary", "scanChart", "scanTable"]
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

  function run() {
    if (!SQL || !SQL.isReady()) return;
    UI.saveState("scan", { view: el.scanView.value, work: el.scanWork.value, book: el.scanBook.value, topN: el.scanTopN.value });
    var view = VIEWS[el.scanView.value] || VIEWS.lines_by_book;
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
      }
      run();
    }).catch(function (e) {
      if (el.scanLoadStatus) el.scanLoadStatus.innerHTML = '<span>Could not load scansion corpus: ' + UI.esc(e.message) + "</span>";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
