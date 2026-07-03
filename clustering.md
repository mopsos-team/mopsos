---
layout: default
title: Stylometry
section: clustering
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Stylometry</h1>
  <p class="tab-desc">Group texts, or any other unit, by how they use the language. Choose what to cluster, optionally limit the data, and MOPSOS turns each unit into a profile, measures how similar they are, and groups them.</p>
  <div class="tab-meta-row">
    <button class="info-btn" data-info="clusterInfo">What is this?</button>
  </div>
  <div id="clusterInfo" class="info-panel" hidden>
    <h4>Stylometry tab</h4>
    <p>Each unit you cluster (a work, an author, a part-of-speech class…) becomes a "document". Its features are the frequencies of the tokens it contains, turned into a profile and compared with a distance measure; units that come out close together are grouped into the same cluster.</p>
    <ul>
      <li><strong>Cluster by</strong> sets what each point represents. For part of speech, number, and case you can pick a specific value (e.g. cluster works by how they use verbs) or cluster the categories themselves.</li>
      <li><strong>Limit to</strong> restricts the corpus before features are built: by work, by author, or by grammar (pick a part of speech, then add only the features that apply to it).</li>
      <li><strong>Advanced features / clustering options</strong> expose the feature model, distance metric, method, and number of clusters. Sensible defaults are used otherwise.</li>
    </ul>
  </div>
</section>

<div id="clusterLoadStatus" class="load-progress"><span>Loading corpus…</span></div>

<div class="card">
  <h2>1. Configure features</h2>
  <p class="help" style="margin-top:-.35rem;">Pick what each point represents and (optionally) restrict the data. Everything else has sensible defaults under Advanced features.</p>
  <div class="grid-2">
    <div class="field">
      <label for="clusterByVar"><strong>Cluster by</strong></label>
      <select id="clusterByVar" disabled>
        <option value="work" selected>Books / works</option>
        <option value="author">Authors</option>
        <option value="lemma">Lemmata</option>
        <option value="form">Word forms</option>
        <option value="pos">Part of speech</option>
        <option value="number">Grammatical number</option>
        <option value="case">Case</option>
      </select>
    </div>
    <div class="field">
      <label for="clusterLimitWork"><strong>Limit to work</strong></label>
      <select id="clusterLimitWork" disabled><option value="">(all works)</option></select>
    </div>
  </div>
  <div class="submenu-row" id="clusterBySubRow" hidden>
    <div class="field">
      <label for="clusterBySub"><strong id="clusterBySubLabel">Which value?</strong></label>
      <select id="clusterBySub"></select>
    </div>
  </div>
  <div class="grid-2">
    <div class="field">
      <label for="clusterLimitAuthor"><strong>Limit to author</strong></label>
      <select id="clusterLimitAuthor" disabled><option value="">(all authors)</option></select>
    </div>
  </div>
  <div class="field" style="margin-top:.2rem;">
    <label><strong>Limit to grammar</strong></label>
    <p class="help" style="margin:-.1rem 0 .45rem;">Choose a part of speech first; then only the features that apply to it can be added, so compatible attributes combine (e.g. tense + number on a verb) while incompatible ones (e.g. person + case) never appear together.</p>
    <div id="clusterLimitGroup" class="filter-group"></div>
  </div>

  <button class="adv-toggle" data-adv="clusterFeatAdv">Advanced features</button>
  <div id="clusterFeatAdv" class="adv-panel" hidden>
    <div class="grid-3">
      <div class="field"><label for="clusterTokenCol"><strong>Feature (token) column</strong></label><select id="clusterTokenCol"><option value="lemma" selected>lemma</option><option value="form">form</option></select></div>
      <div class="field"><label for="clusterFeatureMode"><strong>Feature mode</strong></label><select id="clusterFeatureMode"><option value="token" selected>Direct tokens</option><option value="collocation">Collocations (n-grams)</option></select></div>
      <div class="field"><label for="clusterNgram"><strong>Collocation size n</strong></label><input id="clusterNgram" type="text" value="2" /></div>
    </div>
    <div class="grid-3">
      <div class="field"><label for="clusterVectorModel"><strong>Vector model</strong></label><select id="clusterVectorModel"><option value="binary">Binary presence</option><option value="count">Raw counts</option><option value="tfidf" selected>TF-IDF</option><option value="bm25">BM25 (Okapi)</option><option value="bm25plus">BM25+</option></select></div>
      <div class="field"><label for="clusterDistance"><strong>Distance metric</strong></label><select id="clusterDistance"><option value="cosine" selected>Cosine</option><option value="jaccard">Jaccard</option><option value="euclidean">Euclidean</option><option value="manhattan">Manhattan</option></select></div>
      <div class="field"><label for="clusterExcludeFunction"><strong>Exclude function words</strong></label><select id="clusterExcludeFunction"><option value="off" selected>No</option><option value="on">Yes</option></select></div>
    </div>
    <div class="grid-2">
      <div class="field"><label for="clusterMinDocFreq"><strong>Min document frequency ratio</strong></label><input id="clusterMinDocFreq" type="text" value="0.00" /></div>
      <div class="field"><label for="clusterMaxDocFreq"><strong>Max document frequency ratio</strong></label><input id="clusterMaxDocFreq" type="text" value="1.00" /></div>
    </div>
  </div>
