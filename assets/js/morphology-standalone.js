(() => {
  const el = {
    bundledDatasetChoice: document.getElementById('bundledDatasetChoice'),
    btnLoadBundled: document.getElementById('btnLoadBundled'),
    csvFile: document.getElementById('csvFile'),
    loadStatus: document.getElementById('loadStatus'),
    statRows: document.getElementById('statRows'),
    statFiltered: document.getElementById('statFiltered'),
    filterPos: document.getElementById('filterPos'),
    filterNumber: document.getElementById('filterNumber'),
    filterCase: document.getElementById('filterCase'),
    btnApplyFilter: document.getElementById('btnApplyFilter'),
    btnResetFilter: document.getElementById('btnResetFilter'),
    statusBox: document.getElementById('statusBox'),
    tableWrap: document.getElementById('tableWrap')
  };

  const state = { rows: [], filtered: [] };

  const POS_LABELS = {
    a: 'Adjective',
    c: 'Conjunction',
    d: 'Adverb',
    i: 'Interjection',
    l: 'Article',
    m: 'Number',
    n: 'Noun',
    p: 'Pronoun',
    r: 'Preposition',
    v: 'Verb',
    x: 'Uncategorized',
    g: 'Particle'
  };

  const NUMBER_LABELS = {
    p: 'Plural',
    s: 'Singular',
    d: 'Dual'
  };

  const CASE_LABELS = {
    a: 'Accusative',
    d: 'Dative',
    g: 'Genitive',
    n: 'Nominative',
    v: 'Vocative'
  };
  const HIDDEN_PREVIEW_COLUMNS = new Set(['section_id', 'sentence_id', 'is_valid', 'id', 'distance']);
  const PREFERRED_PREVIEW_COLUMN_ORDER = [
    'author',
    'work',
    'ref',
    'form',
    'lemma',
    'pos',
    'person',
    'number',
    'tense',
    'mood',
    'voice',
    'gender',
    'case',
    'degree',
    'total_distance',
    'word_count'
  ];

  function getPreviewColumns(row) {
    const sourceColumns = Object.keys(row || {}).filter((c) => !HIDDEN_PREVIEW_COLUMNS.has(c));
    const ordered = PREFERRED_PREVIEW_COLUMN_ORDER.filter((c) => sourceColumns.includes(c));
    const remainder = sourceColumns.filter((c) => !ordered.includes(c));
    return [...ordered, ...remainder];
  }

  function getPreviewHeaderLabel(column) {
    if (column === 'total_distance') return 'Total Dependency distance';
    if (column === 'word_count') return 'Word Count';
    return column;
  }

  class CsvProvider {
    async loadFromUrl(url) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return this.parse(text);
    }

    async loadFromFile(file) {
      const text = await file.text();
      return this.parse(text);
    }

    parse(text) {
      return new Promise((resolve, reject) => {
        try {
          if (!window.Papa?.parse) throw new Error('Papa parser unavailable');
          window.Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false,
            complete: (out) => resolve(out.data || []),
            error: reject
          });
        } catch (err) {
          reject(err);
        }
      });
    }
  }

  const csvProvider = new CsvProvider();

  function setLoadStatus(msg) {
    if (el.loadStatus) el.loadStatus.textContent = msg;
  }

  function setStatus(msg) {
    if (el.statusBox) el.statusBox.textContent = msg;
  }

  function normalize(v) { return String(v ?? '').trim(); }

  function updateStats() {
    if (el.statFiltered) el.statFiltered.textContent = String(state.filtered.length || 0);
    if (el.btnApplyFilter) el.btnApplyFilter.disabled = !state.rows.length;
  }

  function uniqueValues(col) {
    const s = new Set();
    for (const row of state.rows) {
      const v = normalize(row[col]);
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function toFilterLabel(field, value) {
    if (field === 'pos') return POS_LABELS[value] || value;
    if (field === 'number') return NUMBER_LABELS[value] || value;
    if (field === 'case') return CASE_LABELS[value] || value;
    return value;
  }

  function setFilterOptions(select, values, field) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">(any)</option>';
    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = toFilterLabel(field, v);
      select.appendChild(opt);
    }
    if (values.includes(current)) select.value = current;
  }

  function refreshFilterUi() {
    setFilterOptions(el.filterPos, uniqueValues('pos'), 'pos');
    setFilterOptions(el.filterNumber, uniqueValues('number'), 'number');
    setFilterOptions(el.filterCase, uniqueValues('case'), 'case');
  }

  function renderTable(rows) {
    if (!el.tableWrap) return;
    if (!rows.length) {
      el.tableWrap.innerHTML = '<div class="small-muted" style="padding:.75rem;">No rows to display.</div>';
      return;
    }
    const cols = getPreviewColumns(rows[0]);
    const sample = rows.slice(0, 30);
    let html = '<table class="preview"><thead><tr>';
    for (const c of cols) html += `<th>${getPreviewHeaderLabel(c)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of sample) {
      html += '<tr>';
      for (const c of cols) html += `<td>${normalize(row[c])}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';
    el.tableWrap.innerHTML = html;
  }

  function hydrateRows(rows, sourceLabel) {
    state.rows = Array.isArray(rows) ? rows : [];
    state.filtered = [];
    refreshFilterUi();
    updateStats();
    renderTable(state.rows);
    if (el.statRows) el.statRows.style.display = 'none';
    setLoadStatus(`Loaded ${sourceLabel} (${state.rows.length} rows).`);
    setStatus(`Dataset ready. Choose morphology filters and click Apply.`);
  }

  async function loadBundled() {
    const url = el.bundledDatasetChoice?.value;
    if (!url) return;
    setLoadStatus(`Loading ${url} ...`);
    try {
      const rows = await csvProvider.loadFromUrl(url);
      hydrateRows(rows, url);
    } catch (err) {
      setLoadStatus(`Failed to load ${url} (${String(err)})`);
      setStatus(`Bundled load failed: ${String(err)}`);
    }
  }

  async function loadUploaded(file) {
    if (!file) return;
    setLoadStatus(`Loading ${file.name} ...`);
    try {
      const rows = await csvProvider.loadFromFile(file);
      hydrateRows(rows, file.name);
    } catch (err) {
      setLoadStatus(`Failed to parse ${file.name}`);
      setStatus(`Upload parse failed: ${String(err)}`);
    }
  }

  function applyMorphFilter() {
    const q = {
      pos: el.filterPos?.value || '',
      number: el.filterNumber?.value || '',
      case: el.filterCase?.value || ''
    };
    state.filtered = state.rows.filter((row) => {
      return (!q.pos || normalize(row.pos) === q.pos)
        && (!q.number || normalize(row.number) === q.number)
        && (!q.case || normalize(row.case) === q.case);
    });
    renderTable(state.filtered);
    updateStats();
    setStatus(`Applied filter: ${JSON.stringify(q)}\nRows after filter: ${state.filtered.length}`);
  }

  function resetFilter() {
    if (el.filterPos) el.filterPos.value = '';
    if (el.filterNumber) el.filterNumber.value = '';
    if (el.filterCase) el.filterCase.value = '';
    state.filtered = [];
    renderTable(state.rows);
    updateStats();
    setStatus(`Filters reset. Showing full dataset (${state.rows.length} rows).`);
  }

  el.btnLoadBundled?.addEventListener('click', loadBundled);
  el.csvFile?.addEventListener('change', (e) => loadUploaded(e.target.files?.[0]));
  el.btnApplyFilter?.addEventListener('click', applyMorphFilter);
  el.btnResetFilter?.addEventListener('click', resetFilter);

  loadBundled();
})();

