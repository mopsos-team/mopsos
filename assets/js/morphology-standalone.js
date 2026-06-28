/* ============================================================================
 *  MORPHOLOGY TAB
 *  Everything here runs against the shared in-browser SQLite database
 *  (window.MopsosSQL). Two surfaces:
 *    1. Quick filter  — pos / number / case drop-downs -> generated SQL ->
 *                       PAGINATED results (50 per page, or "show all").
 *    2. SQL console   — raw read-only SQL -> UN-paginated results.
 * ========================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const TABLE = "morphology";

  // Columns shown by the Quick filter (in this order, when present).
  const PREVIEW_COLS = ["author", "work", "ref", "form", "lemma", "pos", "person",
    "number", "tense", "mood", "voice", "gender", "case", "degree"];
  // Map preview columns -> label dictionary keys, so codes show with human labels.
  const LABEL_MAP = { pos: "pos", person: "person", number: "number", tense: "tense",
    mood: "mood", voice: "voice", gender: "gender", case: "case", degree: "degree" };

  const el = {
    status: $("morphLoadStatus"),
    filterPos: $("filterPos"),
    filterNumber: $("filterNumber"),
    filterCase: $("filterCase"),
    btnApply: $("btnApplyFilter"),
    btnReset: $("btnResetFilter"),
    btnToConsole: $("btnFilterToConsole"),
    sqlBox: $("filterSqlBox"),
    results: $("filterResults"),
    consoleBody: $("sqlConsoleBody")
  };

  const SQL = window.MopsosSQL;
  const UI = window.MopsosUI;
  const q = SQL.quoteId;

  /* ----- Quick filter ----------------------------------------------------- */

  function presentPreviewCols() {
    const cols = SQL.columns();
    const ordered = PREVIEW_COLS.filter((c) => cols.includes(c));
    return ordered.length ? ordered : cols;
  }

  function buildFilterSql() {
    const where = [];
    const add = (col, val) => { if (val) where.push(q(col) + " = " + sqlStr(val)); };
    add("pos", el.filterPos.value);
    add("number", el.filterNumber.value);
    add("case", el.filterCase.value);
    const cols = presentPreviewCols().map(q).join(", ");
    let sql = "SELECT " + cols + "\nFROM " + q(TABLE);
    if (where.length) sql += "\nWHERE " + where.join("\n  AND ");
    sql += "\nORDER BY " + q("work") + ", " + q("ref") + ";";
    return sql;
  }

  function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  function applyFilter() {
    const sql = buildFilterSql();
    el.sqlBox.textContent = sql;
    try {
      const { columns, values } = SQL.query(sql);
      UI.renderTable(el.results, columns, values, {
        paginate: true,
        pageSize: 50,
        labelMap: LABEL_MAP
      });
    } catch (e) {
      el.results.innerHTML = '<div class="small-muted" style="padding:.7rem;">SQL error: ' + UI.esc(e.message) + "</div>";
    }
  }

  function resetFilter() {
    el.filterPos.value = "";
    el.filterNumber.value = "";
    el.filterCase.value = "";
    applyFilter();
  }

  /* ----- SQL console (raw, un-paginated) ---------------------------------- */

  const CONSOLE_DEFAULT =
    'SELECT form, "case", work, ref\nFROM ' + TABLE + '\nWHERE lemma = \'Μοῦσα\'\nORDER BY work, ref ASC\nLIMIT 200;';
  const CONSOLE_EXAMPLES = [
    ["count by work", "SELECT work, count(*) AS n FROM " + TABLE + " GROUP BY work ORDER BY n DESC;"],
    ["all verbs", "SELECT form, lemma, tense, mood, voice FROM " + TABLE + " WHERE pos = 'v' LIMIT 500;"],
    ["genitives", "SELECT form, lemma, gender FROM " + TABLE + " WHERE \"case\" = 'g' LIMIT 500;"],
    ["distinct lemmata", "SELECT DISTINCT lemma FROM " + TABLE + " ORDER BY lemma LIMIT 500;"],
    ["schema", "PRAGMA table_info(" + TABLE + ");"]
  ];

  function buildConsole() {
    if (!el.consoleBody) return;
    el.consoleBody.innerHTML =
      '<textarea id="sqlConsoleInput" spellcheck="false"' +
      ' style="width:100%;min-height:130px;resize:vertical;font-family:ui-monospace,Menlo,Consolas,monospace;' +
      'font-size:.85rem;line-height:1.5;padding:.7rem .8rem;white-space:pre;"></textarea>' +
      '<div class="btn-row" style="margin-top:.5rem;">' +
      '<button id="sqlConsoleRun" class="btn btn-primary">Run query</button>' +
      '<button id="sqlConsoleReset" class="btn">Reset</button>' +
      '<span class="help">Ctrl/Cmd + Enter to run · results are not paginated</span>' +
      "</div>" +
      '<div id="sqlConsoleExamples" class="btn-row" style="margin-top:.45rem;flex-wrap:wrap;"></div>' +
      '<pre id="sqlConsoleStatus" class="status" style="margin-top:.6rem;">Ready — write SQL and Run.</pre>' +
      '<div id="sqlConsoleOut" style="margin-top:.6rem;"></div>';

    $("sqlConsoleInput").value = CONSOLE_DEFAULT;
    $("sqlConsoleRun").addEventListener("click", runConsole);
    $("sqlConsoleReset").addEventListener("click", () => { $("sqlConsoleInput").value = CONSOLE_DEFAULT; runConsole(); });
    $("sqlConsoleInput").addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); runConsole(); }
    });
    const exHost = $("sqlConsoleExamples");
    for (const [label, sql] of CONSOLE_EXAMPLES) {
      const b = document.createElement("button");
      b.className = "btn btn-sm";
      b.textContent = label;
      b.addEventListener("click", () => { $("sqlConsoleInput").value = sql; runConsole(); });
      exHost.appendChild(b);
    }
  }

  function runConsole() {
    const input = $("sqlConsoleInput");
    const status = $("sqlConsoleStatus");
    const out = $("sqlConsoleOut");
    if (!input || !status) return;
    const sql = input.value;
    if (!SQL.isReadOnly(sql)) {
      status.textContent = "Read-only console: only SELECT / WITH / EXPLAIN / PRAGMA are allowed.";
      return;
    }
    try {
      const { columns, values } = SQL.query(sql);
      UI.renderTable(out, columns, values, { paginate: false, labelMap: {} });
      status.textContent = "OK — " + values.length + " row" + (values.length === 1 ? "" : "s") + ".";
    } catch (e) {
      status.textContent = "SQL error: " + e.message;
    }
  }

  /* ----- init ------------------------------------------------------------- */

  async function init() {
    buildConsole();
    try {
      await SQL.ready();
    } catch (e) {
      if (el.status) el.status.innerHTML = '<span>Could not load corpus: ' + UI.esc(e.message) + "</span>";
      return;
    }
    if (el.status) el.status.style.display = "none";

    UI.fillSelect(el.filterPos, SQL.distinct("pos"), { field: "pos" });
    UI.fillSelect(el.filterNumber, SQL.distinct("number"), { field: "number" });
    UI.fillSelect(el.filterCase, SQL.distinct("case"), { field: "case" });
    [el.filterPos, el.filterNumber, el.filterCase, el.btnApply].forEach((x) => { if (x) x.disabled = false; });

    el.btnApply.addEventListener("click", applyFilter);
    el.btnReset.addEventListener("click", resetFilter);
    el.btnToConsole.addEventListener("click", () => {
      const inp = $("sqlConsoleInput");
      if (inp) { inp.value = buildFilterSql(); runConsole(); inp.scrollIntoView({ behavior: "smooth", block: "center" }); }
    });

    applyFilter();   // initial: full corpus, paginated
    runConsole();    // initial console query
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