</div>

<div class="card">
  <h2>2. Clustering strategy</h2>
  <p id="clusterStrategyNote" class="help" style="margin-top:-.2rem;">Sensible defaults are applied. Open Advanced clustering options to change the method or the number of clusters.</p>
  <button class="adv-toggle" data-adv="clusterStratAdv">Advanced clustering options</button>
  <div id="clusterStratAdv" class="adv-panel" hidden>
    <div class="grid-3">
      <div class="field"><label for="clusterMethod"><strong>Clustering method</strong></label><select id="clusterMethod">
        <option value="threshold">Threshold graph components</option>
        <option value="single">Agglomerative single-link</option>
        <option value="complete">Agglomerative complete-link</option>
        <option value="average">Agglomerative average-link</option>
        <option value="ward" selected>Agglomerative Ward</option>
        <option value="kmeans">K-means</option>
        <option value="kmedoids">K-medoids</option>
        <option value="dbscan">DBSCAN</option>
        <option value="labelprop">Label propagation (graph)</option>
        <option value="mds_kmeans">MDS + K-means</option>
      </select></div>
      <div class="field"><label for="clusterK"><strong>Target clusters (k)</strong></label><input id="clusterK" type="text" value="6" /></div>
      <div class="field"><label for="clusterThreshold"><strong>Similarity threshold</strong></label><input id="clusterThreshold" type="text" value="0.25" /></div>
    </div>
    <div class="grid-3">
      <div class="field"><label for="clusterEps"><strong>DBSCAN epsilon (distance)</strong></label><input id="clusterEps" type="text" value="0.65" /></div>
      <div class="field"><label for="clusterMinPts"><strong>DBSCAN minPts</strong></label><input id="clusterMinPts" type="text" value="2" /></div>
      <div class="field"><label for="clusterTopFeatures"><strong>Top features per cluster</strong></label><input id="clusterTopFeatures" type="text" value="10" /></div>
    </div>
  </div>
  <div class="btn-row">
    <button id="btnRunCluster" class="btn btn-primary" disabled>Run clustering</button>
    <button id="btnClusterBenchmark" class="btn" disabled>Benchmark methods</button>
    <button id="btnClusterStress" class="btn" disabled>Stress test</button>
    <button id="btnClusterExport" class="btn">Export assignments (CSV)</button>
  </div>
  <details style="margin-top:.6rem;"><summary class="small-muted" style="cursor:pointer;">Generated SQL</summary><pre id="clusterSql" class="status" style="white-space:pre-wrap;margin-top:.4rem;"></pre></details>
  <div id="clusterStressOut" class="analysis-wrap" style="margin-top:.5rem;"><div class="small-muted">Benchmark / stress-test output will appear here.</div></div>
</div>

<div class="card">
  <h2>3. Visualizations</h2>
  <div id="clusterSummary" class="analysis-wrap"></div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>MDS scatter</h3><div id="clusterMds"></div></div>
    <div class="viz-wrap"><h3>Cluster sizes</h3><div id="clusterSizeBars"></div></div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Similarity heatmap</h3><div id="clusterHeatmap"></div></div>
    <div class="viz-wrap"><h3>Similarity network</h3><div id="clusterNetwork"></div></div>
  </div>
  <div class="viz-wrap"><h3>Similarity distribution</h3><div id="clusterSimilarityDist"></div></div>
  <div class="viz-wrap"><h3>Cluster feature signatures</h3><div id="clusterFeatures"></div></div>
  <div class="viz-wrap"><h3>Method benchmark</h3><div id="clusterBenchmark"></div></div>
</div>