/* ============================================================================
 *  SQL CONSOLE ADD-ON  —  sql.js (SQLite compiled to WebAssembly)
 * ----------------------------------------------------------------------------
 *  Everything above this banner is untouched. This block is fully
 *  self-contained: it re-reads the same dataset <select> (#bundledDatasetChoice)
 *  and file input (#csvFile), loads the CSV into an in-memory SQLite database,
 *  and renders a read-only SQL console below the existing UI.
 *
 *  ONE PREREQUISITE — load sql.js before this file. In index.html, right after
 *  the papaparse <script>, add:
 *
 *    <script src="https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.js"></script>
 *
 *  The CSV -> SQL schema & row transformation all live in SQL_CONFIG below —
 *  that is the one place to edit.
 * ========================================================================== */
(() => {
  // ===========================================================================
  //  CONFIG  —  edit this block to change the CSV -> SQL mapping.
  // ===========================================================================

  // The table name your CSV is loaded into. Change in this one spot and the
  // default query, examples, and schema all follow.
  const TABLE = 'morphology';

  const SQL_CONFIG = {
    tableName: TABLE,

    // Per-column SQL type. Any CSV column NOT listed here becomes TEXT.
    // SQLite's typing is dynamic, but declaring REAL/INTEGER gives you correct
    // numeric sorting/comparison (e.g. ORDER BY total_distance, not lexical).
    columnTypes: {
      total_distance: 'REAL',
      word_count: 'INTEGER',
      distance: 'REAL',
      is_valid: 'INTEGER'
    },

    // Optional: rename CSV columns to different SQL column names. Keyed by the
    // CSV header. Leave empty to keep names as-is.
    // NOTE: `case` is a SQL keyword. We keep the column named "case" and quote
    // it, so you query it as  WHERE "case" = 'g'  (double quotes). If you'd
    // rather type it bare, rename it here, e.g.  case: 'gcase'.
    rename: {
      // case: 'gcase',
    },

    // Optional: transform each parsed CSV row (a plain object keyed by header)
    // before it is inserted. Return the row (mutated or new) to keep it, or
    // return null to drop it. Default is identity (keep everything).
    transformRow: (row) => row,

    // What the console shows on first load / on Reset.
    defaultQuery:
      `SELECT form, "case", work, ref\nFROM ${TABLE}\nWHERE lemma = "Μοῦσα"\nORDER BY work, ref ASC;`,

    // Quick-fill example buttons: [button label, SQL].
    examples: [
      ['count by work', `SELECT work, count(*) AS n FROM ${TABLE} GROUP BY work ORDER BY n DESC;`],
      ['all verbs', `SELECT form, lemma, tense, mood, voice FROM ${TABLE} WHERE pos = 'v';`],
      ['genitives', `SELECT form, lemma, gender FROM ${TABLE} WHERE "case" = 'g';`],
      ['distinct lemmata', `SELECT DISTINCT lemma FROM ${TABLE} ORDER BY lemma;`],
      ['schema', `PRAGMA table_info(${TABLE});`]
    ],

    // sql.js distribution (the .js loader and its .wasm sibling).
    wasmBase: 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/'
  };

  // ===========================================================================
  //  Below here is plumbing; you shouldn't need to edit it to change schema.
  // ===========================================================================

  const $id = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // SQLite reserved word -> always quote identifiers ("case", "order", ...).
  const quoteId = (name) => '"' + String(name).replace(/"/g, '""') + '"';
  const sqlColName = (csvCol) => SQL_CONFIG.rename[csvCol] || csvCol;

  // Allow only read statements through the console.
  const READONLY = /^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*(select|with|explain|pragma)\b/i;

  let SQL = null;   // the sql.js module, loaded once
  let db = null;    // the current in-memory database

  function parseCsv(text) {
    return new Promise((resolve, reject) => {
      if (!window.Papa?.parse) return reject(new Error('papaparse unavailable'));
      window.Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (out) => resolve(out.data || []),
        error: reject
      });
    });
  }

  async function ensureSql() {
    if (SQL) return SQL;
    if (typeof window.initSqlJs !== 'function') {
      throw new Error('sql.js not loaded — add its <script> tag before this file');
    }
    SQL = await window.initSqlJs({ locateFile: (f) => SQL_CONFIG.wasmBase + f });
    return SQL;
  }

  // CSV rows (array of header-keyed objects) -> a fresh in-memory table.
  function buildDatabase(rows) {
    if (!rows || !rows.length) throw new Error('no rows to load');

    const kept = [];
    for (const r of rows) {
      const t = SQL_CONFIG.transformRow(r);
      if (t) kept.push(t);
    }
    if (!kept.length) throw new Error('all rows removed by transformRow');

    const csvCols = Object.keys(kept[0]);
    const colDefs = csvCols.map(
      (c) => `${quoteId(sqlColName(c))} ${SQL_CONFIG.columnTypes[c] || 'TEXT'}`
    );

    if (db) db.close();
    db = new SQL.Database();
    db.run(`DROP TABLE IF EXISTS ${quoteId(TABLE)};`);
    db.run(`CREATE TABLE ${quoteId(TABLE)} (${colDefs.join(', ')});`);

    const placeholders = csvCols.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO ${quoteId(TABLE)} VALUES (${placeholders});`);
    db.run('BEGIN;'); // one transaction = fast bulk insert (matters for big CSVs)
    for (const row of kept) {
      stmt.run(csvCols.map((c) => {
        const v = row[c];
        return (v === undefined || v === '') ? null : v;
      }));
    }
    db.run('COMMIT;');
    stmt.free();
    return kept.length;
  }

  function renderResults(res) {
    const out = $id('sqlConsoleOut');
    if (!out) return;
    if (!res || !res.length) {
      out.innerHTML = '<div class="small-muted" style="padding:.6rem;">No rows returned.</div>';
      return;
    }
    const { columns, values } = res[0];
    let html = '<table class="preview"><thead><tr>';
    for (const c of columns) html += `<th>${esc(c)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of values) {
      html += '<tr>';
      for (const v of row) html += `<td>${v === null ? '&#8709;' : esc(v)}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';
    out.innerHTML = html;
  }

  function runQuery() {
    const input = $id('sqlConsoleInput');
    const status = $id('sqlConsoleStatus');
    if (!input || !status) return;
    if (!db) { status.textContent = 'No dataset loaded into SQL yet.'; return; }
    const q = input.value;
    if (!READONLY.test(q)) {
      status.textContent = 'Read-only console: only SELECT / WITH / EXPLAIN / PRAGMA are allowed.';
      return;
    }
    try {
      const res = db.exec(q);
      renderResults(res);
      const n = res && res[0] ? res[0].values.length : 0;
      status.textContent = `OK — ${n} row${n === 1 ? '' : 's'}.`;
    } catch (e) {
      status.textContent = 'SQL error: ' + e.message;
    }
  }

  async function loadIntoSql(source) {
    const status = $id('sqlConsoleStatus');
    if (!status) return;
    try {
      await ensureSql();
    } catch (e) {
      status.textContent = e.message;
      return;
    }
    try {
      status.textContent = 'Parsing CSV…';
      let rows;
      if (source.file) {
        rows = await parseCsv(await source.file.text());
      } else {
        const r = await fetch(source.url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        rows = await parseCsv(await r.text());
      }
      const n = buildDatabase(rows);
      status.textContent = `Loaded ${n} rows into "${TABLE}". Ready — write SQL and Run.`;
      runQuery();
    } catch (e) {
      status.textContent = 'Load into SQL failed: ' + e.message;
    }
  }

  function buildUi() {
    const body = document.getElementById('sqlConsoleBody');
    if (!body) {
      console.warn('[sql-console] #sqlConsoleBody not found.');
      return false;
    }
    body.innerHTML = `
      <textarea id="sqlConsoleInput" spellcheck="false"
        style="width:100%;min-height:120px;resize:vertical;font-family:monospace;
               font-size:.85rem;line-height:1.5;padding:.7rem .8rem;white-space:pre;"></textarea>
      <div class="btn-row" style="margin-top:.5rem;">
        <button id="sqlConsoleRun" class="btn btn-primary">Run query</button>
        <button id="sqlConsoleReset" class="btn">Reset</button>
        <span class="help">Ctrl/Cmd + Enter to run</span>
      </div>
      <div id="sqlConsoleExamples" class="btn-row" style="margin-top:.45rem;flex-wrap:wrap;"></div>
      <pre id="sqlConsoleStatus" class="status" style="margin-top:.6rem;">Loading SQLite…</pre>
      <div id="sqlConsoleOut" class="table-wrap" style="margin-top:.6rem;"></div>
    `;
    return true;
  }

  function init() {
    if (!buildUi()) return;
    $id('sqlConsoleInput').value = SQL_CONFIG.defaultQuery;
    $id('sqlConsoleRun').addEventListener('click', runQuery);
    $id('sqlConsoleReset').addEventListener('click', () => {
      $id('sqlConsoleInput').value = SQL_CONFIG.defaultQuery;
      runQuery();
    });
    $id('sqlConsoleInput').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
    });

    const exHost = $id('sqlConsoleExamples');
    for (const [label, sql] of SQL_CONFIG.examples) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.addEventListener('click', () => { $id('sqlConsoleInput').value = sql; runQuery(); });
      exHost.appendChild(b);
    }

    // Mirror the existing dataset controls WITHOUT touching them: we add extra
    // listeners, so clicking the page's own "Load" button (or picking a file)
    // also rebuilds the SQL database from the same source.
    const sel = document.getElementById('bundledDatasetChoice');
    const loadBtn = document.getElementById('btnLoadBundled');
    const fileInput = document.getElementById('csvFile');
    if (loadBtn && sel) loadBtn.addEventListener('click', () => loadIntoSql({ url: sel.value }));
    if (fileInput) fileInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) loadIntoSql({ file: f });
    });

    // Initial auto-load from whatever dataset is currently selected.
    if (sel && sel.value) loadIntoSql({ url: sel.value });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
