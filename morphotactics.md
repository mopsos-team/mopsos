---
layout: default
title: Morphotactics
section: morphotactics
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Morphotactics</h1>
  <p class="tab-desc">How Greek morphology combines and sequences: which word classes follow which, which feature bundles co-occur inside a word, and how words are built from smaller members.</p>
  <div class="tab-meta-row">
    <button class="info-btn" data-info="mtInfo">What is this?</button>
  </div>
  <div id="mtInfo" class="info-panel" hidden>
    <h4>Morphotactics tab</h4>
    <p>Morphotactics is the study of how morphemes and morphological features are ordered and combined. Each panel explores a different aspect of the corpus:</p>
    <ul>
      <li><strong>Nominal compounds</strong>: how often each pairing of first-member and second-member category (e.g. preposition + noun) occurs among the analyzed compounds, optionally restricted to compounds attested in a given work; includes a lookup for an individual compound's members, category, and attestations.</li>
      <li><strong>Infinitive forms</strong>: tense/voice combinations attested among infinitives, optionally restricted to a work; includes a lookup for an individual verb's attested infinitive forms.</li>
      <li><strong>Word-class sequencing</strong>: a transition matrix of part of speech to next part of speech for adjacent tokens within a sentence.</li>
      <li><strong>Feature co-occurrence</strong>: the co-occurrence of one morphosyntactic component with another inside the same word, optionally restricted to one part of speech.</li>
      <li><strong>Paradigm slots</strong>: how often each value of a feature is filled for a chosen part of speech; only the features that actually apply to that part of speech are offered.</li>
    </ul>
  </div>
</section>

<div id="mtLoadStatus" class="load-progress"><span>Loading corpus…</span></div>

<!-- ============================ Compounding ============================ -->
<div class="card">
  <h2>Nominal compounds</h2>
  <p class="help" style="margin-top:-.3rem;">How often each (first-member category, second-member category) pairing occurs among the analyzed compounds.</p>
  <div class="mt-controls">
    <div class="grid-3">
      <div class="field"><label for="mtCmpWork"><strong>Restrict to work</strong></label><select id="mtCmpWork"><option value="">(all works)</option></select></div>
    </div>
    <div class="field">
      <label for="mtCmpSearch"><strong>Look up a compound</strong> <span class="help">(optional)</span></label>
      <div class="combo">
        <input id="mtCmpSearch" type="text" autocomplete="off" spellcheck="false" placeholder="type Greek (accents optional) or Beta Code, e.g. ῥοδοδάκτυλος or rododaktulos, or click to browse…">
        <div id="mtCmpSearchMenu" class="combo-menu" hidden></div>
      </div>
      <div id="mtCmpDetail" style="margin-top:.5rem;"></div>
    </div>
  </div>
  <p id="mtCmpDesc" class="help" style="margin-top:.4rem;"></p>
  <div class="viz-wrap"><div id="mtCmpChart"></div></div>
  <div id="mtCmpTable" style="margin-top:.8rem;"></div>
  <details style="margin-top:.8rem;">
    <summary class="small-muted" style="cursor:pointer;">Show generated SQL</summary>
    <pre id="mtCmpSql" class="status" style="margin-top:.5rem;"></pre>
  </details>
</div>

<!-- ============================ Infinitives ============================ -->
<div class="card">
  <h2>Infinitive forms</h2>
  <p class="help" style="margin-top:-.3rem;">Tense and voice combinations attested among infinitives.</p>
  <div class="mt-controls">
    <div class="grid-3">
      <div class="field"><label for="mtInfWork"><strong>Restrict to work</strong></label><select id="mtInfWork"><option value="">(all works)</option></select></div>
    </div>
    <div class="field">
      <label for="mtInfSearch"><strong>Look up a verb's infinitives</strong> <span class="help">(optional, by lemma)</span></label>
      <div class="combo">
        <input id="mtInfSearch" type="text" autocomplete="off" spellcheck="false" placeholder="type Greek (accents optional) or Beta Code, e.g. λύω or luw, or click to browse…">
        <div id="mtInfSearchMenu" class="combo-menu" hidden></div>
      </div>
      <div id="mtInfDetail" style="margin-top:.5rem;"></div>
    </div>
  </div>
  <p id="mtInfDesc" class="help" style="margin-top:.4rem;"></p>
  <div class="viz-wrap"><div id="mtInfChart"></div></div>
  <div id="mtInfTable" style="margin-top:.8rem;"></div>
  <details style="margin-top:.8rem;">
    <summary class="small-muted" style="cursor:pointer;">Show generated SQL</summary>
    <pre id="mtInfSql" class="status" style="margin-top:.5rem;"></pre>
  </details>
</div>

<!-- ======================= Other morphotactic views ======================= -->
<div class="card">
  <h2>More views</h2>
  <div class="view-picker">
    <div class="field">
      <label for="mtView"><strong>What to view</strong></label>
      <select id="mtView">
        <option value="sequence" selected>Word-class sequencing (POS → next POS)</option>
        <option value="cooccur">Feature co-occurrence (e.g. case × number)</option>
        <option value="slots">Paradigm slots (feature value frequencies)</option>
      </select>
    </div>
  </div>

  <!-- Sequence controls -->
  <div class="mt-controls" data-for="sequence">
    <div class="grid-3">
      <div class="field"><label for="mtSeqWork"><strong>Restrict to work</strong></label><select id="mtSeqWork"><option value="">(all works)</option></select></div>
      <div class="field"><label for="mtSeqMode"><strong>Cell value</strong></label><select id="mtSeqMode"><option value="count">Transition counts</option><option value="prob" selected>Row probabilities P(next | current)</option></select></div>
    </div>
  </div>

  <!-- Co-occurrence controls -->
  <div class="mt-controls" data-for="cooccur" hidden>
    <div class="grid-3">
      <div class="field"><label for="mtCoA"><strong>Rows (feature A)</strong></label><select id="mtCoA"></select></div>
      <div class="field"><label for="mtCoB"><strong>Columns (feature B)</strong></label><select id="mtCoB"></select></div>
      <div class="field"><label for="mtCoPos"><strong>Restrict to POS</strong></label><select id="mtCoPos"><option value="">(any)</option></select></div>
    </div>
  </div>

  <!-- Slots controls -->
  <div class="mt-controls" data-for="slots" hidden>
    <div class="grid-3">
      <div class="field"><label for="mtSlotPos"><strong>Part of speech</strong></label><select id="mtSlotPos"></select></div>
      <div class="field"><label for="mtSlotFeat"><strong>Feature</strong></label><select id="mtSlotFeat"></select></div>
    </div>
    <p class="help" style="margin:.2rem 0 0;">Only the features that actually apply to the chosen part of speech are offered.</p>
  </div>

  <div class="btn-row"><button id="mtRun" class="btn btn-primary" disabled>Render view</button></div>
</div>

<div class="card">
  <h2 id="mtOutTitle">Result</h2>
  <p id="mtOutDesc" class="help" style="margin-top:-.3rem;">Pick a view above and click “Render view”.</p>
  <div class="viz-wrap"><div id="mtChart"></div></div>
  <div id="mtTable" style="margin-top:.8rem;"></div>
  <details style="margin-top:.8rem;">
    <summary class="small-muted" style="cursor:pointer;">Show generated SQL</summary>
    <pre id="mtSql" class="status" style="margin-top:.5rem;"></pre>
  </details>
</div>
