---
layout: default
title: Phonology
section: phonology
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Phonology</h1>
</section>

<div class="card">
  <h2>1. Load dataset</h2>
  <div class="grid-3">
    <div class="field">
      <label for="phonBundledDataset"><strong>Bundled dataset</strong></label>
      <select id="phonBundledDataset">
        <option value="default.csv">default.csv (Epic corpus)</option>
      </select>
      <div class="btn-row" style="margin-top:.35rem;"><button id="btnPhonLoadBundled" class="btn">Load bundled CSV</button></div>
    </div>
    <div class="field">
      <label for="phonTokenCol"><strong>Token/form column</strong></label>
      <select id="phonTokenCol" disabled></select>
    </div>
  </div>
  <div class="btn-row"><button id="btnRunPhon" class="btn btn-primary" disabled>Run phonology analysis</button></div>
  <div id="phonLoadStatus" class="status muted">No phonology dataset loaded yet.</div>
</div>

<div class="card">
  <h2>2. Phonological outputs</h2>
  <div id="phonSummary" class="analysis-wrap"></div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Phoneme distribution</h3><div id="phonPhonemeBars"></div></div>
    <div class="viz-wrap"><h3>Syllable shape profile</h3><div id="phonShapeBars"></div></div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Onset clusters</h3><div id="phonOnsetBars"></div></div>
    <div class="viz-wrap"><h3>Coda clusters</h3><div id="phonCodaBars"></div></div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Diphthong distribution</h3><div id="phonDiphBars"></div></div>
    <div class="viz-wrap"><h3>Vowel quantity profile</h3><div id="phonQuantityBars"></div></div>
  </div>
  <div class="viz-wrap"><h3>Token-level phonology table</h3><div id="phonTable"></div></div>
</div>


<div class="card">
  <h2>3. Advanced phonology explorer</h2>
  <div class="grid-3">
    <div class="field">
      <label for="phonGraphMode"><strong>Graph mode</strong></label>
      <select id="phonGraphMode"><option value="bars" selected>Bars</option><option value="stacked">Stacked</option><option value="table">Table profile</option></select>
    </div>
    <div class="field">
      <label for="phonTopN"><strong>Top N</strong></label>
      <input id="phonTopN" type="text" value="24" />
    </div>
    <div class="field startup-actions"><button id="btnPhonRerender" class="btn">Rerender explorer</button></div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Vowel vs consonant balance</h3><div id="phonBalanceBars"></div></div>
    <div class="viz-wrap"><h3>Syllable length profile</h3><div id="phonSylLenBars"></div></div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Onset/coda complexity</h3><div id="phonComplexityBars"></div></div>
    <div class="viz-wrap"><h3>Sonority proxy profile</h3><div id="phonSonorityBars"></div></div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Initial-sound profile (oral style)</h3><div id="phonInitialBars"></div></div>
    <div class="viz-wrap"><h3>Adjacent alliteration windows</h3><div id="phonAlliterationBars"></div></div>
  </div>
</div>
