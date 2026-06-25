(() => {
  const BUNDLED = { "default.csv": "assets/data/default.csv" };

  const el = {
    syntaxCsvFile: document.getElementById('syntaxCsvFile'),
    syntaxBundledDataset: document.getElementById('syntaxBundledDataset'),
    btnSyntaxLoadBundled: document.getElementById('btnSyntaxLoadBundled'),
    syntaxSectionSelect: document.getElementById('syntaxSectionSelect'),
    syntaxLoadStatus: document.getElementById('syntaxLoadStatus'),
    syntaxInput: document.getElementById('syntaxInput'),
    syntaxRelFilter: document.getElementById('syntaxRelFilter'),
    syntaxPosFilter: document.getElementById('syntaxPosFilter'),
    syntaxUseDistance: document.getElementById('syntaxUseDistance'),
    btnBuildSyntax: document.getElementById('btnBuildSyntax'),
    btnSyntaxSample: document.getElementById('btnSyntaxSample'),
    btnSyntaxExport: document.getElementById('btnSyntaxExport'),
    syntaxSummary: document.getElementById('syntaxSummary'),
    syntaxDepSvg: document.getElementById('syntaxDepSvg'),
    syntaxPhrase: document.getElementById('syntaxPhrase'),
    syntaxRelationBars: document.getElementById('syntaxRelationBars'),
    syntaxHits: document.getElementById('syntaxHits'),
    syntaxTable: document.getElementById('syntaxTable'),
    syntaxDistanceProfile: document.getElementById('syntaxDistanceProfile')
  };

  const state = { sentences: [], reportRows: [], csvRows: [], activeSource: 'tsv' };
  const sample = el.syntaxInput?.value || '';

  function esc(x) { return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function setLoadingStatus(target, text = 'Loading...') {
    if (!target) return;
    target.classList.add('loading-note');
    target.innerHTML = `<span>${esc(text)}</span><span class="loading-bar" aria-hidden="true"></span><strong>Please wait</strong>`;
  }

  function parseIntSafe(v, d = null) {
    const n = Number.parseInt(String(v ?? '').trim(), 10);
    return Number.isFinite(n) ? n : d;
  }

  function normalizeTokenRow(row, sid = 1) {
    const id = parseIntSafe(row.id ?? row.token_id ?? row.word_id);
    if (!Number.isFinite(id)) return null;
    const distance = parseIntSafe(row.distance ?? row.total_distance, null);
    const head = parseIntSafe(row.head, null);
    return {
      sid,
      id,
      form: String(row.form ?? row.word ?? row.token ?? '').trim(),
      lemma: String(row.lemma ?? '').trim(),
      pos: String(row.pos ?? '').trim(),
      head,
      deprel: String(row.deprel ?? row.dep_rel ?? row.relation ?? '').trim(),
      distance
    };
  }

  function applyDistanceInference(rows) {
    const byId = new Map(rows.map(r => [r.id, r]));
    for (const r of rows) {
      if (el.syntaxUseDistance?.checked && Number.isFinite(r.distance) && r.distance !== 0) {
        const inferredHead = r.id + r.distance;
        if (byId.has(inferredHead)) r.head = inferredHead;
      }
      if (!Number.isFinite(r.head)) r.head = 0;
    }
  }

  function parseInputTsv(text) {
    const blocks = String(text || '').trim().split(/\n\s*\n/).filter(Boolean);
    return blocks.map((b, bi) => {
      const rows = b.split(/\r?\n/).map(line => {
        const p = line.trim().split('\t');
        return normalizeTokenRow({
          id: p[0], form: p[1], lemma: p[2], pos: p[3], head: p[4], deprel: p[5], distance: p[6]
        }, bi + 1);
      }).filter(Boolean);
      applyDistanceInference(rows);
      return rows;
    }).filter(x => x.length);
  }

  function groupCsvBySection(rows) {
    const grouped = new Map();
    for (const raw of rows) {
      const section = String(raw.section_id ?? raw.sentence_id ?? raw.section ?? raw.sid ?? 'section_1').trim() || 'section_1';
      if (!grouped.has(section)) grouped.set(section, []);
      grouped.get(section).push(raw);
    }

    const out = [];
    for (const [section, list] of grouped.entries()) {
      const cleaned = list.map(r => normalizeTokenRow(r, section)).filter(Boolean).sort((a, b) => a.id - b.id);
      applyDistanceInference(cleaned);
      if (cleaned.length) out.push({ section, rows: cleaned });
    }
    return out;
  }

  function populateSectionSelect(groups) {
    const cur = el.syntaxSectionSelect?.value;
    if (!el.syntaxSectionSelect) return;
    el.syntaxSectionSelect.innerHTML = '';
    for (const g of groups) {
      const o = document.createElement('option');
      o.value = g.section;
      o.textContent = `${g.section} (${g.rows.length} tokens)`;
      el.syntaxSectionSelect.appendChild(o);
    }
    if (cur && [...el.syntaxSectionSelect.options].some(o => o.value === cur)) el.syntaxSectionSelect.value = cur;
  }

  function filteredRows(rows) {
    const rel = (el.syntaxRelFilter?.value || '').trim().toLowerCase();
    const pos = (el.syntaxPosFilter?.value || '').trim().toLowerCase();
    return rows.filter(r => (!rel || String(r.deprel).toLowerCase().includes(rel)) && (!pos || String(r.pos).toLowerCase().includes(pos)));
  }

  function renderSummary(sentences) {
    const all = sentences.flat();
    const roots = all.filter(x => x.head === 0).length;
    const depTypes = new Set(all.map(x => x.deprel).filter(Boolean)).size;
    el.syntaxSummary.innerHTML = `<div class="analysis-grid">
      <div class="analysis-card"><span class="label">Sentences/sections</span><div class="value">${sentences.length}</div></div>
      <div class="analysis-card"><span class="label">Tokens</span><div class="value">${all.length}</div></div>
      <div class="analysis-card"><span class="label">Roots</span><div class="value">${roots}</div></div>
      <div class="analysis-card"><span class="label">Relation types</span><div class="value">${depTypes}</div></div>
    </div>`;
  }

  function renderDepTree(rows) {
    const w = 1100, y = 390, step = Math.max(65, Math.floor((w - 120) / Math.max(rows.length, 1)));
    const x = new Map(rows.map((r, i) => [r.id, 60 + i * step]));
    let html = `<rect x="0" y="0" width="${w}" height="460" fill="#f8fafc" rx="12"/>`;
    for (const r of rows) {
      const tx = x.get(r.id), hx = x.get(r.head);
      if (!tx) continue;
      if (!hx || r.head === 0) {
        html += `<line x1="${tx}" y1="70" x2="${tx}" y2="${y-30}" stroke="#64748b" stroke-dasharray="4 4"/>`;
      } else {
        const mid = (tx + hx) / 2, h = Math.min(280, 50 + Math.abs(tx - hx) * .34);
        html += `<path d="M ${hx} ${y-30} Q ${mid} ${y-h} ${tx} ${y-30}" fill="none" stroke="#4f46e5" stroke-width="2"/>`;
        html += `<text x="${mid-20}" y="${y-h-6}" font-size="11" fill="#1e293b">${esc(r.deprel || '')}</text>`;
      }
    }
    for (const r of rows) {
      const cx = x.get(r.id);
      html += `<circle cx="${cx}" cy="${y-30}" r="17" fill="#0891b2"/>`;
      html += `<text x="${cx}" y="${y-25}" text-anchor="middle" font-size="11" fill="#fff">${r.id}</text>`;
      html += `<text x="${cx}" y="${y+2}" text-anchor="middle" font-size="14" fill="#0f172a">${esc(r.form)}</text>`;
      html += `<text x="${cx}" y="${y+20}" text-anchor="middle" font-size="11" fill="#64748b">${esc(r.pos)}</text>`;
    }
    el.syntaxDepSvg.innerHTML = html;
  }

  function renderPhrase(rows) {
    const child = new Map();
    for (const r of rows) { if (!child.has(r.head)) child.set(r.head, []); child.get(r.head).push(r); }
    for (const v of child.values()) v.sort((a,b)=>a.id-b.id);
    const root = rows.find(r => r.head === 0) || rows[0];
    function walk(n, d=1) {
      const pad = '  '.repeat(d);
      const kids = child.get(n.id) || [];
      if (!kids.length) return `${pad}(${n.pos}:${n.form})`;
      return `${pad}(${n.pos}:${n.form}\n${kids.map(k => walk(k, d+1)).join('\n')}\n${pad})`;
    }
    el.syntaxPhrase.textContent = root ? `(S\n${walk(root)}\n)` : '(S)';
  }

  function renderRelationBars(sentences) {
    const freq = new Map();
    for (const r of sentences.flat()) freq.set(r.deprel || '—', (freq.get(r.deprel || '—') || 0) + 1);
    const entries = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 16);
    const max = Math.max(...entries.map(x=>x[1]),1);
    let html = '';
    for (const [rel, n] of entries) {
      const w = Math.max(3, Math.round((n/max)*100));
      html += `<div class="viz-item"><div class="viz-row"><span class="viz-label">${esc(rel)}</span><div class="viz-bar" style="width:${w}%"></div><span class="viz-value">${n}</span></div></div>`;
    }
    el.syntaxRelationBars.innerHTML = html;
  }

  function renderHits(rows) {
    const verbObjs = rows.filter(r => String(r.deprel) === 'obj');
    const nsubj = rows.filter(r => String(r.deprel).includes('subj'));
    const finite = rows.filter(r => /VERB|AUX|\bv\b/i.test(String(r.pos)));
    let html = `<table class="mini-table"><thead><tr><th>Construction</th><th>Count</th><th>Examples</th></tr></thead><tbody>`;
    const items = [['Objects', verbObjs], ['Subjects', nsubj], ['Finite verbs', finite]];
    for (const [name, arr] of items) html += `<tr><td>${name}</td><td>${arr.length}</td><td>${esc(arr.slice(0,6).map(r => r.form).join(', '))}</td></tr>`;
    html += '</tbody></table>';
    el.syntaxHits.innerHTML = html;
  }

  function renderDistanceProfile(sentences) {
    const all = sentences.flat();
    const bucketCount = new Map();
    const categoryCount = new Map();
    for (const r of all) {
      const dist = Number.isFinite(r.distance) ? r.distance : (Number.isFinite(r.head) ? r.head - r.id : 0);
      const dir = dist < 0 ? 'left dependency' : (dist > 0 ? 'right dependency' : 'root/self');
      const bucket = `${dir} (${dist})`;
      bucketCount.set(bucket, (bucketCount.get(bucket) || 0) + 1);
      const cat = `${r.pos || 'UNK'} + ${r.deprel || 'dep'}`;
      const key = `${bucket}||${cat}`;
      categoryCount.set(key, (categoryCount.get(key) || 0) + 1);
    }

    let html = '<table class="mini-table"><thead><tr><th>Distance bucket</th><th>Count</th><th>Top grammatical categories</th></tr></thead><tbody>';
    for (const [bucket, count] of [...bucketCount.entries()].sort((a,b)=>b[1]-a[1])) {
      const cats = [...categoryCount.entries()].filter(([k])=>k.startsWith(`${bucket}||`)).map(([k,v])=>[k.split('||')[1], v]).sort((a,b)=>b[1]-a[1]).slice(0,4);
      html += `<tr><td>${esc(bucket)}</td><td>${count}</td><td>${cats.map(([k,v])=>`${esc(k)} (${v})`).join(', ') || '—'}</td></tr>`;
    }
    html += '</tbody></table>';
    el.syntaxDistanceProfile.innerHTML = html;
  }

  function renderTable(rows) {
    let html = '<table class="mini-table"><thead><tr><th>ID</th><th>Form</th><th>Lemma</th><th>POS</th><th>Head</th><th>Deprel</th><th>distance</th></tr></thead><tbody>';
    for (const r of rows) html += `<tr><td>${r.id}</td><td>${esc(r.form)}</td><td>${esc(r.lemma)}</td><td>${esc(r.pos)}</td><td>${r.head}</td><td>${esc(r.deprel)}</td><td>${Number.isFinite(r.distance) ? r.distance : ''}</td></tr>`;
    html += '</tbody></table>';
    el.syntaxTable.innerHTML = html;
  }

  function toCsv(rows) {
    const cols = ['sentence','id','form','lemma','pos','head','deprel','distance'];
    return [cols.join(','), ...rows.map(r => [r.sentence,r.id,r.form,r.lemma,r.pos,r.head,r.deprel,r.distance ?? ''].map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(','))].join('\n');
  }

  function exportReport() {
    if (!state.reportRows.length) return;
    const blob = new Blob([toCsv(state.reportRows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'syntax_report.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function setupZoom() {
    const targets = [el.syntaxSummary, ...document.querySelectorAll('.viz-wrap')].filter(Boolean);
    for (const c of targets) {
      if (c.querySelector(':scope > .zoom-btn')) continue;
      c.classList.add('zoomable');
      const b = document.createElement('button'); b.type='button'; b.className='zoom-btn'; b.textContent='⤢ Full view';
      b.addEventListener('click', ()=>openZoom(c)); c.prepend(b);
    }
  }

  function openZoom(container) {
    let modal = document.getElementById('zoomModal');
    if (!modal) {
      modal = document.createElement('div'); modal.id='zoomModal'; modal.className='zoom-modal';
      modal.innerHTML = `<div class="zoom-backdrop"></div><div class="zoom-dialog"><div class="zoom-head"><strong>Expanded view</strong><button type="button" class="btn btn-warn zoom-close">Close</button></div><div class="zoom-body"></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector('.zoom-backdrop').addEventListener('click', ()=>modal.classList.remove('open'));
      modal.querySelector('.zoom-close').addEventListener('click', ()=>modal.classList.remove('open'));
    }
    const body = modal.querySelector('.zoom-body'); body.innerHTML='';
    const clone = container.cloneNode(true); clone.querySelector('.zoom-btn')?.remove(); body.appendChild(clone);
    modal.classList.add('open');
  }

  function run() {
    if (state.activeSource === 'csv' && state.csvRows.length) {
      const groups = groupCsvBySection(state.csvRows);
      if (!groups.length) return;
      populateSectionSelect(groups);
      const section = el.syntaxSectionSelect?.value || groups[0].section;
      const selectedGroup = groups.find(g => g.section === section) || groups[0];
      const selected = filteredRows(selectedGroup.rows);
      const allSentences = groups.map(g => g.rows);

      renderSummary(allSentences);
      renderDepTree(selected);
      renderPhrase(selected);
      renderRelationBars(allSentences);
      renderHits(selected);
      renderDistanceProfile(allSentences);
      renderTable(selected);
      state.sentences = allSentences;
      state.reportRows = allSentences.flatMap((s, idx) => s.map(r => ({ sentence: idx + 1, ...r })));
      setupZoom();
      return;
    }

    state.sentences = parseInputTsv(el.syntaxInput?.value || '');
    if (!state.sentences.length) return;
    const selected = filteredRows(state.sentences[0]);
    renderSummary(state.sentences);
    renderDepTree(selected);
    renderPhrase(selected);
    renderRelationBars(state.sentences);
    renderHits(selected);
    renderDistanceProfile(state.sentences);
    renderTable(selected);
    state.reportRows = state.sentences.flatMap((s, idx) => s.map(r => ({ sentence: idx + 1, ...r })));
    setupZoom();
  }

  function parseCsvText(text, label = 'uploaded.csv') {
    setLoadingStatus(el.syntaxLoadStatus, `Loading ${label} ...`);
    return new Promise((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = res.data || [];
          const fields = res.meta?.fields || [];
          const lfsPointer = fields.length === 1 && fields[0].startsWith('version https://git-lfs.github.com/spec/v1');
          el.syntaxLoadStatus.classList.remove('loading-note');
          if (lfsPointer) {
            el.syntaxLoadStatus.textContent = `Loaded ${label}, but it is a Git LFS pointer file, not tabular CSV data.`;
            state.csvRows = [];
            resolve({ ok: false, reason: 'lfs-pointer' });
            return;
          }
          state.csvRows = rows;
          state.activeSource = 'csv';
          el.syntaxLoadStatus.textContent = `Loaded ${label} (${rows.length} rows).`;
          run();
          resolve({ ok: true, rows: rows.length });
        },
        error: (err) => {
          el.syntaxLoadStatus.classList.remove('loading-note');
          el.syntaxLoadStatus.textContent = `Failed to parse CSV (${String(err)})`;
          resolve({ ok: false, reason: 'parse-error', error: String(err) });
        }
      });
    });
  }

  async function fetchBundledCsv(path) {
    const variants = [path, new URL(path, document.baseURI).toString(), path.startsWith('/') ? path : `/${path}`];
    let lastErr = null;
    for (const candidate of [...new Set(variants)]) {
      try {
        const res = await fetch(candidate, { cache: 'no-store' });
        if (res.ok) return { text: await res.text(), url: candidate };
        lastErr = new Error(`HTTP ${res.status} @ ${candidate}`);
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error(`Could not load bundled csv at ${path}`);
  }

  async function loadBundled() {
    const selected = el.syntaxBundledDataset?.value || 'default.csv';
    const configured = BUNDLED[selected];
    const paths = [...new Set([configured, ...Object.values(BUNDLED)].filter(Boolean))];
    setLoadingStatus(el.syntaxLoadStatus, `Loading bundled syntax CSV (${selected}) ...`);
    for (const path of paths) {
      try {
        const loaded = await fetchBundledCsv(path);
        const parsed = await parseCsvText(loaded.text, loaded.url);
        if (parsed.ok) return;
      } catch (_) {}
    }
    el.syntaxLoadStatus.classList.remove('loading-note');
    el.syntaxLoadStatus.textContent = `Could not load any configured bundled syntax CSV.`;
  }

  el.btnBuildSyntax?.addEventListener('click', run);
  el.btnSyntaxSample?.addEventListener('click', () => {
    state.activeSource = 'tsv';
    if (el.syntaxInput) el.syntaxInput.value = sample;
    run();
  });
  el.btnSyntaxExport?.addEventListener('click', exportReport);
  el.syntaxSectionSelect?.addEventListener('change', run);
  el.syntaxRelFilter?.addEventListener('input', run);
  el.syntaxPosFilter?.addEventListener('input', run);
  el.syntaxUseDistance?.addEventListener('change', run);
  el.syntaxCsvFile?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then(txt => parseCsvText(txt, f.name));
  });
  el.btnSyntaxLoadBundled?.addEventListener('click', loadBundled);

  loadBundled().catch(() => run());
})();
