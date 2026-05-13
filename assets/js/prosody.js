(() => {
  const HEX_TEMPLATE = '– ⏑ ⏑ | – ⏑ ⏑ | – ⏑ ⏑ | – ⏑ ⏑ | – ⏑ ⏑ | – –';
  const PRESETS = { hex: HEX_TEMPLATE };
  const SCANSION_FILES = [
    'homer_files.csv','homer_lines.csv','homer_words.csv','homer_syllables.csv',
    'iliad_files.csv','iliad_lines.csv','iliad_words.csv','iliad_syllables.csv',
    'odyssey_files.csv','odyssey_lines.csv','odyssey_words.csv','odyssey_syllables.csv'
  ];
  const VOWEL = /[αεηιουω]/i;
  const LONG_VOWELS = /[ηω]/i;
  const DIPHTHONGS = new Set(['αι','ει','οι','υι','ου','αυ','ευ','ηυ','ωυ']);
  const MUTE = /[πβφκγχτδθ]/i;
  const LIQUID = /[λρμν]/i;
  const LEGAL_ONSETS = new Set(['βλ','βρ','γλ','γν','γρ','δρ','θλ','θρ','κλ','κν','κρ','κτ','μν','πλ','πν','πρ','πτ','σβ','σγ','σθ','σκ','σμ','σπ','στ','σφ','σχ','τρ','φθ','φλ','φρ','χθ','χλ','χρ','στρ','σκρ','σπρ','σπλ']);

  const el = {
    prosodyPreset: document.getElementById('prosodyPreset'),
    btnApplyPreset: document.getElementById('btnApplyPreset'),
    btnProsodyExport: document.getElementById('btnProsodyExport'),
    prosodyInput: document.getElementById('prosodyInput'),
    prosodyTemplate: document.getElementById('prosodyTemplate'),
    btnRunProsody: document.getElementById('btnRunProsody'),
    btnProsodySample: document.getElementById('btnProsodySample'),
    prosodySummary: document.getElementById('prosodySummary'),
    prosodyAlignment: document.getElementById('prosodyAlignment'),
    prosodyBars: document.getElementById('prosodyBars'),
    prosodyDiagnostics: document.getElementById('prosodyDiagnostics'),
    scansionWork: document.getElementById('scansionWork'),
    btnLoadScansionCorpus: document.getElementById('btnLoadScansionCorpus'),
    btnScansionRefresh: document.getElementById('btnScansionRefresh'),
    scansionLoadStatus: document.getElementById('scansionLoadStatus'),
    scansionCorpusSummary: document.getElementById('scansionCorpusSummary'),
    scansionLinesByWork: document.getElementById('scansionLinesByWork'),
    scansionFeetPatterns: document.getElementById('scansionFeetPatterns'),
    scansionQuantityProfile: document.getElementById('scansionQuantityProfile'),
    scansionPacingProfile: document.getElementById('scansionPacingProfile'),
    scansionBookFilter: document.getElementById('scansionBookFilter'),
    scansionFootFilter: document.getElementById('scansionFootFilter'),
    scansionHemiFilter: document.getElementById('scansionHemiFilter'),
    scansionQuantityFilter: document.getElementById('scansionQuantityFilter'),
    scansionWordQuery: document.getElementById('scansionWordQuery'),
    scansionWordMatchMode: document.getElementById('scansionWordMatchMode'),
    scansionWordColumn: document.getElementById('scansionWordColumn'),
    scansionRegexInsensitive: document.getElementById('scansionRegexInsensitive'),
    scansionRegexUnicode: document.getElementById('scansionRegexUnicode'),
    scansionPosFilter: document.getElementById('scansionPosFilter'),
    scansionPersonFilter: document.getElementById('scansionPersonFilter'),
    scansionNumberFilter: document.getElementById('scansionNumberFilter'),
    scansionTenseFilter: document.getElementById('scansionTenseFilter'),
    scansionMoodFilter: document.getElementById('scansionMoodFilter'),
    scansionVoiceFilter: document.getElementById('scansionVoiceFilter'),
    scansionGenderFilter: document.getElementById('scansionGenderFilter'),
    scansionCaseFilter: document.getElementById('scansionCaseFilter'),
    scansionDegreeFilter: document.getElementById('scansionDegreeFilter'),
    btnScansionApplyFilters: document.getElementById('btnScansionApplyFilters'),
    scansionSelectionSummary: document.getElementById('scansionSelectionSummary'),
    scansionSelectionTable: document.getElementById('scansionSelectionTable'),
    prosodyGraphMode: document.getElementById('prosodyGraphMode'),
    prosodyGraphTopN: document.getElementById('prosodyGraphTopN'),
    btnProsodyRerender: document.getElementById('btnProsodyRerender'),
    prosodyFootHeat: document.getElementById('prosodyFootHeat'),
    prosodyHist: document.getElementById('prosodyHist'),
    scansionLineScope: document.getElementById('scansionLineScope'),
    scansionLineQuery: document.getElementById('scansionLineQuery'),
    btnRenderLineScansion: document.getElementById('btnRenderLineScansion'),
    prosodyLineScansionTable: document.getElementById('prosodyLineScansionTable'),
    patternClusterThreshold: document.getElementById('patternClusterThreshold'),
    patternClusterTopN: document.getElementById('patternClusterTopN'),
    btnPatternCluster: document.getElementById('btnPatternCluster'),
    patternClusterSummary: document.getElementById('patternClusterSummary'),
    patternClusterTable: document.getElementById('patternClusterTable'),
    slotFootSelect: document.getElementById('slotFootSelect'),
    slotWordQuery: document.getElementById('slotWordQuery'),
    slotTopN: document.getElementById('slotTopN'),
    btnSlotRepetition: document.getElementById('btnSlotRepetition'),
    slotRepetitionSummary: document.getElementById('slotRepetitionSummary'),
    slotRepetitionTable: document.getElementById('slotRepetitionTable')
  };

  const state = { rows: [], corpus: {}, corpusLoaded: false, morphIndex: null };
  const norm = (s) => String(s || '').trim();
  const esc = (x) => String(x ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function setLoadingStatus(target, text='Loading...') {
    if (!target) return;
    target.classList.add('loading-note');
    target.innerHTML = `<span>${esc(text)}</span><span class="loading-bar" aria-hidden="true"></span><strong>Please wait</strong>`;
  }

  function normalizeGreek(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ς/g,'σ')
      .replace(/[.,;·!?"“”‘’]/g,'')
      .replace(/[^α-ω'᾽\s]/g,'');
  }

  function applyElision(rawWords) {
    const words = rawWords.slice();
    let elisions = 0;
    for (let i = 0; i < words.length - 1; i++) {
      const w = words[i];
      if (/^[αεηιουω]/.test(words[i + 1]) && (/['᾽]$/.test(w) || /[αεο]$/.test(w))) {
        words[i] = w.replace(/['᾽]$/,'').replace(/[αεο]$/,'');
        elisions += 1;
      }
    }
    return { words, elisions };
  }

  function isLegalOnset(cluster) {
    if (!cluster) return false;
    if (cluster.length === 1) return /[βγδζθκλμνξπρστφχψ]/.test(cluster);
    return LEGAL_ONSETS.has(cluster);
  }

  function splitCluster(cluster) {
    if (!cluster) return ['', ''];
    for (let i = 0; i <= cluster.length; i++) {
      const coda = cluster.slice(0, i);
      const onset = cluster.slice(i);
      if (isLegalOnset(onset)) return [coda, onset];
    }
    return [cluster.slice(0, -1), cluster.slice(-1)];
  }

  function syllabifyWord(word) {
    const chars = [...word];
    const out = [];
    let i = 0;
    let carryOnset = '';

    while (i < chars.length) {
      let gathered = '';
      while (i < chars.length && !VOWEL.test(chars[i])) { gathered += chars[i]; i += 1; }
      let onset = carryOnset + gathered;
      carryOnset = '';
      if (i >= chars.length) {
        if (out.length) out[out.length - 1] += onset;
        break;
      }

      let nucleus = chars[i];
      if (i + 1 < chars.length) {
        const pair = (chars[i] + chars[i + 1]).toLowerCase();
        if (DIPHTHONGS.has(pair)) { nucleus = pair; i += 1; }
      }
      i += 1;

      let cluster = '';
      while (i < chars.length && !VOWEL.test(chars[i])) { cluster += chars[i]; i += 1; }

      if (!cluster && i >= chars.length) {
        out.push(onset + nucleus);
        break;
      }
      if (!cluster) {
        out.push(onset + nucleus);
        continue;
      }
      if (i >= chars.length) {
        out.push(onset + nucleus + cluster);
        break;
      }
      const [coda, nextOnset] = splitCluster(cluster);
      out.push(onset + nucleus + coda);
      carryOnset = nextOnset;
    }
    return out.filter(Boolean);
  }

  function quantityByNature(syl) {
    const core = syl.replace(/[^α-ωάέήίόύώϊΐΰϋ]/g,'');
    if (LONG_VOWELS.test(core)) return '–';
    if ([...DIPHTHONGS].some(d => core.includes(d))) return '–';
    return '⏑';
  }

  function quantityByPosition(syl, nextSyl) {
    const coda = (syl.match(/[βγδζθκλμνξπρστυφχψ]+$/i) || [''])[0];
    const onset = (String(nextSyl || '').match(/^[βγδζθκλμνξπρστυφχψ]+/i) || [''])[0];
    const cc = coda + onset;
    if (cc.length >= 2) {
      const first = cc[0], second = cc[1];
      const muteLiquid = MUTE.test(first) && LIQUID.test(second);
      if (!muteLiquid) return '–';
    }
    return null;
  }

  function caesuraIndex(words) { return words.length < 4 ? -1 : Math.floor(words.length / 2); }

  function scanLine(line) {
    const rawWords = normalizeGreek(line).split(/\s+/).filter(Boolean);
    const { words, elisions } = applyElision(rawWords);
    const syllables = words.flatMap(syllabifyWord);

    const pattern = [];
    let correption = 0, resonantLengthening = 0, naturallyLongBeforeVowel = 0;
    for (let i = 0; i < syllables.length; i++) {
      const s = syllables[i], n = syllables[i+1] || '';
      let q = quantityByNature(s);
      const byPos = quantityByPosition(s, n);
      if (byPos === '–') {
        const end = (s.match(/[βγδζθκλμνξπρστυφχψ]+$/i) || [''])[0];
        if (/[μνρλ]$/.test(end)) resonantLengthening += 1;
        q = '–';
      }
      // epic correption heuristic: long by nature before vowel may scan short
      if (q === '–' && /^[αεηιουωάέήίόύώϊΐΰϋ]/i.test(n)) { naturallyLongBeforeVowel += 1; q = '⏑'; correption += 1; }
      pattern.push(q);
    }

    const ci = caesuraIndex(words);
    const caesuraText = words.map((w, i) => i === ci ? `${w} ‖` : w).join(' ');
    return { line, words, syllables, pattern, caesuraAt: ci, caesuraText, elisions, correption, naturallyLongBeforeVowel, resonantLengthening };
  }

  function parseTemplate() {
    const text = norm(el.prosodyTemplate?.value || '') || HEX_TEMPLATE;
    const raw = text.replace(/[^–⏑xX|]/g, '');
    return raw.split('');
  }

  function comparePattern(pattern, template) {
    const n = Math.max(pattern.length, template.length);
    let match = 0; const mismatches = [];
    for (let i = 0; i < n; i++) {
      const a = pattern[i] || '∅', b = template[i] || '∅';
      const ok = b === '|' || b === 'x' || b === 'X' || a === b;
      if (ok) match += 1; else mismatches.push(`${i+1}:${a}≠${b}`);
    }
    return { score: Math.round((match / Math.max(n,1)) * 100), mismatches };
  }

  function renderSummary(results, totalSyl) {
    const avgMatch = results.length ? (results.reduce((a,r)=>a+r.matchScore,0)/results.length).toFixed(1) : '0.0';
    el.prosodySummary.innerHTML = `<div class="analysis-grid">
      <div class="analysis-card"><span class="label">Verses</span><div class="value">${results.length}</div></div>
      <div class="analysis-card"><span class="label">Total syllables</span><div class="value">${totalSyl}</div></div>
      <div class="analysis-card"><span class="label">Avg match vs hexameter</span><div class="value">${avgMatch}%</div></div>
      <div class="analysis-card"><span class="label">Elisions detected</span><div class="value">${results.reduce((a,r)=>a+r.elisions,0)}</div></div>
    </div>`;
  }

  function renderAlignment(results) {
    let html = '<table class="mini-table"><thead><tr><th>#</th><th>Text</th><th>Scansion</th><th>Caesura</th><th>Match</th></tr></thead><tbody>';
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      html += `<tr><td>${i+1}</td><td>${esc(r.line)}</td><td>${esc(r.pattern.join(' '))}</td><td>${esc(r.caesuraText)}</td><td>${r.matchScore}%</td></tr>`;
    }
    html += '</tbody></table>';
    el.prosodyAlignment.innerHTML = wrapCollapsible('Verse alignment rows', results.length, `<div class="table-wrap">${html}</div>`, true);
  }

  function renderBars(results) {
    if (!el.prosodyBars) return;
    const max = Math.max(...results.map(r => r.syllables.length), 1);
    let html = '';
    results.forEach((r, i) => {
      const w = Math.max(3, Math.round((r.syllables.length / max) * 100));
      html += `<div class="viz-item"><div class="viz-row"><span class="viz-label">Verse ${i+1}</span><div class="viz-bar" style="width:${w}%"></div><span class="viz-value">${r.syllables.length}</span></div></div>`;
    });
    el.prosodyBars.innerHTML = html;
  }

  function renderDiagnostics(results) {
    let html = '<table class="mini-table"><thead><tr><th>Verse</th><th>Mismatch</th><th>Elision</th><th>Epic correption</th><th>Natural long before vowel</th><th>Resonant length.</th></tr></thead><tbody>';
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      html += `<tr><td>${i+1}</td><td>${esc(r.mismatches.slice(0,8).join(', ') || 'none')}</td><td>${r.elisions}</td><td>${r.correption}</td><td>${r.naturallyLongBeforeVowel || 0}</td><td>${r.resonantLengthening}</td></tr>`;
    }
    html += '</tbody></table>';
    el.prosodyDiagnostics.innerHTML = wrapCollapsible('Diagnostics rows', results.length, `<div class="table-wrap">${html}</div>`, false);
  }

  function exportCsv() {
    if (!state.rows.length) return;
    const head = ['verse','text','scansion','syllables','match_score','elisions','epic_correption','resonant_lengthening'];
    const lines = [head.join(',')];
    for (const r of state.rows) lines.push([r.verse,r.text,r.scansion,r.syllables,r.matchScore,r.elisions,r.correption,r.resonantLengthening].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'prosody_hexameter_report.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }


  function resolveAssetUrl(path) {
    try { return new URL(path, document.baseURI).toString(); } catch { return path; }
  }

  function mapAdd(map, key, inc = 1) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + inc);
  }

  async function fetchCsvAny(path) {
    const variants = [path, resolveAssetUrl(path), path.startsWith('/') ? path : `/${path}`, path.startsWith('./') ? path.slice(2) : `./${path}`];
    let lastErr = null;
    for (const url of [...new Set(variants)]) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status} @ ${url}`); continue; }
        const txt = await res.text();
        const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true });
        return { rows: parsed.data || [], url };
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error(`Could not load ${path}`);
  }

  function buildMorphIndex(rows) {
    const byForm = new Map();
    for (const r of rows || []) {
      const form = normalizeGreekForMatch(r.form || r.word || r.word_text || '');
      if (!form) continue;
      if (!byForm.has(form)) byForm.set(form, []);
      byForm.get(form).push(r);
    }
    return byForm;
  }

  function pickMostCommonValue(rows, key) {
    const m = new Map();
    for (const r of rows || []) {
      const v = String(r[key] || '').trim();
      if (!v) continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
  }

  function enrichWordMorph(wordText) {
    const key = normalizeGreekForMatch(wordText || '');
    if (!key || !state.morphIndex?.has(key)) return {};
    const candidates = state.morphIndex.get(key);
    return {
      lemma: pickMostCommonValue(candidates, 'lemma'),
      pos: pickMostCommonValue(candidates, 'pos'),
      person: pickMostCommonValue(candidates, 'person'),
      number: pickMostCommonValue(candidates, 'number'),
      tense: pickMostCommonValue(candidates, 'tense'),
      mood: pickMostCommonValue(candidates, 'mood'),
      voice: pickMostCommonValue(candidates, 'voice'),
      gender: pickMostCommonValue(candidates, 'gender'),
      case: pickMostCommonValue(candidates, 'case'),
      degree: pickMostCommonValue(candidates, 'degree')
    };
  }

  function fileMatchesScope(fileName, scope) {
    if (scope === 'all') return true;
    return fileName.startsWith(`${scope}_`);
  }

  function renderCorpusBars(target, entries, cap = 16) {
    const top = entries.slice(0, cap);
    const max = Math.max(...top.map(([,v]) => Number(v) || 0), 1);
    let html = '';
    for (const [k, v] of top) {
      const w = Math.max(3, Math.round(((Number(v) || 0) / max) * 100));
      html += `<div class="viz-item"><div class="viz-row"><span class="viz-label">${esc(k)}</span><div class="viz-bar" style="width:${w}%"></div><span class="viz-value">${Number(v)||0}</span></div></div>`;
    }
    target.innerHTML = html || '<div class="small-muted">No data for this scope.</div>';
  }

  function computeCorpusStats(scope = 'all') {
    if (!state.corpusLoaded) return null;
    const files = Object.entries(state.corpus).filter(([name]) => fileMatchesScope(name, scope));
    const allRows = (suffix) => files.filter(([name]) => name.endsWith(`_${suffix}.csv`)).flatMap(([, rows]) => rows);

    const lineRows = allRows('lines');
    const syllRows = allRows('syllables');
    const wordRows = allRows('words');
    const fileRows = allRows('files');

    const linesByWork = new Map();
    const feetPat = new Map();
    const qty = new Map();
    let totalSyllables = 0, totalWords = 0, caesuraWord = 0;

    for (const r of lineRows) {
      mapAdd(linesByWork, String(r.work || 'unknown').trim() || 'unknown', 1);
      mapAdd(feetPat, String(r.feet_pattern || 'unknown').trim() || 'unknown', 1);
      totalSyllables += Number(r.n_syllables || 0);
      totalWords += Number(r.n_words || 0);
    }
    for (const r of syllRows) mapAdd(qty, String(r.quantity || 'unknown').toLowerCase(), 1);
    for (const r of wordRows) if (Number(r.contains_footend || 0)) caesuraWord += 1;

    const verseCount = lineRows.length;
    const avgSyl = verseCount ? (totalSyllables / verseCount) : 0;
    const avgWords = verseCount ? (totalWords / verseCount) : 0;
    const caesuraRate = wordRows.length ? ((caesuraWord / wordRows.length) * 100) : 0;
    return {
      works: new Set(lineRows.map(r => String(r.work || '').trim()).filter(Boolean)).size,
      books: new Set(lineRows.map(r => `${r.work || ''}:${r.book || ''}`)).size,
      verseCount,
      fileCount: fileRows.length,
      avgSyl,
      avgWords,
      caesuraRate,
      linesByWork: [...linesByWork.entries()].sort((a,b)=>b[1]-a[1]),
      feetPatterns: [...feetPat.entries()].sort((a,b)=>b[1]-a[1]),
      quantities: [...qty.entries()].sort((a,b)=>b[1]-a[1])
    };
  }

  function renderCorpusStats(scope = el.scansionWork?.value || 'all') {
    const stats = computeCorpusStats(scope);
    if (!stats) return;
    el.scansionCorpusSummary.innerHTML = `<div class="analysis-grid">
      <div class="analysis-card"><span class="label">Works</span><div class="value">${stats.works}</div></div>
      <div class="analysis-card"><span class="label">Books</span><div class="value">${stats.books}</div></div>
      <div class="analysis-card"><span class="label">Lines</span><div class="value">${stats.verseCount}</div></div>
      <div class="analysis-card"><span class="label">Source files</span><div class="value">${stats.fileCount}</div></div>
      <div class="analysis-card"><span class="label">Avg syllables/line</span><div class="value">${stats.avgSyl.toFixed(2)}</div></div>
      <div class="analysis-card"><span class="label">Avg words/line</span><div class="value">${stats.avgWords.toFixed(2)}</div></div>
      <div class="analysis-card"><span class="label">Word-footend rate</span><div class="value">${stats.caesuraRate.toFixed(1)}%</div></div>
    </div>`;

    renderCorpusBars(el.scansionLinesByWork, stats.linesByWork, 8);
    renderCorpusBars(el.scansionFeetPatterns, stats.feetPatterns, 12);
    renderCorpusBars(el.scansionQuantityProfile, stats.quantities, 6);
    renderCorpusBars(el.scansionPacingProfile, [
      ['Avg syllables/line', Number(stats.avgSyl.toFixed(2))],
      ['Avg words/line', Number(stats.avgWords.toFixed(2))],
      ['Word-footend rate (%)', Number(stats.caesuraRate.toFixed(1))]
    ], 6);
    populateScansionFilterOptions(scope);
    populateLineScopeOptions(scope);
    applySelectionFilters();
    renderLineScansionBrowser();
    setupZoom();
  }

  async function loadScansionCorpus() {
    if (!el.scansionLoadStatus) return;
    setLoadingStatus(el.scansionLoadStatus, 'Loading scansion corpus tables...');
    const loaded = {};
    const errs = [];
    for (const f of SCANSION_FILES) {
      const path = `assets/data/scansion/${f}`;
      try {
        const out = await fetchCsvAny(path);
        loaded[f] = out.rows;
      } catch (err) {
        errs.push(`${f}: ${String(err)}`);
      }
    }
    state.corpus = loaded;
    state.corpusLoaded = Object.keys(loaded).length > 0;
    if (!state.corpusLoaded) {
      el.scansionLoadStatus.classList.remove('loading-note');
      el.scansionLoadStatus.textContent = `Could not load scansion files. Put CSVs in assets/data/scansion/.`;
      return;
    }
    try {
      const morphLoaded = await fetchCsvAny('assets/data/default.csv');
      state.morphIndex = buildMorphIndex(morphLoaded.rows || []);
    } catch {
      state.morphIndex = null;
    }
    const rowCt = Object.values(loaded).reduce((a, rows) => a + rows.length, 0);
    el.scansionLoadStatus.classList.remove('loading-note');
    el.scansionLoadStatus.textContent = `Loaded ${Object.keys(loaded).length}/${SCANSION_FILES.length} files (${rowCt} rows).${errs.length ? ` Missing: ${errs.length} file(s).` : ''}`;
    renderCorpusStats(el.scansionWork?.value || 'all');
  }


  function normalizeGreekForMatch(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ς/g, 'σ');
  }


  function dedupeAdjacent(words) {
    const out = [];
    for (const w of words || []) if (!out.length || out[out.length - 1] !== w) out.push(w);
    return out;
  }

  function shouldMatchWord(value, query, mode, regexFlags = 'iu') {
    const hay = normalizeGreekForMatch(value || '');
    if (!query) return true;
    if (mode === 'equals') return hay === query;
    if (mode === 'startsWith') return hay.startsWith(query);
    if (mode === 'endsWith') return hay.endsWith(query);
    if (mode === 'regex') {
      try { return new RegExp(query, regexFlags).test(hay); } catch { return false; }
    }
    if (mode === 'containsAll') return query.split(/\s+/).filter(Boolean).every(part => hay.includes(part));
    return hay.includes(query);
  }

  function wrapCollapsible(title, count, innerHtml, open = false) {
    const state = open ? ' open' : '';
    return `<div class="collapsible-table"><details${state}><summary>${esc(title)} (${count}) — click to expand/collapse</summary>${innerHtml}</details></div>`;
  }

  function detectProsodicPhenomena(words) {
    let elisions = 0;
    let epicCorreption = 0;
    let resonantLengthening = 0;
    let naturallyLongBeforeVowel = 0;

    for (let i = 0; i < words.length - 1; i++) {
      const current = words[i];
      const next = words[i + 1];
      const w = normalizeGreekForMatch(current.word_text || current.form || '');
      const n = normalizeGreekForMatch(next.word_text || next.form || '');
      const endsVowel = /[αεηιουω]$/.test(w);
      const startsVowel = /^[αεηιουω]/.test(n);
      const startsResonant = /^[λμρν]/.test(n);
      const lastQ = String(current.all_quantities || '').slice(-1).toUpperCase();

      if ((/[’'᾽]/.test(String(current.word_text || '')) || (/[^αεηιουω]$/.test(w) && startsVowel)) && startsVowel) elisions += 1;

      if (startsVowel && /(?:αι|ει|οι|υι|ου|αυ|ευ|ηυ|ωυ|η|ω)$/.test(w)) {
        naturallyLongBeforeVowel += 1;
        if (lastQ === 'S') epicCorreption += 1;
      }

      if (startsResonant && /[αεο]$/.test(w) && lastQ === 'L') resonantLengthening += 1;
    }

    return { elisions, epicCorreption, resonantLengthening, naturallyLongBeforeVowel };
  }

  function setSelectOptions(select, values, placeholder = 'All') {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    const base = document.createElement('option');
    base.value = 'all';
    base.textContent = placeholder;
    select.appendChild(base);
    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = String(v);
      opt.textContent = String(v);
      select.appendChild(opt);
    }
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function populateScansionFilterOptions(scope = el.scansionWork?.value || 'all') {
    if (!state.corpusLoaded) return;
    const files = Object.entries(state.corpus).filter(([name]) => fileMatchesScope(name, scope));
    const lineRows = files.filter(([name]) => name.endsWith('_lines.csv')).flatMap(([, rows]) => rows);
    const bookVals = [...new Set(lineRows.map(r => String(r.book || '').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
    setSelectOptions(el.scansionBookFilter, bookVals, 'All books');
    const selectionRows = buildSelectionRows(scope);
    const morphFields = ['pos','person','number','tense','mood','voice','gender','case','degree'];
    for (const f of morphFields) {
      const vals = [...new Set(selectionRows.map(r => String(r[f] || '').trim()).filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b, undefined, { numeric:true }));
      const id = `scansion${f.charAt(0).toUpperCase()}${f.slice(1)}Filter`;
      setSelectOptions(el[id], vals, '(any)');
    }
  }

  function buildSelectionRows(scope = el.scansionWork?.value || 'all') {
    if (!state.corpusLoaded) return [];
    const files = Object.entries(state.corpus).filter(([name]) => fileMatchesScope(name, scope));
    const words = files.filter(([n]) => n.endsWith('_words.csv')).flatMap(([,r])=>r);
    const sylls = files.filter(([n]) => n.endsWith('_syllables.csv')).flatMap(([,r])=>r);

    const syllByLineWord = new Map();
    for (const s of sylls) {
      const key = `${s.work||''}|${s.book||''}|${s.line_id||''}|${s.word_idx||''}`;
      if (!syllByLineWord.has(key)) syllByLineWord.set(key, []);
      syllByLineWord.get(key).push(s);
    }

    const out = [];
    for (const w of words) {
      const key = `${w.work||''}|${w.book||''}|${w.line_id||''}|${w.word_idx||''}`;
      const group = syllByLineWord.get(key) || [];
      const feet = [...new Set(group.map(x => String(x.foot || '').trim()).filter(Boolean))].join(',');
      const hemis = [...new Set(group.map(x => String(x.hemi || '').trim()).filter(Boolean))].join(',');
      const qty = group.map(x => String(x.quantity || '').toLowerCase()).filter(Boolean);
      const hasLong = qty.includes('long');
      const hasShort = qty.includes('short');
      out.push({
        work: String(w.work || '').trim(),
        book: String(w.book || '').trim(),
        line_id: String(w.line_id || '').trim(),
        line_num: String(w.line_num || '').trim(),
        word_idx: String(w.word_idx || '').trim(),
        word_text: String(w.word_text || '').trim(),
        form: String(w.form || w.word_text || '').trim(),
        all_quantities: String(w.all_quantities || '').trim(),
        start_foot: String(w.start_foot || '').trim(),
        end_foot: String(w.end_foot || '').trim(),
        feet,
        hemis,
        hasLong,
        hasShort,
        contains_footend: Number(w.contains_footend || 0),
        lemma: String(w.lemma || morph.lemma || '').trim(),
        pos: String(morph.pos || '').trim(),
        person: String(morph.person || '').trim(),
        number: String(morph.number || '').trim(),
        tense: String(morph.tense || '').trim(),
        mood: String(morph.mood || '').trim(),
        voice: String(morph.voice || '').trim(),
        gender: String(morph.gender || '').trim(),
        case: String(morph.case || '').trim(),
        degree: String(morph.degree || '').trim()
      });
    }
    return out;
  }

  function applySelectionFilters() {
    if (!state.corpusLoaded || !el.scansionSelectionTable) return;
    const scope = el.scansionWork?.value || 'all';
    const book = el.scansionBookFilter?.value || 'all';
    const foot = el.scansionFootFilter?.value || 'all';
    const hemi = el.scansionHemiFilter?.value || 'all';
    const quantity = (el.scansionQuantityFilter?.value || 'all').toLowerCase();
    const qWordRaw = (el.scansionWordQuery?.value || '').trim();
    const qWord = normalizeGreekForMatch(qWordRaw);
    const matchMode = el.scansionWordMatchMode?.value || 'contains';
    const searchCol = el.scansionWordColumn?.value || 'word_text';
    const regexFlags = `${el.scansionRegexInsensitive?.checked ? 'i' : ''}${el.scansionRegexUnicode?.checked ? 'u' : ''}` || 'u';

    const rows = buildSelectionRows(scope).filter(r => {
      if (book !== 'all' && String(r.book) !== String(book)) return false;
      if (foot !== 'all' && !(r.feet.split(',').includes(String(foot)) || r.start_foot === String(foot) || r.end_foot === String(foot))) return false;
      if (hemi !== 'all' && !r.hemis.split(',').includes(String(hemi))) return false;
      if (quantity === 'long' && !r.hasLong) return false;
      if (quantity === 'short' && !r.hasShort) return false;
      const val = String(r[searchCol] ?? r.word_text ?? '');
      if (!shouldMatchWord(val, qWord, matchMode, regexFlags)) return false;
      const morphFields = ['pos','person','number','tense','mood','voice','gender','case','degree'];
      for (const f of morphFields) {
        const q = String(el[`scansion${f.charAt(0).toUpperCase()}${f.slice(1)}Filter`]?.value || '').trim().toLowerCase();
        if (!q) continue;
        if (String(r[f] || '').trim().toLowerCase() !== q) return false;
      }
      return true;
    });

    const footendRate = rows.length ? (rows.filter(r => r.contains_footend).length / rows.length) * 100 : 0;
    if (el.scansionSelectionSummary) {
      el.scansionSelectionSummary.innerHTML = `<div class="analysis-grid">
        <div class="analysis-card"><span class="label">Matching words</span><div class="value">${rows.length}</div></div>
        <div class="analysis-card"><span class="label">Unique lines</span><div class="value">${new Set(rows.map(r => `${r.work}:${r.book}:${r.line_id}`)).size}</div></div>
        <div class="analysis-card"><span class="label">Books hit</span><div class="value">${new Set(rows.map(r => `${r.work}:${r.book}`)).size}</div></div>
        <div class="analysis-card"><span class="label">Foot-end words</span><div class="value">${footendRate.toFixed(1)}%</div></div>
      </div>`;
    }

    const sample = rows.slice(0, 300);
    let html = '<table class="mini-table"><thead><tr><th>Work</th><th>Book</th><th>Line</th><th>Word #</th><th>Word</th><th>Lemma</th><th>Feet</th><th>Hemi</th><th>Quantities</th><th>Foot-end</th></tr></thead><tbody>';
    for (const r of sample) html += `<tr><td>${esc(r.work)}</td><td>${esc(r.book)}</td><td>${esc(r.line_num || r.line_id)}</td><td>${esc(r.word_idx)}</td><td>${esc(r.word_text)}</td><td>${esc(r.lemma || '')}</td><td>${esc(r.feet || `${r.start_foot}-${r.end_foot}`)}</td><td>${esc(r.hemis || '-')}</td><td>${esc(r.all_quantities)}</td><td>${r.contains_footend ? 'yes' : 'no'}</td></tr>`;
    html += '</tbody></table>';
    el.scansionSelectionTable.innerHTML = wrapCollapsible('Selection rows', rows.length, `<div class="table-wrap">${html}</div>`, false);
    setupZoom();
  }


  function num(val, d=0) {
    const n = Number(val);
    return Number.isFinite(n) ? n : d;
  }

  function sortNumericStrings(values) {
    return [...new Set(values)].sort((a,b)=>String(a).localeCompare(String(b), undefined, {numeric:true}));
  }

  function getGraphTopN() {
    return Math.max(3, num(el.prosodyGraphTopN?.value, 20));
  }

  function graphMode() {
    return (el.prosodyGraphMode?.value || 'bars').toLowerCase();
  }

  function renderVizRows(target, entries, opts = {}) {
    if (!target) return;
    const topN = opts.topN || getGraphTopN();
    const mode = opts.mode || graphMode();
    const rows = entries.slice(0, topN);
    const max = Math.max(...rows.map(([,v])=>num(v,0)), 1);
    if (!rows.length) { target.innerHTML = '<div class="small-muted">No data.</div>'; return; }

    if (mode === 'radar') {
      let html = '<div class="table-wrap"><table class="mini-table"><thead><tr><th>Metric</th><th>Value</th><th>Normalized</th></tr></thead><tbody>';
      for (const [k,v] of rows) {
        const n = num(v,0) / max;
        const dots = '●'.repeat(Math.max(1, Math.round(n*20)));
        html += `<tr><td>${esc(k)}</td><td>${num(v,0)}</td><td style="color:#4338ca;letter-spacing:1px;">${dots}</td></tr>`;
      }
      html += '</tbody></table></div>';
      target.innerHTML = html;
      return;
    }

    if (mode === 'stacked') {
      const total = rows.reduce((a,[,v])=>a+num(v,0), 0) || 1;
      let html = '<div style="display:flex; gap:.35rem; align-items:center; flex-wrap:wrap; margin:.35rem 0 .7rem;">';
      for (const [k,v] of rows) {
        const pct = (num(v,0)/total)*100;
        html += `<span style="display:inline-flex;align-items:center;gap:.35rem;padding:.25rem .45rem;border:1px solid #dbe4f0;border-radius:999px;background:#fff;"><span style="display:inline-block;width:${Math.max(6,pct*1.8)}px;height:10px;border-radius:999px;background:linear-gradient(90deg,#4f46e5,#22d3ee)"></span><small>${esc(k)} (${pct.toFixed(1)}%)</small></span>`;
      }
      html += '</div>';
      target.innerHTML = html;
      return;
    }

    let html = '';
    for (const [k,v] of rows) {
      const w = Math.max(3, Math.round((num(v,0)/max)*100));
      html += `<div class="viz-item"><div class="viz-row"><span class="viz-label">${esc(k)}</span><div class="viz-bar" style="width:${w}%"></div><span class="viz-value">${num(v,0)}</span></div></div>`;
    }
    target.innerHTML = html;
  }

  function aggregateFootHeat(results) {
    const m = new Map();
    for (const r of results || []) {
      const p = r.pattern || [];
      for (let i = 0; i < p.length; i++) {
        const key = `pos${i+1}:${p[i]}`;
        m.set(key, (m.get(key)||0)+1);
      }
    }
    return [...m.entries()].sort((a,b)=>b[1]-a[1]);
  }

  function aggregateMismatchHistogram(results) {
    const bins = new Map();
    for (const r of results || []) {
      const mis = (r.mismatches || []).length;
      bins.set(String(mis), (bins.get(String(mis))||0)+1);
    }
    return [...bins.entries()].sort((a,b)=>num(a[0],0)-num(b[0],0)).map(([k,v])=>[`mismatches ${k}`, v]);
  }

  function renderAdvancedProsodyVisuals(results = state.rows) {
    const footHeat = aggregateFootHeat(results);
    const mismatchHist = aggregateMismatchHistogram(results);
    renderVizRows(el.prosodyFootHeat, footHeat, { topN: getGraphTopN() });
    renderVizRows(el.prosodyHist, mismatchHist, { topN: 30 });
    if (window.MopsosPlaybook && el.prosodyHist && mismatchHist.length) {
      const vals = mismatchHist.map(([,v]) => Number(v) || 0);
      el.prosodyHist.innerHTML += `<div style="margin-top:.55rem;"><h4 style="margin:.2rem 0;">Spark summary</h4>${window.MopsosPlaybook.sparkbar(vals, 560, 60)}</div>`;
    }
    setupZoom();
  }

  function collectLineScansionRows(scope = el.scansionWork?.value || 'all') {
    if (!state.corpusLoaded) return [];
    const files = Object.entries(state.corpus).filter(([name]) => fileMatchesScope(name, scope));
    const lines = files.filter(([n]) => n.endsWith('_lines.csv')).flatMap(([,r])=>r);
    const words = files.filter(([n]) => n.endsWith('_words.csv')).flatMap(([,r])=>r);
    const sylls = files.filter(([n]) => n.endsWith('_syllables.csv')).flatMap(([,r])=>r);

    const wordsByLine = new Map();
    for (const w of words) {
      const key = `${w.work||''}|${w.book||''}|${w.line_id||''}`;
      if (!wordsByLine.has(key)) wordsByLine.set(key, []);
      wordsByLine.get(key).push(w);
    }
    const sylByLine = new Map();
    for (const y of sylls) {
      const key = `${y.work||''}|${y.book||''}|${y.line_id||''}`;
      if (!sylByLine.has(key)) sylByLine.set(key, []);
      sylByLine.get(key).push(y);
    }

    const out = [];
    for (const ln of lines) {
      const key = `${ln.work||''}|${ln.book||''}|${ln.line_id||''}`;
      const ws = (wordsByLine.get(key) || []).sort((a,b)=>num(a.word_idx)-num(b.word_idx));
      const sy = (sylByLine.get(key) || []).sort((a,b)=>num(a.syll_order_in_line)-num(b.syll_order_in_line));
      const lineText = String(ln.line_text || ws.map(w=>w.word_text).join(' ')).trim();
      const fromSyll = sy.map(s => String(s.quantity||'').toLowerCase().startsWith('l') ? 'L' : 'S').join('');
      const grouped = [];
      for (let f = 1; f <= 6; f++) {
        const bit = sy.filter(s=>String(s.foot||'')===String(f)).map(s => String(s.quantity||'').toLowerCase().startsWith('l') ? 'L' : 'S').join('');
        if (bit) grouped.push(bit);
      }
      out.push({
        work: String(ln.work||''),
        book: String(ln.book||''),
        line_id: String(ln.line_id||''),
        line_num: String(ln.line_num||''),
        text: lineText,
        feet_pattern: String(ln.feet_pattern || grouped.join('|') || fromSyll),
        words: ws,
        syllables: sy,
        word_scansion: ws.map(w => `${w.word_text}(${w.all_quantities || ''})`).join(' · ')
      });
    }
    return out;
  }

  function populateLineScopeOptions(scope = el.scansionWork?.value || 'all') {
    if (!el.scansionLineScope) return;
    const rows = collectLineScansionRows(scope);
    const books = sortNumericStrings(rows.map(r => `${r.work}:${r.book}`));
    const current = el.scansionLineScope.value;
    el.scansionLineScope.innerHTML = '<option value="all">Current scope</option>';
    for (const b of books) {
      const o = document.createElement('option');
      o.value = b;
      o.textContent = b;
      el.scansionLineScope.appendChild(o);
    }
    if ([...el.scansionLineScope.options].some(o=>o.value===current)) el.scansionLineScope.value=current;
  }

  function renderLineScansionBrowser() {
    if (!el.prosodyLineScansionTable) return;
    const scope = el.scansionWork?.value || 'all';
    const lineScope = el.scansionLineScope?.value || 'all';
    const q = normalizeGreekForMatch(el.scansionLineQuery?.value || '').trim();
    let rows = collectLineScansionRows(scope);
    if (lineScope !== 'all') rows = rows.filter(r => `${r.work}:${r.book}` === lineScope);
    if (q) rows = rows.filter(r => normalizeGreekForMatch(r.text).includes(q) || normalizeGreekForMatch(r.word_scansion).includes(q));

    let html = '<table class="mini-table"><thead><tr><th>Work</th><th>Book</th><th>Line</th><th>Text</th><th>Line scansion</th><th>Word-level scansion</th></tr></thead><tbody>';
    for (const r of rows.slice(0, 250)) {
      html += `<tr><td>${esc(r.work)}</td><td>${esc(r.book)}</td><td>${esc(r.line_num || r.line_id)}</td><td>${esc(r.text)}</td><td>${esc(r.feet_pattern)}</td><td>${esc(r.word_scansion)}</td></tr>`;
    }
    html += '</tbody></table>';
    el.prosodyLineScansionTable.innerHTML = wrapCollapsible('Per-line rows', rows.length, `<div class="table-wrap">${html}</div>`, false);
    setupZoom();
  }



  function normalizePattern(p) {
    return String(p || '').replace(/[^LS\|]/gi, '').toUpperCase();
  }

  function patternSimilarity(a, b) {
    const x = normalizePattern(a).replace(/\|/g, '');
    const y = normalizePattern(b).replace(/\|/g, '');
    const n = Math.max(x.length, y.length, 1);
    let same = 0;
    for (let i = 0; i < n; i++) if ((x[i] || '-') === (y[i] || '-')) same += 1;
    return same / n;
  }

  function runPatternClustering() {
    if (!state.corpusLoaded) return;
    const scope = el.scansionWork?.value || 'all';
    const rows = collectLineScansionRows(scope);
    const topN = Math.max(5, num(el.patternClusterTopN?.value, 20));
    const threshold = Math.max(0.1, Math.min(0.99, num(el.patternClusterThreshold?.value, 0.7)));

    const freq = new Map();
    for (const r of rows) {
      const p = normalizePattern(r.feet_pattern);
      if (!p) continue;
      freq.set(p, (freq.get(p) || 0) + 1);
    }
    const patterns = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0, topN).map(([p,c])=>({pattern:p,count:c}));
    const labels = new Array(patterns.length).fill(-1);
    let cid = 0;
    for (let i = 0; i < patterns.length; i++) {
      if (labels[i] !== -1) continue;
      labels[i] = cid;
      for (let j = i + 1; j < patterns.length; j++) {
        if (patternSimilarity(patterns[i].pattern, patterns[j].pattern) >= threshold) labels[j] = cid;
      }
      cid += 1;
    }

    const clusters = new Map();
    patterns.forEach((p, i) => {
      const c = labels[i];
      if (!clusters.has(c)) clusters.set(c, []);
      clusters.get(c).push(p);
    });

    if (el.patternClusterSummary) {
      el.patternClusterSummary.innerHTML = `<div class="analysis-grid">
        <div class="analysis-card"><span class="label">Patterns considered</span><div class="value">${patterns.length}</div></div>
        <div class="analysis-card"><span class="label">Clusters</span><div class="value">${clusters.size}</div></div>
        <div class="analysis-card"><span class="label">Similarity threshold</span><div class="value">${threshold.toFixed(2)}</div></div>
      </div>`;
    }

    let html = '<table class="mini-table"><thead><tr><th>Cluster</th><th>Patterns</th><th>Total lines</th></tr></thead><tbody>';
    for (const [c, arr] of [...clusters.entries()].sort((a,b)=>b[1].length-a[1].length)) {
      const total = arr.reduce((t,x)=>t+x.count,0);
      const pats = arr.map(x => `${x.pattern} (${x.count})`).join(', ');
      html += `<tr><td>${c}</td><td>${esc(pats)}</td><td>${total}</td></tr>`;
    }
    html += '</tbody></table>';
    if (el.patternClusterTable) el.patternClusterTable.innerHTML = wrapCollapsible('Pattern clusters', clusters.size, `<div class="table-wrap">${html}</div>`, false);
    setupZoom();
  }

  function runSlotRepetitionAnalysis() {
    if (!state.corpusLoaded) return;
    const scope = el.scansionWork?.value || 'all';
    const foot = el.slotFootSelect?.value || 'all';
    const q = normalizeGreekForMatch(el.slotWordQuery?.value || '').trim();
    const topN = Math.max(5, num(el.slotTopN?.value, 25));

    const base = buildSelectionRows(scope).filter(r => (foot === 'all' || r.start_foot === String(foot) || r.end_foot === String(foot)));
    const byWord = new Map();
    for (const r of base) {
      const key = normalizeGreekForMatch(r.word_text);
      if (!key) continue;
      const row = byWord.get(key) || { display: r.word_text, count: 0, feet: new Set(), books: new Set() };
      row.count += 1;
      row.feet.add(r.start_foot || r.end_foot || '-');
      row.books.add(`${r.work}:${r.book}`);
      byWord.set(key, row);
    }

    let rows = [...byWord.entries()].map(([k,v]) => ({ key: k, ...v }));
    if (q) rows = rows.filter(r => r.key.includes(q));
    rows.sort((a,b)=>b.count-a.count);
    const top = rows.slice(0, topN);

    if (el.slotRepetitionSummary) {
      el.slotRepetitionSummary.innerHTML = `<div class="analysis-grid">
        <div class="analysis-card"><span class="label">Candidate tokens</span><div class="value">${rows.length}</div></div>
        <div class="analysis-card"><span class="label">Top list size</span><div class="value">${top.length}</div></div>
        <div class="analysis-card"><span class="label">Foot filter</span><div class="value">${foot === 'all' ? 'all' : foot}</div></div>
        <div class="analysis-card"><span class="label">Word query</span><div class="value">${esc(q || '(top-N mode)')}</div></div>
      </div>`;
    }

    let html = '<table class="mini-table"><thead><tr><th>Word</th><th>Count</th><th>Feet</th><th>Books hit</th></tr></thead><tbody>';
    for (const r of top) html += `<tr><td>${esc(r.display)}</td><td>${r.count}</td><td>${esc([...r.feet].join(', '))}</td><td>${r.books.size}</td></tr>`;
    html += '</tbody></table>';
    if (el.slotRepetitionTable) el.slotRepetitionTable.innerHTML = wrapCollapsible('Slot repetition rows', top.length, `<div class="table-wrap">${html}</div>`, false);
    setupZoom();
  }

  function setupZoom() {
    const targets = [el.prosodySummary, ...document.querySelectorAll('.viz-wrap')].filter(Boolean);
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
    const template = parseTemplate();
    let scanned = [];

    const manualLines = norm(el.prosodyInput?.value || '').split(/\r?\n/).map(norm).filter(Boolean);
    if (manualLines.length) {
      scanned = manualLines.map(scanLine).map((r, idx) => {
        const cmp = comparePattern(r.pattern, template);
        return { verse: idx + 1, text: r.line, scansion: r.pattern.join(' '), syllables: r.syllables.length, matchScore: cmp.score, mismatches: cmp.mismatches, ...r };
      });
    } else if (state.corpusLoaded) {
      const fromCorpus = collectLineScansionRows(el.scansionWork?.value || 'all').slice(0, 500);
      scanned = fromCorpus.map((r, idx) => {
        const raw = normalizePattern(r.feet_pattern).replace(/\|/g, '');
        const pattern = [...raw].map(ch => ch === 'L' ? '–' : '⏑');
        const cmp = comparePattern(pattern, template);
        const words = dedupeAdjacent((r.words || []).map(w => String(w.word_text || '').trim()).filter(Boolean));
        const ci = words.length < 4 ? -1 : Math.floor(words.length / 2);
        const caesuraText = words.map((w, i) => i === ci ? `${w} ‖` : w).join(' ');
        const phenomena = detectProsodicPhenomena(r.words || []);
        return {
          verse: idx + 1,
          line: r.text,
          text: r.text,
          words,
          syllables: r.syllables || [],
          pattern,
          scansion: pattern.join(' '),
          matchScore: cmp.score,
          mismatches: cmp.mismatches,
          caesuraAt: ci,
          caesuraText,
          elisions: phenomena.elisions,
          correption: phenomena.epicCorreption,
          naturallyLongBeforeVowel: phenomena.naturallyLongBeforeVowel,
          resonantLengthening: phenomena.resonantLengthening
        };
      });
    }

    const totalSyl = scanned.reduce((a,r)=>a + (Array.isArray(r.syllables) ? r.syllables.length : num(r.syllables,0)),0);
    state.rows = scanned;
    renderSummary(scanned, totalSyl);
    renderAlignment(scanned);
    renderBars(scanned);
    renderDiagnostics(scanned);
    renderAdvancedProsodyVisuals(scanned);
    runPatternClustering();
    runSlotRepetitionAnalysis();
    setupZoom();
  }

  el.btnApplyPreset?.addEventListener('click', () => { if (el.prosodyTemplate) el.prosodyTemplate.value = PRESETS.hex; run(); });
  el.btnRunProsody?.addEventListener('click', run);
  el.btnProsodySample?.addEventListener('click', () => { if (el.prosodyTemplate) el.prosodyTemplate.value = PRESETS.hex; run(); });
  el.btnProsodyExport?.addEventListener('click', exportCsv);
  el.btnLoadScansionCorpus?.addEventListener('click', loadScansionCorpus);
  el.btnScansionRefresh?.addEventListener('click', () => renderCorpusStats(el.scansionWork?.value || 'all'));
  el.scansionWork?.addEventListener('change', () => renderCorpusStats(el.scansionWork.value));
  el.btnScansionApplyFilters?.addEventListener('click', applySelectionFilters);
  [el.scansionBookFilter, el.scansionFootFilter, el.scansionHemiFilter, el.scansionQuantityFilter].forEach(x => x?.addEventListener('change', applySelectionFilters));
  el.scansionWordQuery?.addEventListener('input', applySelectionFilters);
  [el.scansionWordMatchMode, el.scansionWordColumn, el.scansionRegexInsensitive, el.scansionRegexUnicode].forEach(x => x?.addEventListener('change', applySelectionFilters));
  [el.scansionPosFilter, el.scansionPersonFilter, el.scansionNumberFilter, el.scansionTenseFilter, el.scansionMoodFilter, el.scansionVoiceFilter, el.scansionGenderFilter, el.scansionCaseFilter, el.scansionDegreeFilter].forEach(x => x?.addEventListener('change', applySelectionFilters));
  el.btnProsodyRerender?.addEventListener('click', () => { renderAdvancedProsodyVisuals(state.rows); renderLineScansionBrowser(); });
  el.btnRenderLineScansion?.addEventListener('click', renderLineScansionBrowser);
  el.scansionLineScope?.addEventListener('change', renderLineScansionBrowser);
  el.scansionLineQuery?.addEventListener('input', renderLineScansionBrowser);
  el.prosodyGraphMode?.addEventListener('change', () => renderAdvancedProsodyVisuals(state.rows));
  el.prosodyGraphTopN?.addEventListener('change', () => renderAdvancedProsodyVisuals(state.rows));
  if (el.prosodyTemplate) el.prosodyTemplate.value = PRESETS.hex;
  loadScansionCorpus().then(run);
})();
