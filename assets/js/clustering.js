(() => {
  const BUNDLED_DATASET_URLS = {
    "default.csv": "assets/data/default.csv"
  };
  const SHARED_CLUSTER_SOURCE_KEY = "gmf_clustering_sources_v1";
  const MORPH_LABELS = {
    pos: { a: "Adjective", c: "Conjunction", d: "Adverb", i: "Interjection", l: "Article", m: "Number", n: "Noun", p: "Pronoun", r: "Preposition", v: "Verb", x: "Uncategorized" },
    number: { s: "Singular", p: "Plural", d: "Dual" },
    gender: { m: "Masculine", f: "Feminine", n: "Neuter" },
    case: { n: "Nominative", g: "Genitive", d: "Dative", a: "Accusative", v: "Vocative" },
    degree: { p: "Positive", c: "Comparative", s: "Superlative" }
  };

  const state = {
    rawRows: [],
    columns: [],
    run: null,
    morphCols: {}
  };

  const el = {
    clusterCsvFile: byId("clusterCsvFile"),
    clusterBundledDataset: byId("clusterBundledDataset"),
    btnClusterLoadBundled: byId("btnClusterLoadBundled"),
    clusterSharedDataset: byId("clusterSharedDataset"),
    btnClusterLoadShared: byId("btnClusterLoadShared"),
    clusterLoadStatus: byId("clusterLoadStatus"),
    clusterBookCol: byId("clusterBookCol"),
    clusterTokenCol: byId("clusterTokenCol"),
    clusterPosCol: byId("clusterPosCol"),
    clusterPersonCol: byId("clusterPersonCol"),
    clusterNumberCol: byId("clusterNumberCol"),
    clusterTenseCol: byId("clusterTenseCol"),
    clusterMoodCol: byId("clusterMoodCol"),
    clusterVoiceCol: byId("clusterVoiceCol"),
    clusterGenderCol: byId("clusterGenderCol"),
    clusterCaseCol: byId("clusterCaseCol"),
    clusterDegreeCol: byId("clusterDegreeCol"),
    clusterPosFilter: byId("clusterPosFilter"),
    clusterPersonFilter: byId("clusterPersonFilter"),
    clusterNumberFilter: byId("clusterNumberFilter"),
    clusterTenseFilter: byId("clusterTenseFilter"),
    clusterMoodFilter: byId("clusterMoodFilter"),
    clusterVoiceFilter: byId("clusterVoiceFilter"),
    clusterGenderFilter: byId("clusterGenderFilter"),
    clusterCaseFilter: byId("clusterCaseFilter"),
    clusterDegreeFilter: byId("clusterDegreeFilter"),
    clusterFeatureMode: byId("clusterFeatureMode"),
    clusterNgram: byId("clusterNgram"),
    clusterVectorModel: byId("clusterVectorModel"),
    clusterDistance: byId("clusterDistance"),
    clusterMethod: byId("clusterMethod"),
    clusterK: byId("clusterK"),
    clusterThreshold: byId("clusterThreshold"),
    clusterEps: byId("clusterEps"),
    clusterMinPts: byId("clusterMinPts"),
    clusterTopFeatures: byId("clusterTopFeatures"),
    clusterExcludeFunction: byId("clusterExcludeFunction"),
    clusterMinDocFreq: byId("clusterMinDocFreq"),
    clusterMaxDocFreq: byId("clusterMaxDocFreq"),
    btnRunCluster: byId("btnRunCluster"),
    btnClusterBenchmark: byId("btnClusterBenchmark"),
    btnClusterStress: byId("btnClusterStress"),
    btnClusterExport: byId("btnClusterExport"),
    clusterSummary: byId("clusterSummary"),
    clusterBenchmark: byId("clusterBenchmark"),
    clusterStressOut: byId("clusterStressOut"),
    clusterMdsSvg: byId("clusterMdsSvg"),
    clusterNetworkSvg: byId("clusterNetworkSvg"),
    clusterHeatmap: byId("clusterHeatmap"),
    clusterSizeBars: byId("clusterSizeBars"),
    clusterFeatures: byId("clusterFeatures"),
    clusterSimilarityDist: byId("clusterSimilarityDist")
  };

  function byId(id) { return document.getElementById(id); }
  function normStr(x) { return String(x ?? "").trim(); }
  function esc(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function setStatus(msg) { el.clusterLoadStatus.textContent = msg; }


  const FUNCTION_WORDS = new Set([
    "και","δε","τε","γαρ","γε","αρα","ρα","αν","κε","κεν","περ","τοι","που","νυ","μεν","ουν","η","ου","μη","ει","ως","ο","η","το","οι","αι","τα","τον","την","των","τοις","ταις","τον","την","τις","τι","τον","των"
  ]);

  function normalizeGreek(x) {
    return String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[^α-ω]/g, "");
  }

  function termIsFunctionWord(term, mode) {
    if (mode === "collocation") {
      const parts = String(term).split(" ␠ ").map(normalizeGreek).filter(Boolean);
      return parts.length ? parts.every(p => FUNCTION_WORDS.has(p)) : false;
    }
    return FUNCTION_WORDS.has(normalizeGreek(term));
  }


  function readSharedSources() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SHARED_CLUSTER_SOURCE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function refreshSharedSourceSelect() {
    const payload = readSharedSources();
    const names = Object.keys(payload).sort();
    el.clusterSharedDataset.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = names.length ? "Choose shared filtered dataset..." : "No filtered datasets shared from morphology yet";
    el.clusterSharedDataset.appendChild(blank);
    for (const name of names) {
      const o = document.createElement("option");
      o.value = name;
      const rowCount = payload[name]?.rowCount || 0;
      o.textContent = `${name} • ${rowCount} rows`;
      el.clusterSharedDataset.appendChild(o);
    }
    el.btnClusterLoadShared.disabled = !names.length;
  }

  function loadSharedDataset() {
    const slot = el.clusterSharedDataset.value;
    if (!slot) return;
    const item = readSharedSources()[slot];
    if (!item?.csv) return setStatus(`Shared dataset '${slot}' is missing or invalid.`);
    parseCsv(item.csv, `${slot}.csv`);
    setStatus(`Loaded shared filtered dataset '${slot}' (${item.rowCount || 0} rows).`);
  }

  function parseCsv(text, fileName = "uploaded.csv") {
    setStatus(`Loading ${fileName} ...`);
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => {
        state.rawRows = (res.data || []).map((r, i) => ({ ...r, _row_order: i }));
        state.columns = res.meta?.fields || (state.rawRows[0] ? Object.keys(state.rawRows[0]) : []);
        setStatus(`Loaded ${fileName} with ${state.rawRows.length} rows.`);
        populateColumns();
        resetOutputs();
        setupZoomButtons();
      },
      error: (err) => setStatus(`CSV parse error: ${String(err)}`)
    });
  }

  function pickMorphGuess(cols, key) {
    return cols.find(c => c.toLowerCase() === key) || cols.find(c => c.toLowerCase().includes(key)) || "";
  }

  function fillColumnSelect(select, cols, guess = "") {
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "(none)";
    select.appendChild(blank);
    for (const c of cols) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      select.appendChild(o);
    }
    if (cols.includes(current)) select.value = current;
    else if (guess && cols.includes(guess)) select.value = guess;
    select.disabled = !cols.length;
  }

  function formatMorphOption(field, value) {
    const norm = String(value || "").trim().toLowerCase();
    const label = MORPH_LABELS[field]?.[norm];
    return label || value;
  }

  function setSelectOptions(select, values, field = "") {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">(any)</option>';
    for (const v of values) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = formatMorphOption(field, v);
      select.appendChild(o);
    }
    if (values.includes(current)) select.value = current;
  }

  function uniqueValuesForColumn(col) {
    if (!col) return [];
    return [...new Set(state.rawRows.map(r => normStr(r[col])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function populateColumns() {
    const cols = state.columns;
    const tokenGuess = pickMorphGuess(cols, "lemma") || pickMorphGuess(cols, "form") || cols[0] || "";

    fillColumnSelect(el.clusterBookCol, ["work"], "work");
    fillColumnSelect(el.clusterTokenCol, ["form", "lemma"], tokenGuess === "form" ? "form" : "lemma");
    state.morphCols = {
      pos: pickMorphGuess(cols, "pos"),
      person: pickMorphGuess(cols, "person"),
      number: pickMorphGuess(cols, "number"),
      tense: pickMorphGuess(cols, "tense"),
      mood: pickMorphGuess(cols, "mood"),
      voice: pickMorphGuess(cols, "voice"),
      gender: pickMorphGuess(cols, "gender"),
      case: pickMorphGuess(cols, "case"),
      degree: pickMorphGuess(cols, "degree")
    };
    setSelectOptions(el.clusterPosFilter, uniqueValuesForColumn(state.morphCols.pos), "pos");
    setSelectOptions(el.clusterPersonFilter, uniqueValuesForColumn(state.morphCols.person), "person");
    setSelectOptions(el.clusterNumberFilter, uniqueValuesForColumn(state.morphCols.number), "number");
    setSelectOptions(el.clusterTenseFilter, uniqueValuesForColumn(state.morphCols.tense), "tense");
    setSelectOptions(el.clusterMoodFilter, uniqueValuesForColumn(state.morphCols.mood), "mood");
    setSelectOptions(el.clusterVoiceFilter, uniqueValuesForColumn(state.morphCols.voice), "voice");
    setSelectOptions(el.clusterGenderFilter, uniqueValuesForColumn(state.morphCols.gender), "gender");
    setSelectOptions(el.clusterCaseFilter, uniqueValuesForColumn(state.morphCols.case), "case");
    setSelectOptions(el.clusterDegreeFilter, uniqueValuesForColumn(state.morphCols.degree), "degree");

    syncControlStates();
  }

  function syncControlStates() {
    el.clusterNgram.disabled = el.clusterFeatureMode.value !== "collocation";
    const enabled = !!(state.rawRows.length && el.clusterBookCol.value && el.clusterTokenCol.value);
    el.btnRunCluster.disabled = !enabled;
    el.btnClusterBenchmark.disabled = !enabled;
    if (el.btnClusterStress) el.btnClusterStress.disabled = !enabled;
  }

  function resetOutputs() {
    el.clusterSummary.innerHTML = `<div class="small-muted">Run clustering to see results.</div>`;
    el.clusterHeatmap.innerHTML = `<div class="small-muted">Heatmap will render after a run.</div>`;
    el.clusterSizeBars.innerHTML = `<div class="small-muted">Cluster sizes will render after a run.</div>`;
    el.clusterFeatures.innerHTML = `<div class="small-muted">Top cluster features will render after a run.</div>`;
    el.clusterMdsSvg.innerHTML = "";
    el.clusterNetworkSvg.innerHTML = "";
    el.clusterBenchmark.innerHTML = `<div class="small-muted">Benchmark table will render after benchmark run.</div>`;
    if (el.clusterStressOut) el.clusterStressOut.innerHTML = `<div class="small-muted">Stress test output will appear here.</div>`;
    if (el.clusterSimilarityDist) el.clusterSimilarityDist.innerHTML = `<div class="small-muted">Distribution will render after a run.</div>`;
  }

  function colorFor(i) {
    const palette = ["#4f46e5", "#0ea5e9", "#06b6d4", "#0891b2", "#22c55e", "#16a34a", "#f59e0b", "#f97316", "#ef4444", "#e11d48", "#8b5cf6"];
    return palette[i % palette.length];
  }


  function matchesMorphFilters(row) {
    const specs = [
      [state.morphCols.pos, el.clusterPosFilter?.value],
      [state.morphCols.person, el.clusterPersonFilter?.value],
      [state.morphCols.number, el.clusterNumberFilter?.value],
      [state.morphCols.tense, el.clusterTenseFilter?.value],
      [state.morphCols.mood, el.clusterMoodFilter?.value],
      [state.morphCols.voice, el.clusterVoiceFilter?.value],
      [state.morphCols.gender, el.clusterGenderFilter?.value],
      [state.morphCols.case, el.clusterCaseFilter?.value],
      [state.morphCols.degree, el.clusterDegreeFilter?.value]
    ];
    for (const [col, filterVal] of specs) {
      const q = normStr(filterVal).toLowerCase();
      if (!q) continue;
      if (!col) return false;
      const value = normStr(row[col]).toLowerCase();
      if (value !== q) return false;
    }
    return true;
  }

  function buildFeatures(rows, bookCol, tokenCol, mode, ngramN, filters) {
    const byBook = new Map();
    for (const r of rows) {
      const b = normStr(r[bookCol]);
      const t = normStr(r[tokenCol]);
      if (!b || !t) continue;
      if (!byBook.has(b)) byBook.set(b, []);
      byBook.get(b).push(t);
    }

    const featureByBook = new Map();
    for (const [book, tokens] of byBook.entries()) {
      const feats = [];
      if (mode === "collocation") {
        const n = Math.max(2, ngramN);
        for (let i = 0; i <= tokens.length - n; i++) feats.push(tokens.slice(i, i + n).join(" ␠ "));
      } else {
        feats.push(...tokens);
      }
      const freq = new Map();
      for (const f of feats) {
        if (filters.excludeFunction && termIsFunctionWord(f, mode)) continue;
        freq.set(f, (freq.get(f) || 0) + 1);
      }
      featureByBook.set(book, freq);
    }

    const books = [...featureByBook.keys()];
    const docFreq = new Map();
    for (const b of books) for (const term of featureByBook.get(b).keys()) docFreq.set(term, (docFreq.get(term) || 0) + 1);

    for (const b of books) {
      const src = featureByBook.get(b);
      const next = new Map();
      for (const [term, count] of src.entries()) {
        const ratio = (docFreq.get(term) || 0) / Math.max(1, books.length);
        if (ratio < filters.minDf || ratio > filters.maxDf) continue;
        next.set(term, count);
      }
      featureByBook.set(b, next);
    }
    return featureByBook;
  }

  function vectorize(featureByBook, model) {
    const books = [...featureByBook.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const vocab = new Map();
    for (const b of books) for (const k of featureByBook.get(b).keys()) if (!vocab.has(k)) vocab.set(k, vocab.size);
    const V = vocab.size;
    const N = books.length;

    const X = books.map(() => new Float64Array(V));
    const docLengths = new Float64Array(N);
    const df = new Float64Array(V);

    for (let i = 0; i < N; i++) {
      const freq = featureByBook.get(books[i]);
      for (const [term, count] of freq.entries()) {
        const j = vocab.get(term);
        X[i][j] = count;
        docLengths[i] += count;
      }
      for (let j = 0; j < V; j++) if (X[i][j] > 0) df[j] += 1;
    }

    if (model === "binary") {
      for (let i = 0; i < N; i++) for (let j = 0; j < V; j++) X[i][j] = X[i][j] > 0 ? 1 : 0;
    }

    if (model === "tfidf") {
      for (let j = 0; j < V; j++) {
        const idf = Math.log((N + 1) / (1 + df[j])) + 1;
        for (let i = 0; i < N; i++) X[i][j] *= idf;
      }
    }

    if (model === "bm25" || model === "bm25plus") {
      const avgdl = docLengths.reduce((a, b) => a + b, 0) / Math.max(1, N);
      const k1 = 1.2;
      const b = 0.75;
      const delta = model === "bm25plus" ? 1.0 : 0.0;
      for (let j = 0; j < V; j++) {
        const idf = Math.log(1 + ((N - df[j] + 0.5) / (df[j] + 0.5)));
        for (let i = 0; i < N; i++) {
          const tf = X[i][j];
          if (!tf) continue;
          const denom = tf + k1 * (1 - b + b * (docLengths[i] / Math.max(avgdl, 1e-9)));
          X[i][j] = idf * (((tf * (k1 + 1)) / denom) + delta);
        }
      }
    }

    const terms = [...vocab.entries()].sort((a, b) => a[1] - b[1]).map(x => x[0]);
    return { books, X, terms };
  }

  function pairwiseDistance(X, metric) {
    const n = X.length;
    const D = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = distance(X[i], X[j], metric);
        D[i][j] = d;
        D[j][i] = d;
      }
    }
    return D;
  }

  function distance(a, b, metric) {
    let dot = 0, na = 0, nb = 0, man = 0, eu = 0, inter = 0, union = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i], bi = b[i];
      dot += ai * bi;
      na += ai * ai;
      nb += bi * bi;
      const diff = ai - bi;
      man += Math.abs(diff);
      eu += diff * diff;
      const aPos = ai > 0, bPos = bi > 0;
      if (aPos || bPos) union += 1;
      if (aPos && bPos) inter += 1;
    }
    if (metric === "euclidean") return Math.sqrt(eu);
    if (metric === "manhattan") return man;
    if (metric === "jaccard") return union ? (1 - inter / union) : 1;
    const denom = Math.sqrt(na * nb) || 1;
    return 1 - (dot / denom);
  }

  function runMethod(method, D, X, params) {
    if (method === "threshold") return thresholdComponents(D, 1 - params.threshold);
    if (method === "single") return agglomerative(D, params.k, "single");
    if (method === "complete") return agglomerative(D, params.k, "complete");
    if (method === "average") return agglomerative(D, params.k, "average");
    if (method === "ward") return agglomerative(D, params.k, "ward");
    if (method === "kmeans") return kmeans(X, params.k, 18);
    if (method === "kmedoids") return kmedoids(D, params.k, 22);
    if (method === "dbscan") return dbscan(D, params.eps, params.minPts);
    if (method === "labelprop") return labelPropagation(D, 1 - params.threshold, 20);
    if (method === "mds_kmeans") {
      const mds = classicalMds(D, 2);
      return kmeans(mds, params.k, 20);
    }
    return thresholdComponents(D, 0.75);
  }

  function thresholdComponents(D, maxDist) {
    const n = D.length;
    const p = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
    const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) p[b] = a; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (D[i][j] <= maxDist) unite(i, j);
    return relabel(Array.from({ length: n }, (_, i) => find(i)));
  }

  function agglomerative(D, k, linkage) {
    const n = D.length;
    let clusters = Array.from({ length: n }, (_, i) => [i]);
    const distClusters = (a, b) => {
      if (linkage === "ward") {
        let sum = 0, ct = 0;
        for (const i of a) for (const j of b) { sum += D[i][j] * D[i][j]; ct += 1; }
        return sum / Math.max(1, ct);
      }
      if (linkage === "single") {
        let best = Infinity;
        for (const i of a) for (const j of b) if (D[i][j] < best) best = D[i][j];
        return best;
      }
      if (linkage === "complete") {
        let worst = 0;
        for (const i of a) for (const j of b) if (D[i][j] > worst) worst = D[i][j];
        return worst;
      }
      let sum = 0, ct = 0;
      for (const i of a) for (const j of b) { sum += D[i][j]; ct += 1; }
      return sum / Math.max(1, ct);
    };

    while (clusters.length > Math.max(1, Math.min(k, n))) {
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const d = distClusters(clusters[i], clusters[j]);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      clusters[bi] = clusters[bi].concat(clusters[bj]);
      clusters.splice(bj, 1);
    }

    const labels = new Array(n).fill(0);
    clusters.forEach((c, idx) => c.forEach(i => { labels[i] = idx; }));
    return labels;
  }

  function kmeans(X, k, iters = 20) {
    const n = X.length;
    const dim = X[0]?.length || 0;
    k = Math.max(1, Math.min(k, n));
    const centers = [];
    for (let i = 0; i < k; i++) centers.push(Float64Array.from(X[Math.floor((i * n) / k)]));
    const labels = new Array(n).fill(0);

    for (let t = 0; t < iters; t++) {
      for (let i = 0; i < n; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          let d = 0;
          for (let j = 0; j < dim; j++) {
            const diff = X[i][j] - centers[c][j];
            d += diff * diff;
          }
          if (d < bd) { bd = d; best = c; }
        }
        labels[i] = best;
      }
      const sums = Array.from({ length: k }, () => new Float64Array(dim));
      const cnt = new Array(k).fill(0);
      for (let i = 0; i < n; i++) {
        const c = labels[i];
        cnt[c] += 1;
        for (let j = 0; j < dim; j++) sums[c][j] += X[i][j];
      }
      for (let c = 0; c < k; c++) if (cnt[c] > 0) for (let j = 0; j < dim; j++) centers[c][j] = sums[c][j] / cnt[c];
    }
    return labels;
  }

  function kmedoids(D, k, iters = 20) {
    const n = D.length;
    k = Math.max(1, Math.min(k, n));
    let medoids = Array.from({ length: k }, (_, i) => Math.floor((i * n) / k));
    let labels = assignMedoids(D, medoids);

    for (let t = 0; t < iters; t++) {
      let improved = false;
      for (let m = 0; m < medoids.length; m++) {
        for (let cand = 0; cand < n; cand++) {
          if (medoids.includes(cand)) continue;
          const trial = medoids.slice();
          trial[m] = cand;
          const trialLabels = assignMedoids(D, trial);
          if (medoidCost(D, trialLabels, trial) < medoidCost(D, labels, medoids)) {
            medoids = trial;
            labels = trialLabels;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    return labels;
  }

  function assignMedoids(D, medoids) {
    const n = D.length;
    const labels = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let m = 0; m < medoids.length; m++) {
        const d = D[i][medoids[m]];
        if (d < bd) { bd = d; best = m; }
      }
      labels[i] = best;
    }
    return labels;
  }

  function medoidCost(D, labels, medoids) {
    let cost = 0;
    for (let i = 0; i < D.length; i++) cost += D[i][medoids[labels[i]]];
    return cost;
  }

  function dbscan(D, eps, minPts) {
    const n = D.length;
    const labels = new Array(n).fill(-99);
    let cid = 0;
    const neighbors = (i) => {
      const out = [];
      for (let j = 0; j < n; j++) if (D[i][j] <= eps) out.push(j);
      return out;
    };

    for (let i = 0; i < n; i++) {
      if (labels[i] !== -99) continue;
      const N = neighbors(i);
      if (N.length < minPts) { labels[i] = -1; continue; }
      labels[i] = cid;
      const seed = N.slice();
      while (seed.length) {
        const j = seed.pop();
        if (labels[j] === -1) labels[j] = cid;
        if (labels[j] !== -99) continue;
        labels[j] = cid;
        const Nj = neighbors(j);
        if (Nj.length >= minPts) seed.push(...Nj);
      }
      cid += 1;
    }
    return relabel(labels, true);
  }

  function labelPropagation(D, maxDist, iters = 20) {
    const n = D.length;
    const labels = Array.from({ length: n }, (_, i) => i);
    for (let t = 0; t < iters; t++) {
      let changed = false;
      for (let i = 0; i < n; i++) {
        const counts = new Map();
        for (let j = 0; j < n; j++) {
          if (i === j || D[i][j] > maxDist) continue;
          counts.set(labels[j], (counts.get(labels[j]) || 0) + 1);
        }
        let best = labels[i], bv = -1;
        for (const [lab, ct] of counts.entries()) if (ct > bv) { bv = ct; best = lab; }
        if (best !== labels[i]) { labels[i] = best; changed = true; }
      }
      if (!changed) break;
    }
    return relabel(labels);
  }

  function relabel(labels, keepNoise = false) {
    const map = new Map();
    let nxt = 0;
    return labels.map(l => {
      if (keepNoise && l < 0) return -1;
      if (!map.has(l)) map.set(l, nxt++);
      return map.get(l);
    });
  }

  function classicalMds(D, dim = 2) {
    const n = D.length;
    const D2 = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => D[i][j] * D[i][j]));
    const rowMean = new Float64Array(n);
    const colMean = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        rowMean[i] += D2[i][j];
        colMean[j] += D2[i][j];
        total += D2[i][j];
      }
    }
    for (let i = 0; i < n; i++) { rowMean[i] /= n; colMean[i] /= n; }
    total /= (n * n);

    const B = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i][j] = -0.5 * (D2[i][j] - rowMean[i] - colMean[j] + total);

    const eigvals = [];
    const eigvecs = [];
    let M = B.map(r => Float64Array.from(r));

    for (let c = 0; c < dim; c++) {
      let v = Float64Array.from({ length: n }, (_, i) => (i + c + 1) / (n + 1));
      for (let it = 0; it < 60; it++) {
        const nv = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          let sum = 0;
          for (let j = 0; j < n; j++) sum += M[i][j] * v[j];
          nv[i] = sum;
        }
        let norm = Math.sqrt(nv.reduce((a, b) => a + b * b, 0)) || 1;
        for (let i = 0; i < n; i++) v[i] = nv[i] / norm;
      }
      let lambda = 0;
      for (let i = 0; i < n; i++) {
        let mv = 0;
        for (let j = 0; j < n; j++) mv += M[i][j] * v[j];
        lambda += v[i] * mv;
      }
      eigvals.push(Math.max(0, lambda));
      eigvecs.push(Float64Array.from(v));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] -= lambda * v[i] * v[j];
    }

    const coords = Array.from({ length: n }, () => new Float64Array(dim));
    for (let c = 0; c < dim; c++) {
      const scale = Math.sqrt(Math.max(eigvals[c], 0));
      for (let i = 0; i < n; i++) coords[i][c] = eigvecs[c][i] * scale;
    }
    return coords;
  }


  function silhouetteApprox(D, labels) {
    const n = labels.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const own = labels[i];
      let aSum = 0, aCt = 0;
      const bMap = new Map();
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = D[i][j];
        if (labels[j] === own) { aSum += d; aCt += 1; }
        else {
          const z = bMap.get(labels[j]) || [0,0];
          z[0] += d; z[1] += 1; bMap.set(labels[j], z);
        }
      }
      const a = aCt ? aSum / aCt : 0;
      let b = Infinity;
      for (const [s, c] of bMap.values()) b = Math.min(b, s / c);
      if (!Number.isFinite(b)) b = a;
      const denom = Math.max(a, b, 1e-9);
      sum += (b - a) / denom;
    }
    return sum / n;
  }

  function runCurrentConfig() {
    const rows = state.rawRows.filter(matchesMorphFilters);
    const bookCol = el.clusterBookCol.value;
    const tokenCol = el.clusterTokenCol.value;
    if (!rows.length || !bookCol || !tokenCol) return null;

    const mode = el.clusterFeatureMode.value;
    const ngramN = Math.max(2, Number.parseInt(el.clusterNgram.value, 10) || 2);
    const vectorModel = el.clusterVectorModel.value;
    const metric = el.clusterDistance.value;
    const method = el.clusterMethod.value;
    const k = Math.max(2, Number.parseInt(el.clusterK.value, 10) || 6);
    const threshold = Math.min(0.99, Math.max(0.01, Number.parseFloat(el.clusterThreshold.value) || 0.25));
    const eps = Math.max(0.01, Number.parseFloat(el.clusterEps.value) || 0.65);
    const minPts = Math.max(1, Number.parseInt(el.clusterMinPts.value, 10) || 2);
    const topFeatures = Math.max(3, Number.parseInt(el.clusterTopFeatures.value, 10) || 10);
    const excludeFunction = el.clusterExcludeFunction?.value === "on";
    const minDf = Math.min(1, Math.max(0, Number.parseFloat(el.clusterMinDocFreq?.value) || 0));
    const maxDfRaw = Math.min(1, Math.max(0, Number.parseFloat(el.clusterMaxDocFreq?.value) || 1));
    const maxDf = Math.max(minDf, maxDfRaw);

    const featureByBook = buildFeatures(rows, bookCol, tokenCol, mode, ngramN, { excludeFunction, minDf, maxDf });
    const { books, X, terms } = vectorize(featureByBook, vectorModel);
    if (books.length < 2) return null;
    const D = pairwiseDistance(X, metric);
    const labels = runMethod(method, D, X, { k, threshold, eps, minPts });
    const coords = classicalMds(D, 2);
    return { books, labels, D, coords, X, terms, featureByBook, threshold, method, metric, vectorModel, mode, ngramN, topFeatures, k, eps, minPts, excludeFunction, minDf, maxDf, rowsUsed: rows.length };
  }


  function renderAll() {
    const { books, labels, D, coords, X, terms, threshold, method, metric, vectorModel, mode, ngramN, topFeatures, excludeFunction, minDf, maxDf, rowsUsed } = state.run;
    const kMap = new Map();
    labels.forEach((lab, i) => {
      if (!kMap.has(lab)) kMap.set(lab, []);
      kMap.get(lab).push(i);
    });
    const clusters = [...kMap.entries()].sort((a, b) => b[1].length - a[1].length);

    const noiseCt = labels.filter(x => x < 0).length;
    el.clusterSummary.innerHTML = `<div class="analysis-grid">
      <div class="analysis-card"><span class="label">Books</span><div class="value">${books.length}</div></div>
      <div class="analysis-card"><span class="label">Clusters</span><div class="value">${clusters.length}</div></div>
      <div class="analysis-card"><span class="label">Method</span><div class="value">${esc(method)}</div></div>
      <div class="analysis-card"><span class="label">Distance / Model</span><div class="value">${esc(metric)} / ${esc(vectorModel)}</div></div>
    </div>
    <div class="small-muted" style="margin-top:.5rem;">Features: ${esc(mode === "collocation" ? `${ngramN}-gram collocations` : "direct tokens")}. Noise points: ${noiseCt}. Stylometry filters: ${excludeFunction ? "exclude function words" : "function words included"}; DF ratio ${minDf.toFixed(2)}–${maxDf.toFixed(2)}. Morph rows used: ${rowsUsed}.</div>`;

    renderMds(coords, books, labels);
    renderBars(clusters, books, labels);
    renderHeatmap(D, books, labels);
    renderNetwork(D, books, labels, threshold);
    renderFeatureSignatures(clusters, X, terms, books, labels, topFeatures);
    renderSimilarityDistribution(D);
    setupZoomButtons();
  }

  function renderMds(coords, books, labels) {
    const w = 760, h = 420, pad = 36;
    const xs = coords.map(c => c[0]);
    const ys = coords.map(c => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (x) => pad + ((x - minX) / ((maxX - minX) || 1)) * (w - pad * 2);
    const sy = (y) => h - pad - ((y - minY) / ((maxY - minY) || 1)) * (h - pad * 2);
    let html = `<rect x="0" y="0" width="${w}" height="${h}" fill="#f8fafc" rx="12" />`;
    for (let i = 0; i < books.length; i++) {
      const x = sx(coords[i][0]), y = sy(coords[i][1]);
      const c = colorFor(labels[i] < 0 ? 10 : labels[i]);
      html += `<circle cx="${x}" cy="${y}" r="7" fill="${c}" opacity="0.95" />`;
      html += `<text x="${x + 9}" y="${y - 8}" font-size="11" fill="#0f172a">${esc(books[i])}</text>`;
    }
    el.clusterMdsSvg.innerHTML = html;
  }

  function renderBars(clusters, books) {
    const max = Math.max(...clusters.map(c => c[1].length), 1);
    let html = "";
    for (const [cid, members] of clusters) {
      const width = Math.round((members.length / max) * 100);
      html += `<div class="viz-item"><div class="viz-row"><span class="viz-label">Cluster ${cid}</span><div class="viz-bar" style="width:${Math.max(width, 4)}%; background:linear-gradient(90deg, ${colorFor(cid)}, #38bdf8);"></div><span class="viz-value">${members.length}</span></div></div>`;
    }
    el.clusterSizeBars.innerHTML = html || `<div class="small-muted">No cluster bars to show.</div>`;
  }

  function renderHeatmap(D, books, labels) {
    const n = books.length;
    let html = `<div class="table-wrap"><table class="mini-table"><thead><tr><th>Book</th>`;
    for (const b of books) html += `<th>${esc(b)}</th>`;
    html += `</tr></thead><tbody>`;
    for (let i = 0; i < n; i++) {
      html += `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${colorFor(labels[i])};margin-right:.35rem;"></span>${esc(books[i])}</td>`;
      for (let j = 0; j < n; j++) {
        const sim = 1 - D[i][j];
        const alpha = Math.max(0, Math.min(1, sim));
        html += `<td style="background:rgba(79,70,229,${alpha*0.45});">${sim.toFixed(2)}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    el.clusterHeatmap.innerHTML = html;
  }

  function renderNetwork(D, books, labels, threshold) {
    const w = 760, h = 420, cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;
    const n = books.length;
    const pts = Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
    let html = `<rect x="0" y="0" width="${w}" height="${h}" fill="#f8fafc" rx="12" />`;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = 1 - D[i][j];
        if (sim < threshold) continue;
        html += `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[j][0]}" y2="${pts[j][1]}" stroke="#94a3b8" stroke-opacity="${Math.max(0.2, sim)}" stroke-width="${1 + sim * 2.2}" />`;
      }
    }
    for (let i = 0; i < n; i++) {
      html += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="8" fill="${colorFor(labels[i])}" />`;
      html += `<text x="${pts[i][0] + 10}" y="${pts[i][1] - 6}" font-size="11" fill="#0f172a">${esc(books[i])}</text>`;
    }
    el.clusterNetworkSvg.innerHTML = html;
  }

  function renderFeatureSignatures(clusters, X, terms, books, labels, topFeatures) {
    const rows = [];
    for (const [cid] of clusters) {
      const members = labels.map((l, i) => [l, i]).filter(([l]) => l === cid).map(([, i]) => i);
      if (!members.length) continue;
      const scores = new Float64Array(terms.length);
      for (const m of members) for (let j = 0; j < terms.length; j++) scores[j] += X[m][j];
      const top = Array.from(scores, (v, idx) => [idx, v])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topFeatures)
        .map(([idx, v]) => `${terms[idx]} (${v.toFixed(2)})`);
      rows.push({ cid, members: members.map(i => books[i]), top });
    }

    let html = `<table class="mini-table"><thead><tr><th>Cluster</th><th>Books</th><th>Top features</th></tr></thead><tbody>`;
    for (const r of rows) {
      html += `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${colorFor(r.cid)};margin-right:.35rem;"></span>${r.cid}</td><td>${esc(r.members.join(", "))}</td><td>${esc(r.top.join(", "))}</td></tr>`;
    }
    html += `</tbody></table>`;
    el.clusterFeatures.innerHTML = html;
  }



  function renderSimilarityDistribution(D) {
    if (!el.clusterSimilarityDist) return;
    const sims = [];
    for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) sims.push(1 - D[i][j]);
    if (!sims.length) {
      el.clusterSimilarityDist.innerHTML = `<div class="small-muted">Not enough books for distribution.</div>`;
      return;
    }
    const bins = 10;
    const counts = new Array(bins).fill(0);
    for (const s of sims) {
      const clamped = Math.max(0, Math.min(0.9999, s));
      const idx = Math.floor(clamped * bins);
      counts[idx] += 1;
    }
    const max = Math.max(...counts, 1);
    let html = '';
    for (let i = 0; i < bins; i++) {
      const lo = (i / bins).toFixed(1);
      const hi = ((i + 1) / bins).toFixed(1);
      const w = Math.round((counts[i] / max) * 100);
      html += `<div class="viz-item"><div class="viz-row"><span class="viz-label">${lo}–${hi}</span><div class="viz-bar" style="width:${Math.max(3, w)}%"></div><span class="viz-value">${counts[i]}</span></div></div>`;
    }
    el.clusterSimilarityDist.innerHTML = html;
  }

  function runStressTest() {
    const methods = ["threshold","single","complete","average","ward","kmeans","kmedoids","dbscan","labelprop","mds_kmeans"];
    const keep = el.clusterMethod.value;
    const rows = [];
    for (const m of methods) {
      el.clusterMethod.value = m;
      const t0 = performance.now();
      const out = runCurrentConfig();
      const ms = performance.now() - t0;
      if (!out) continue;
      rows.push({ method: m, ms, clusters: new Set(out.labels).size, sil: silhouetteApprox(out.D, out.labels) });
    }
    el.clusterMethod.value = keep;
    if (!el.clusterStressOut) return;
    if (!rows.length) {
      el.clusterStressOut.innerHTML = `<div class="small-muted">Stress test unavailable for current setup.</div>`;
      return;
    }
    let html = `<table class="mini-table"><thead><tr><th>Method</th><th>Runtime (ms)</th><th>Clusters</th><th>Silhouette</th></tr></thead><tbody>`;
    for (const r of rows.sort((a,b)=>a.ms-b.ms)) html += `<tr><td>${esc(r.method)}</td><td>${r.ms.toFixed(2)}</td><td>${r.clusters}</td><td>${r.sil.toFixed(3)}</td></tr>`;
    html += `</tbody></table>`;
    el.clusterStressOut.innerHTML = html;
  }

  function run() {
    const out = runCurrentConfig();
    if (!out) {
      el.clusterSummary.innerHTML = `<div class="small-muted">Need at least 2 books with data for clustering.</div>`;
      return;
    }
    state.run = out;
    renderAll();
  }

  function runBenchmark() {
    const methods = ["threshold","single","complete","average","ward","kmeans","kmedoids","dbscan","labelprop","mds_kmeans"];
    const keep = el.clusterMethod.value;
    const rows = [];
    for (const m of methods) {
      el.clusterMethod.value = m;
      const out = runCurrentConfig();
      if (!out) continue;
      rows.push({ method: m, clusters: new Set(out.labels).size, silhouette: silhouetteApprox(out.D, out.labels) });
    }
    el.clusterMethod.value = keep;
    if (!rows.length) {
      el.clusterBenchmark.innerHTML = `<div class="small-muted">Benchmark unavailable for current settings.</div>`;
      return;
    }
    let html = `<table class="mini-table"><thead><tr><th>Method</th><th>Clusters</th><th>Silhouette (approx)</th></tr></thead><tbody>`;
    for (const r of rows.sort((a,b)=>b.silhouette-a.silhouette)) html += `<tr><td>${esc(r.method)}</td><td>${r.clusters}</td><td>${r.silhouette.toFixed(3)}</td></tr>`;
    html += `</tbody></table>`;
    el.clusterBenchmark.innerHTML = html;
  }

  function exportAssignments() {
    if (!state.run?.books?.length) return;
    const { books, labels } = state.run;
    const lines = ['book,cluster', ...books.map((b,i)=>`"${String(b).replace(/"/g,'""')}","${labels[i]}"`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cluster_assignments.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }


  function setupZoomButtons() {
    const containers = document.querySelectorAll(".viz-wrap, #clusterSummary");
    for (const c of containers) {
      if (c.querySelector(":scope > .zoom-btn")) continue;
      c.classList.add("zoomable");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "zoom-btn";
      b.textContent = "⤢ Full view";
      b.addEventListener("click", () => openZoom(c));
      c.prepend(b);
    }
  }

  function openZoom(container) {
    let modal = document.getElementById("zoomModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "zoomModal";
      modal.className = "zoom-modal";
      modal.innerHTML = `<div class="zoom-backdrop"></div><div class="zoom-dialog"><div class="zoom-head"><strong>Expanded graphic</strong><button type="button" class="btn btn-warn zoom-close">Close</button></div><div class="zoom-body"></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector(".zoom-backdrop").addEventListener("click", () => modal.classList.remove("open"));
      modal.querySelector(".zoom-close").addEventListener("click", () => modal.classList.remove("open"));
    }
    const body = modal.querySelector(".zoom-body");
    body.innerHTML = "";
    const clone = container.cloneNode(true);
    const btn = clone.querySelector(".zoom-btn");
    if (btn) btn.remove();
    body.appendChild(clone);
    modal.classList.add("open");
  }

  async function fetchBundledCsv(path) {
    const variants = [
      path,
      new URL(path, document.baseURI).toString(),
      path.startsWith('/') ? path : `/${path}`,
      path.startsWith('./') ? path.slice(2) : `./${path}`
    ];
    let lastErr = null;
    for (const candidate of [...new Set(variants)]) {
      try {
        const res = await fetch(candidate, { cache: "no-store" });
        if (res.ok) return { text: await res.text(), url: candidate };
        lastErr = new Error(`HTTP ${res.status} @ ${candidate}`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error(`Could not load bundled csv at ${path}`);
  }

  async function loadBundled(autoRun = false) {
    const choice = el.clusterBundledDataset.value;
    const url = BUNDLED_DATASET_URLS[choice];
    if (!url) return;
    try {
      const loaded = await fetchBundledCsv(url);
      parseCsv(loaded.text, loaded.url);
      if (autoRun) setTimeout(() => { if (!el.btnRunCluster.disabled) run(); }, 0);
    } catch (err) {
      setStatus(`Could not load bundled dataset ${url}: ${String(err)}`);
    }
  }

  el.clusterCsvFile?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then(txt => parseCsv(txt, f.name));
  });
  el.btnClusterLoadBundled.addEventListener("click", () => loadBundled(false));
  el.btnClusterLoadShared.addEventListener("click", loadSharedDataset);
  [
    el.clusterBookCol, el.clusterTokenCol, el.clusterFeatureMode, el.clusterMethod,
    el.clusterExcludeFunction, el.clusterMinDocFreq, el.clusterMaxDocFreq,
  ].filter(Boolean).forEach(x => x.addEventListener("change", syncControlStates));
  [
    el.clusterPosFilter, el.clusterPersonFilter, el.clusterNumberFilter, el.clusterTenseFilter,
    el.clusterMoodFilter, el.clusterVoiceFilter, el.clusterGenderFilter, el.clusterCaseFilter, el.clusterDegreeFilter
  ].filter(Boolean).forEach(x => x.addEventListener("change", syncControlStates));
  el.btnRunCluster.addEventListener("click", run);
  el.btnClusterBenchmark.addEventListener("click", runBenchmark);
  el.btnClusterStress?.addEventListener("click", runStressTest);
  el.btnClusterExport.addEventListener("click", exportAssignments);
  window.addEventListener("focus", refreshSharedSourceSelect);

  refreshSharedSourceSelect();
  syncControlStates();
  resetOutputs();
  setupZoomButtons();
  loadBundled(true);
})();
