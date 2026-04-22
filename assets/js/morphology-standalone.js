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

  // Scaffold for future DB-backed loading path.
  class SqliteProvider {
    async query() {
      throw new Error('SqliteProvider not wired yet. Add sql.js/wasm or backend endpoint.');
    }
  }

  const csvProvider = new CsvProvider();
  const sqliteProvider = new SqliteProvider();
  void sqliteProvider;

  function setLoadStatus(msg) {
    if (el.loadStatus) el.loadStatus.textContent = msg;
  }

  function setStatus(msg) {
    if (el.statusBox) el.statusBox.textContent = msg;
  }

  function normalize(v) { return String(v ?? '').trim(); }

  function updateStats() {
    if (el.statRows) el.statRows.textContent = String(state.rows.length);
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

  function setFilterOptions(select, values) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">(any)</option>';
    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
    if (values.includes(current)) select.value = current;
  }

  function refreshFilterUi() {
    setFilterOptions(el.filterPos, uniqueValues('pos'));
    setFilterOptions(el.filterNumber, uniqueValues('number'));
    setFilterOptions(el.filterCase, uniqueValues('case'));
  }

  function renderTable(rows) {
    if (!el.tableWrap) return;
    if (!rows.length) {
      el.tableWrap.innerHTML = '<div class="small-muted" style="padding:.75rem;">No rows to display.</div>';
      return;
    }
    const cols = Object.keys(rows[0]);
    const sample = rows.slice(0, 30);
    let html = '<table class="preview"><thead><tr>';
    for (const c of cols) html += `<th>${c}</th>`;
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
