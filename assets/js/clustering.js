/* =====================================================================
 * MOPSOS — Stylometry (SQL + D3)
 * ---------------------------------------------------------------------
 * Feature matrices are built straight from the shared SQLite corpus.
 * Every numeric stage operates on plain 2-D arrays:
 *   X : Float64Array[]  (document × feature)
 *   D : Float64Array[]  (document × document distance matrix)
 * so the pipeline is matrix-in / matrix-out. All charts use MopsosChart.
 * Depends on: window.MopsosSQL, window.MopsosUI, window.MopsosChart.
 * ===================================================================== */
(() => {
  "use strict";

  // ---------- helpers ----------
  function byId(id) { return document.getElementById(id); }
  function normStr(x) { return String(x ?? "").trim(); }
  function esc(v) { return window.MopsosUI ? window.MopsosUI.esc(v) : String(v ?? ""); }
  function colorFor(i) { return window.MopsosChart.color(i < 0 ? 10 : i); }
  function sqlStr(v) { return "'" + String(v).replace(/'/g, "''") + "'"; }
  function sum(iter) { let s = 0; for (const v of iter) s += v; return s; }

  const SUBMENU_FIELDS = new Set(["pos", "number", "case"]);
  const MAX_DOCS = 60; // hard cap: pairwise distance + agglomerative are O(n^2)/O(n^3)

  const state = { run: null, base: null };

  const el = {};
  function grab() {
    [
      "clusterLoadStatus", "clusterByVar", "clusterBySub", "clusterBySubRow", "clusterBySubLabel",
      "clusterLimitVar", "clusterLimitVal", "clusterLimitValRow", "clusterLimitValLabel",
      "clusterTokenCol", "clusterFeatureMode", "clusterNgram", "clusterVectorModel", "clusterDistance",
      "clusterExcludeFunction", "clusterMinDocFreq", "clusterMaxDocFreq",
      "clusterMethod", "clusterK", "clusterThreshold", "clusterEps", "clusterMinPts", "clusterTopFeatures",
      "btnRunCluster", "btnClusterBenchmark", "btnClusterStress", "btnClusterExport",
      "clusterSql", "clusterStressOut", "clusterSummary",
      "clusterMds", "clusterSizeBars", "clusterHeatmap", "clusterNetwork",
      "clusterSimilarityDist", "clusterFeatures", "clusterBenchmark"
    ].forEach((id) => { el[id] = byId(id); });
  }
  function setStatus(msg) { if (el.clusterLoadStatus) el.clusterLoadStatus.textContent = msg; }

  // ---------- Greek / function words ----------
  const FUNCTION_WORDS = new Set([
    "και","δε","τε","γαρ","γε","αρα","ρα","αν","κε","κεν","περ","τοι","που","νυ","μεν","ουν","η","ου","μη","ει","ως",
    "ο","το","οι","αι","τα","τον","την","των","τοις","ταις","τις","τι"
  ]);
  function normalizeGreek(x) {
    return String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f\u0345]/g, "").toLowerCase().replace(/\u03c2/g, "\u03c3").replace(/[^\u03b1-\u03c9]/g, "");
  }
  function termIsFunctionWord(term, mode) {
    if (mode === "collocation") {
      const parts = String(term).split(" \u2420 ").map(normalizeGreek).filter(Boolean);
      return parts.length ? parts.every((p) => FUNCTION_WORDS.has(p)) : false;
    }
    return FUNCTION_WORDS.has(normalizeGreek(term));
  }

  // =====================================================================
  //  CORE MATH  (operates purely on 2-D arrays — unchanged, reusable)
  // =====================================================================
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
        for (let i = 0; i <= tokens.length - n; i++) feats.push(tokens.slice(i, i + n).join(" \u2420 "));
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
    const V = vocab.size, N = books.length;
    const X = books.map(() => new Float64Array(V));
    const docLengths = new Float64Array(N);
    const df = new Float64Array(V);
    for (let i = 0; i < N; i++) {
      const freq = featureByBook.get(books[i]);
      for (const [term, count] of freq.entries()) {
        const j = vocab.get(term);
        X[i][j] = count; docLengths[i] += count;
      }
      for (let j = 0; j < V; j++) if (X[i][j] > 0) df[j] += 1;
    }
    if (model === "binary") for (let i = 0; i < N; i++) for (let j = 0; j < V; j++) X[i][j] = X[i][j] > 0 ? 1 : 0;
    if (model === "tfidf") {
      for (let j = 0; j < V; j++) { const idf = Math.log((N + 1) / (1 + df[j])) + 1; for (let i = 0; i < N; i++) X[i][j] *= idf; }
    }
    if (model === "bm25" || model === "bm25plus") {
      const avgdl = docLengths.reduce((a, b) => a + b, 0) / Math.max(1, N);
      const k1 = 1.2, b = 0.75, delta = model === "bm25plus" ? 1.0 : 0.0;
      for (let j = 0; j < V; j++) {
        const idf = Math.log(1 + ((N - df[j] + 0.5) / (df[j] + 0.5)));
        for (let i = 0; i < N; i++) {
          const tf = X[i][j]; if (!tf) continue;
          const denom = tf + k1 * (1 - b + b * (docLengths[i] / Math.max(avgdl, 1e-9)));
          X[i][j] = idf * (((tf * (k1 + 1)) / denom) + delta);
        }
      }
    }
    const terms = [...vocab.entries()].sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    return { books, X, terms };
  }

  function pairwiseDistance(X, metric) {
    const n = X.length;
    const D = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = distance(X[i], X[j], metric); D[i][j] = d; D[j][i] = d; }
    return D;
  }
  function distance(a, b, metric) {
    let dot = 0, na = 0, nb = 0, man = 0, eu = 0, inter = 0, union = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i], bi = b[i];
      dot += ai * bi; na += ai * ai; nb += bi * bi;
      const diff = ai - bi; man += Math.abs(diff); eu += diff * diff;
      const aPos = ai > 0, bPos = bi > 0;
      if (aPos || bPos) union += 1; if (aPos && bPos) inter += 1;
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
    if (method === "mds_kmeans") { const mds = classicalMds(D, 2); return kmeans(mds, params.k, 20); }
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
      if (linkage === "ward") { let sum = 0, ct = 0; for (const i of a) for (const j of b) { sum += D[i][j] * D[i][j]; ct += 1; } return sum / Math.max(1, ct); }
      if (linkage === "single") { let best = Infinity; for (const i of a) for (const j of b) if (D[i][j] < best) best = D[i][j]; return best; }
      if (linkage === "complete") { let worst = 0; for (const i of a) for (const j of b) if (D[i][j] > worst) worst = D[i][j]; return worst; }
      let sum = 0, ct = 0; for (const i of a) for (const j of b) { sum += D[i][j]; ct += 1; } return sum / Math.max(1, ct);
    };
    while (clusters.length > Math.max(1, Math.min(k, n))) {
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) { const d = distClusters(clusters[i], clusters[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
      clusters[bi] = clusters[bi].concat(clusters[bj]); clusters.splice(bj, 1);
    }
    const labels = new Array(n).fill(0);
    clusters.forEach((c, idx) => c.forEach((i) => { labels[i] = idx; }));
    return labels;
  }
  function kmeans(X, k, iters = 20) {
    const n = X.length, dim = X[0]?.length || 0;
    k = Math.max(1, Math.min(k, n));
    const centers = [];
    for (let i = 0; i < k; i++) centers.push(Float64Array.from(X[Math.floor((i * n) / k)]));
    const labels = new Array(n).fill(0);
    for (let t = 0; t < iters; t++) {
      for (let i = 0; i < n; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) { let d = 0; for (let j = 0; j < dim; j++) { const diff = X[i][j] - centers[c][j]; d += diff * diff; } if (d < bd) { bd = d; best = c; } }
        labels[i] = best;
      }
      const sums = Array.from({ length: k }, () => new Float64Array(dim));
      const cnt = new Array(k).fill(0);
      for (let i = 0; i < n; i++) { const c = labels[i]; cnt[c] += 1; for (let j = 0; j < dim; j++) sums[c][j] += X[i][j]; }
      for (let c = 0; c < k; c++) if (cnt[c] > 0) for (let j = 0; j < dim; j++) centers[c][j] = sums[c][j] / cnt[c];
    }
    return labels;
  }
  function kmedoids(D, k, iters = 20) {
    const n = D.length; k = Math.max(1, Math.min(k, n));
    let medoids = Array.from({ length: k }, (_, i) => Math.floor((i * n) / k));
    let labels = assignMedoids(D, medoids);
    for (let t = 0; t < iters; t++) {
      let improved = false;
      for (let m = 0; m < medoids.length; m++) {
        for (let cand = 0; cand < n; cand++) {
          if (medoids.includes(cand)) continue;
          const trial = medoids.slice(); trial[m] = cand;
          const trialLabels = assignMedoids(D, trial);
          if (medoidCost(D, trialLabels, trial) < medoidCost(D, labels, medoids)) { medoids = trial; labels = trialLabels; improved = true; }
        }
      }
      if (!improved) break;
    }
    return labels;
  }
  function assignMedoids(D, medoids) {
    const n = D.length, labels = new Array(n).fill(0);
    for (let i = 0; i < n; i++) { let best = 0, bd = Infinity; for (let m = 0; m < medoids.length; m++) { const d = D[i][medoids[m]]; if (d < bd) { bd = d; best = m; } } labels[i] = best; }
    return labels;
  }
  function medoidCost(D, labels, medoids) { let cost = 0; for (let i = 0; i < D.length; i++) cost += D[i][medoids[labels[i]]]; return cost; }
  function dbscan(D, eps, minPts) {
    const n = D.length, labels = new Array(n).fill(-99); let cid = 0;
    const neighbors = (i) => { const out = []; for (let j = 0; j < n; j++) if (D[i][j] <= eps) out.push(j); return out; };
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
    const n = D.length, labels = Array.from({ length: n }, (_, i) => i);
    for (let t = 0; t < iters; t++) {
      let changed = false;
      for (let i = 0; i < n; i++) {
        const counts = new Map();
        for (let j = 0; j < n; j++) { if (i === j || D[i][j] > maxDist) continue; counts.set(labels[j], (counts.get(labels[j]) || 0) + 1); }
        let best = labels[i], bv = -1;
        for (const [lab, ct] of counts.entries()) if (ct > bv) { bv = ct; best = lab; }
        if (best !== labels[i]) { labels[i] = best; changed = true; }
      }
      if (!changed) break;
    }
    return relabel(labels);
  }
  function relabel(labels, keepNoise = false) {
    const map = new Map(); let nxt = 0;
    return labels.map((l) => { if (keepNoise && l < 0) return -1; if (!map.has(l)) map.set(l, nxt++); return map.get(l); });
  }
  function classicalMds(D, dim = 2) {
    const n = D.length;
    const D2 = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => D[i][j] * D[i][j]));
    const rowMean = new Float64Array(n), colMean = new Float64Array(n); let total = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { rowMean[i] += D2[i][j]; colMean[j] += D2[i][j]; total += D2[i][j]; }
    for (let i = 0; i < n; i++) { rowMean[i] /= n; colMean[i] /= n; }
    total /= (n * n);
    const B = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i][j] = -0.5 * (D2[i][j] - rowMean[i] - colMean[j] + total);
    const eigvals = [], eigvecs = [];
    let M = B.map((r) => Float64Array.from(r));
    for (let c = 0; c < dim; c++) {
      let v = Float64Array.from({ length: n }, (_, i) => (i + c + 1) / (n + 1));
      for (let it = 0; it < 60; it++) {
        const nv = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += M[i][j] * v[j]; nv[i] = s; }
        let norm = Math.sqrt(nv.reduce((a, b) => a + b * b, 0)) || 1;
        for (let i = 0; i < n; i++) v[i] = nv[i] / norm;
      }
      let lambda = 0;
      for (let i = 0; i < n; i++) { let mv = 0; for (let j = 0; j < n; j++) mv += M[i][j] * v[j]; lambda += v[i] * mv; }
      eigvals.push(Math.max(0, lambda)); eigvecs.push(Float64Array.from(v));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] -= lambda * v[i] * v[j];
    }
    const coords = Array.from({ length: n }, () => new Float64Array(dim));
    for (let c = 0; c < dim; c++) { const scale = Math.sqrt(Math.max(eigvals[c], 0)); for (let i = 0; i < n; i++) coords[i][c] = eigvecs[c][i] * scale; }
    return coords;
  }
  function silhouetteApprox(D, labels) {
    const n = labels.length; if (n < 3) return 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const own = labels[i]; let aSum = 0, aCt = 0; const bMap = new Map();
      for (let j = 0; j < n; j++) {
        if (i === j) continue; const d = D[i][j];
        if (labels[j] === own) { aSum += d; aCt += 1; }
        else { const z = bMap.get(labels[j]) || [0, 0]; z[0] += d; z[1] += 1; bMap.set(labels[j], z); }
      }
      const a = aCt ? aSum / aCt : 0;
      let b = Infinity;
      for (const [s, c] of bMap.values()) b = Math.min(b, s / c);
      if (!Number.isFinite(b)) b = a;
      total += (b - a) / Math.max(a, b, 1e-9);
    }
    return total / n;
  }

  // =====================================================================
  //  CONFIG  →  feature matrix  (SQL driven)
  // =====================================================================
  function readConfig() {
    const primary = el.clusterByVar.value;
    const sub = el.clusterBySub ? el.clusterBySub.value : "";
    let groupCol = primary, hardFilter = null;
    if (SUBMENU_FIELDS.has(primary) && sub) { groupCol = "work"; hardFilter = { col: primary, val: sub }; }

    const filters = [];
    if (hardFilter) filters.push(hardFilter);
    const limitVar = el.clusterLimitVar.value;
    const limitVal = el.clusterLimitVal ? el.clusterLimitVal.value : "";
    if (limitVar && limitVal) filters.push({ col: limitVar, val: limitVal });

    const tokenCol = el.clusterTokenCol.value;
    const mode = el.clusterFeatureMode.value;
    const ngramN = Math.max(2, parseInt(el.clusterNgram.value, 10) || 2);
    const vectorModel = el.clusterVectorModel.value;
    const metric = el.clusterDistance.value;
    const method = el.clusterMethod.value;
    const k = Math.max(2, parseInt(el.clusterK.value, 10) || 6);
    const threshold = Math.min(0.99, Math.max(0.01, parseFloat(el.clusterThreshold.value) || 0.25));
    const eps = Math.max(0.01, parseFloat(el.clusterEps.value) || 0.65);
    const minPts = Math.max(1, parseInt(el.clusterMinPts.value, 10) || 2);
    const topFeatures = Math.max(3, parseInt(el.clusterTopFeatures.value, 10) || 10);
    const excludeFunction = el.clusterExcludeFunction.value === "on";
    const minDf = Math.min(1, Math.max(0, parseFloat(el.clusterMinDocFreq.value) || 0));
    const maxDf = Math.max(minDf, Math.min(1, Math.max(0, parseFloat(el.clusterMaxDocFreq.value) || 1)));

    return { primary, sub, groupCol, filters, tokenCol, mode, ngramN, vectorModel, metric, method, k, threshold, eps, minPts, topFeatures, excludeFunction, minDf, maxDf };
  }

  function buildSql(cfg) {
    const SQL = window.MopsosSQL;
    const g = SQL.quoteId(cfg.groupCol), t = SQL.quoteId(cfg.tokenCol);
    const where = [g + " IS NOT NULL", g + " <> ''", t + " IS NOT NULL", t + " <> ''"];
    cfg.filters.forEach((f) => where.push(SQL.quoteId(f.col) + " = " + sqlStr(f.val)));
    let sql = "SELECT " + g + " AS grp, " + t + " AS tok FROM " + SQL.quoteId(SQL.table) + " WHERE " + where.join(" AND ");
    if (cfg.mode === "collocation") sql += " ORDER BY sentence_id, id";
    return sql + ";";
  }

  // Humanise a group code for display (pos/number/case/etc. -> readable label).
  function displayName(field, code) {
    if (["pos", "person", "number", "tense", "mood", "voice", "gender", "case", "degree"].indexOf(field) >= 0) {
      return window.MopsosUI.label(field, code);
    }
    return String(code);
  }

  // Build everything up to (but not including) the clustering method.
  function computeBase(cfg) {
    const sql = buildSql(cfg);
    if (el.clusterSql) el.clusterSql.textContent = sql;
    let rows;
    try { rows = window.MopsosSQL.objects(sql); }
    catch (e) { return { error: "SQL error: " + e.message }; }
    if (!rows.length) return { error: "Query returned no rows for this configuration." };

    let featureByBook = buildFeatures(rows, "grp", "tok", cfg.mode, cfg.ngramN, { excludeFunction: cfg.excludeFunction, minDf: cfg.minDf, maxDf: cfg.maxDf });

    // hard cap on number of documents (keep the largest by token mass)
    let cappedNote = "";
    let keys = [...featureByBook.keys()];
    const origN = keys.length;
    if (origN > MAX_DOCS) {
      const kept = keys.map((b) => [b, sum(featureByBook.get(b).values())])
        .sort((a, b) => b[1] - a[1]).slice(0, MAX_DOCS).map((x) => x[0]);
      const next = new Map(); kept.forEach((b) => next.set(b, featureByBook.get(b)));
      featureByBook = next;
      cappedNote = "Showing the " + MAX_DOCS + " largest units (of " + origN + " total).";
    }

    const { books, X, terms } = vectorize(featureByBook, cfg.vectorModel);
    if (books.length < 2) return { error: "Need at least 2 units with data to cluster. Try a broader selection." };
    const D = pairwiseDistance(X, cfg.metric);
    const coords = classicalMds(D, 2);
    const displayBooks = books.map((b) => displayName(cfg.groupCol, b));
    return { cfg, books, displayBooks, X, terms, D, coords, featureByBook, cappedNote, rowsUsed: rows.length };
  }

  function getBase(cfg, force) {
    if (!force && state.base && sameCfgKey(state.base.cfg, cfg)) return state.base;
    const base = computeBase(cfg);
    if (!base.error) state.base = base;
    return base;
  }
  function sameCfgKey(a, b) {
    return a && b &&
      a.groupCol === b.groupCol && JSON.stringify(a.filters) === JSON.stringify(b.filters) &&
      a.tokenCol === b.tokenCol && a.mode === b.mode && a.ngramN === b.ngramN &&
      a.vectorModel === b.vectorModel && a.metric === b.metric &&
      a.excludeFunction === b.excludeFunction && a.minDf === b.minDf && a.maxDf === b.maxDf;
  }

  // =====================================================================
  //  RUN + RENDER
  // =====================================================================
  var CLUSTER_STATE_IDS = ["clusterByVar", "clusterBySub", "clusterLimitVar", "clusterLimitVal",
    "clusterTokenCol", "clusterFeatureMode", "clusterNgram", "clusterVectorModel", "clusterDistance",
    "clusterExcludeFunction", "clusterMinDocFreq", "clusterMaxDocFreq", "clusterMethod", "clusterK",
    "clusterThreshold", "clusterEps", "clusterMinPts", "clusterTopFeatures"];

  function saveClusterState() {
    if (!window.MopsosUI) return;
    var o = {};
    CLUSTER_STATE_IDS.forEach(function (id) {
      var e = el[id]; if (!e) return;
      o[id] = (e.type === "checkbox") ? e.checked : e.value;
    });
    window.MopsosUI.saveState("cluster", o);
  }

  function run() {
    saveClusterState();
    const cfg = readConfig();
    setStatus("Building features…");
    const base = getBase(cfg, true);
    if (base.error) { el.clusterSummary.innerHTML = '<div class="small-muted">' + esc(base.error) + "</div>"; setStatus(base.error); return; }
    const labels = runMethod(cfg.method, base.D, base.X, { k: cfg.k, threshold: cfg.threshold, eps: cfg.eps, minPts: cfg.minPts });
    state.run = Object.assign({}, base, { labels, cfg });
    setStatus("Clustered " + base.books.length + " units · " + base.rowsUsed.toLocaleString() + " tokens.");
    renderAll();
  }

  function renderAll() {
    const R = state.run; if (!R) return;
    const { books, displayBooks, labels, D, coords, X, terms, cfg, cappedNote, rowsUsed } = R;

    const kMap = new Map();
    labels.forEach((lab, i) => { if (!kMap.has(lab)) kMap.set(lab, []); kMap.get(lab).push(i); });
    const clusters = [...kMap.entries()].sort((a, b) => b[1].length - a[1].length);
    const noiseCt = labels.filter((x) => x < 0).length;

    el.clusterSummary.innerHTML =
      '<div class="analysis-grid">' +
      card("Units", books.length) + card("Clusters", clusters.length) +
      card("Method", esc(cfg.method)) + card("Distance / model", esc(cfg.metric) + " / " + esc(cfg.vectorModel)) +
      "</div>" +
      '<div class="small-muted" style="margin-top:.5rem;">Cluster by <strong>' + esc(cfg.primary) +
      (SUBMENU_FIELDS.has(cfg.primary) && cfg.sub ? " = " + esc(displayName(cfg.primary, cfg.sub)) : "") +
      "</strong>. Features: " + esc(cfg.mode === "collocation" ? cfg.ngramN + "-gram collocations" : "direct " + cfg.tokenCol + "s") +
      ". Noise points: " + noiseCt + ". Tokens used: " + rowsUsed.toLocaleString() +
      (cappedNote ? ". " + esc(cappedNote) : "") + "</div>";

    // MDS scatter
    window.MopsosChart.scatter(el.clusterMds,
      books.map((b, i) => ({ x: coords[i][0], y: coords[i][1], label: displayBooks[i], group: labels[i] })),
      { labels: books.length <= 40 });

    // cluster sizes
    window.MopsosChart.bars(el.clusterSizeBars,
      clusters.map(([cid, members]) => ({ label: "Cluster " + cid + (cid < 0 ? " (noise)" : ""), value: members.length, color: colorFor(cid) })),
      { valueLabel: "Units", labelWidth: 150 });

    // similarity heatmap
    const S = D.map((row) => Array.from(row, (d) => 1 - d));
    window.MopsosChart.heatmap(el.clusterHeatmap, S, displayBooks, displayBooks,
      { min: 0, max: 1, valueLabel: "Similarity", showValues: books.length <= 12, valueFormat: (v) => v.toFixed(2) });

    // similarity network
    const nodes = books.map((b, i) => ({ id: String(i), label: displayBooks[i], group: labels[i] }));
    const linksArr = [];
    for (let i = 0; i < books.length; i++) for (let j = i + 1; j < books.length; j++) {
      const sim = 1 - D[i][j];
      if (sim >= cfg.threshold) linksArr.push({ source: String(i), target: String(j), weight: sim });
    }
    window.MopsosChart.network(el.clusterNetwork, nodes, linksArr, {});

    // similarity distribution
    const sims = [];
    for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) sims.push(1 - D[i][j]);
    window.MopsosChart.histogram(el.clusterSimilarityDist, sims, { bins: 12, domain: [0, 1] });

    // feature signatures
    renderFeatureSignatures(clusters, X, terms, displayBooks, labels, cfg.topFeatures);
  }

  function card(label, value) {
    return '<div class="analysis-card"><div class="metric">' + value + '</div><div class="metric-label">' + esc(label) + "</div></div>";
  }

  function renderFeatureSignatures(clusters, X, terms, displayBooks, labels, topFeatures) {
    const values = [];
    for (const [cid, members] of clusters) {
      if (!members.length) continue;
      const scores = new Float64Array(terms.length);
      for (const m of members) for (let j = 0; j < terms.length; j++) scores[j] += X[m][j];
      const top = Array.from(scores, (v, idx) => [idx, v]).filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]).slice(0, topFeatures).map(([idx, v]) => terms[idx] + " (" + v.toFixed(2) + ")");
      values.push([
        '<span class="dot" style="background:' + colorFor(cid) + '"></span>' + cid,
        members.map((i) => displayBooks[i]).join(", "),
        top.join(", ")
      ]);
    }
    simpleTable(el.clusterFeatures, ["Cluster", "Units", "Top features"], values, true);
  }

  // small HTML table builder (allows trusted markup in first column for the colour dot)
  function simpleTable(container, headers, rows, rawFirstCol) {
    if (!container) return;
    if (!rows.length) { container.innerHTML = '<div class="small-muted" style="padding:.6rem;">No rows.</div>'; return; }
    let html = '<div class="table-wrap"><table class="preview"><thead><tr>';
    headers.forEach((h) => { html += "<th>" + esc(h) + "</th>"; });
    html += "</tr></thead><tbody>";
    rows.forEach((r) => {
      html += "<tr>";
      r.forEach((c, i) => { html += "<td>" + ((rawFirstCol && i === 0) ? c : esc(c)) + "</td>"; });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    container.innerHTML = html;
  }

  // ---------- benchmark / stress ----------
  const ALL_METHODS = ["threshold", "single", "complete", "average", "ward", "kmeans", "kmedoids", "dbscan", "labelprop", "mds_kmeans"];

  function runBenchmark() {
    const cfg = readConfig();
    const base = getBase(cfg, false);
    if (base.error) { el.clusterBenchmark.innerHTML = '<div class="small-muted">' + esc(base.error) + "</div>"; return; }
    const rows = [];
    for (const m of ALL_METHODS) {
      const labels = runMethod(m, base.D, base.X, { k: cfg.k, threshold: cfg.threshold, eps: cfg.eps, minPts: cfg.minPts });
      rows.push([m, new Set(labels).size, silhouetteApprox(base.D, labels).toFixed(3)]);
    }
    rows.sort((a, b) => b[2] - a[2]);
    simpleTable(el.clusterBenchmark, ["Method", "Clusters", "Silhouette (approx)"], rows, false);
  }

  function runStressTest() {
    const cfg = readConfig();
    const base = getBase(cfg, false);
    if (base.error) { el.clusterStressOut.innerHTML = '<div class="small-muted">' + esc(base.error) + "</div>"; return; }
    const rows = [];
    for (const m of ALL_METHODS) {
      const t0 = performance.now();
      const labels = runMethod(m, base.D, base.X, { k: cfg.k, threshold: cfg.threshold, eps: cfg.eps, minPts: cfg.minPts });
      const ms = performance.now() - t0;
      rows.push([m, ms.toFixed(2), new Set(labels).size, silhouetteApprox(base.D, labels).toFixed(3)]);
    }
    rows.sort((a, b) => a[1] - b[1]);
    simpleTable(el.clusterStressOut, ["Method", "Runtime (ms)", "Clusters", "Silhouette"], rows, false);
  }

  function exportAssignments() {
    if (!state.run || !state.run.books || !state.run.books.length) return;
    const { books, displayBooks, labels } = state.run;
    const lines = ["unit,display,cluster"].concat(books.map((b, i) =>
      '"' + String(b).replace(/"/g, '""') + '","' + String(displayBooks[i]).replace(/"/g, '""') + '","' + labels[i] + '"'));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cluster_assignments.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // =====================================================================
  //  SELECT POPULATION + SUBMENUS
  // =====================================================================
  function populateSub() {
    const primary = el.clusterByVar.value;
    if (!SUBMENU_FIELDS.has(primary)) { el.clusterBySubRow.hidden = true; return; }
    el.clusterBySubRow.hidden = false;
    el.clusterBySubLabel.textContent = "Which " + window.MopsosUI.fieldTitle(primary).toLowerCase() + "?";
    // head (value "") = cluster the categories themselves; a specific value restricts to it.
    window.MopsosUI.fillSelect(el.clusterBySub, window.MopsosSQL.distinct(primary),
      { field: primary, head: "All categories (cluster the categories)" });
    el.clusterBySub.value = "";
  }

  function populateLimitVal() {
    const v = el.clusterLimitVar.value;
    if (!v) { el.clusterLimitValRow.hidden = true; return; }
    el.clusterLimitValRow.hidden = false;
    el.clusterLimitValLabel.textContent = "Which " + window.MopsosUI.fieldTitle(v).toLowerCase() + "?";
    window.MopsosUI.fillSelect(el.clusterLimitVal, window.MopsosSQL.distinct(v),
      { field: v, head: "(no limit)" });
    el.clusterLimitVal.value = "";
  }

  // =====================================================================
  //  INIT
  // =====================================================================
  function init() {
    grab();
    if (!el.clusterByVar) return;

    el.clusterByVar.addEventListener("change", populateSub);
    el.clusterBySub.addEventListener("change", () => {});
    el.clusterLimitVar.addEventListener("change", populateLimitVal);

    el.btnRunCluster.addEventListener("click", run);
    el.btnClusterBenchmark.addEventListener("click", runBenchmark);
    el.btnClusterStress.addEventListener("click", runStressTest);
    el.btnClusterExport.addEventListener("click", exportAssignments);

    if (window.MopsosUI) { window.MopsosUI.wireInfoButtons(); window.MopsosUI.wireAdvancedToggles(); }

    setStatus("Loading corpus…");
    window.MopsosSQL.ready().then(() => {
      // stop the animated loading bar; reuse the element as a static status line
      if (el.clusterLoadStatus) { el.clusterLoadStatus.classList.remove("load-progress"); el.clusterLoadStatus.classList.add("status"); }
      el.clusterByVar.disabled = false;
      el.clusterLimitVar.disabled = false;
      el.btnRunCluster.disabled = false;
      el.btnClusterBenchmark.disabled = false;
      el.btnClusterStress.disabled = false;
      populateSub();
      populateLimitVal();
      // restore the person's previous selections, if any
      var st = window.MopsosUI && window.MopsosUI.loadState("cluster");
      if (st) {
        if (st.clusterByVar != null) { el.clusterByVar.value = st.clusterByVar; populateSub(); }
        if (st.clusterBySub != null) el.clusterBySub.value = st.clusterBySub;
        if (st.clusterLimitVar != null) { el.clusterLimitVar.value = st.clusterLimitVar; populateLimitVal(); }
        if (st.clusterLimitVal != null) el.clusterLimitVal.value = st.clusterLimitVal;
        CLUSTER_STATE_IDS.forEach(function (id) {
          if (["clusterByVar", "clusterBySub", "clusterLimitVar", "clusterLimitVal"].indexOf(id) >= 0) return;
          var e = el[id]; if (!e || st[id] == null) return;
          if (e.type === "checkbox") e.checked = st[id]; else e.value = st[id];
        });
      }
      setStatus("Corpus ready. Clustering…");
      setTimeout(run, 20);
    }).catch((e) => setStatus("Failed to load corpus: " + e.message));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
