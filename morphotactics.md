---
layout: default
title: Morphotactics
section: morphotactics
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Morphotactics</h1>
  <p class="tab-desc">How Greek morphology combines and sequences: which word classes follow which, which feature bundles co-occur inside a word, and how those features are spelled out at the ends of forms.</p>
  <div class="tab-meta-row">
    <button class="info-btn" data-info="mtInfo">What is this?</button>
  </div>
  <div id="mtInfo" class="info-panel" hidden>
    <h4>Morphotactics tab</h4>
    <p>Morphotactics is the study of how morphemes and morphological features are ordered and combined. Each view explores a different aspect of the corpus:</p>
    <ul>
      <li><strong>Word-class sequencing</strong> — a transition matrix of part of speech → next part of speech for adjacent tokens within a sentence.</li>
      <li><strong>Feature co-occurrence</strong> — how two features (e.g. case × number) combine inside the same word, optionally restricted to one part of speech.</li>
      <li><strong>Surface-final sequences</strong> — the most frequent word-final letter sequences associated with a chosen feature value. This approximates exponence by final orthographic strings; it does not segment morphemes.</li>
      <li><strong>Paradigm slots</strong> — how often each value of a feature is filled for a chosen part of speech.</li>
      <li><strong>Nominal compounds</strong> — how often each pairing of first-member and second-member category (e.g. preposition + noun) occurs among the analyzed compounds, optionally restricted to compounds attested in a given work; includes a lookup for an individual compound's members, category, and attestations.</li>
      <li><strong>Infinitive forms</strong> — tense/voice combinations attested among infinitives, optionally restricted to a work; includes a lookup for an individual verb's attested infinitive forms.</li>
    </ul>
  </div>
</section>

<div id="mtLoadStatus" class="load-progress"><span>Loading corpus…</span></div>

<div class="card">
  <h2>Choose a view</h2>
  <div class="view-picker">
    <div class="field">
      <label for="mtView"><strong>What to view</strong></label>
      <select id="mtView">
        <option value="sequence" selected>Word-class sequencing (POS → next POS)</option>
        <option value="cooccur">Feature co-occurrence (e.g. case × number)</option>
        <option value="exponence">Surface-final sequences by feature value</option>
        <option value="slots">Paradigm slots — feature value frequencies</option>
        <option value="compound">Nominal compounds — member category pairing</option>
        <option value="infinitive">Infinitive forms — tense × voice</option>
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

  <!-- Exponence controls -->
  <div class="mt-controls" data-for="exponence" hidden>
    <div class="grid-3">
      <div class="field"><label for="mtExpPos"><strong>Part of speech</strong></label><select id="mtExpPos"></select></div>
      <div class="field"><label for="mtExpFeat"><strong>Group endings by</strong></label><select id="mtExpFeat"></select></div>
      <div class="field"><label for="mtExpLen"><strong>Ending length (letters)</strong></label><select id="mtExpLen"><option>1</option><option selected>2</option><option>3</option></select></div>
    </div>
  </div>

  <!-- Slots controls -->
  <div class="mt-controls" data-for="slots" hidden>
    <div class="grid-3">
      <div class="field"><label for="mtSlotPos"><strong>Part of speech</strong></label><select id="mtSlotPos"></select></div>
      <div class="field"><label for="mtSlotFeat"><strong>Feature</strong></label><select id="mtSlotFeat"></select></div>
    </div>
  </div>

  <!-- Compound controls -->
  <div class="mt-controls" data-for="compound" hidden>
    <div class="grid-3">
      <div class="field"><label for="mtCmpWork"><strong>Restrict to work</strong></label><select id="mtCmpWork"><option value="">(all works)</option></select></div>
    </div>
    <div class="field">
      <label for="mtCmpSearch"><strong>Look up a compound</strong> <span class="help">— optional</span></label>
      <div class="combo">
        <input id="mtCmpSearch" type="text" autocomplete="off" spellcheck="false" placeholder="type Greek (accents optional) or Beta Code — e.g. ῥοδοδάκτυλος, rododaktulos, or click to browse…">
        <div id="mtCmpSearchMenu" class="combo-menu" hidden></div>
      </div>
      <div id="mtCmpDetail" style="margin-top:.5rem;"></div>
    </div>
  </div>

  <!-- Infinitive controls -->
  <div class="mt-controls" data-for="infinitive" hidden>
    <div class="grid-3">
      <div class="field"><label for="mtInfWork"><strong>Restrict to work</strong></label><select id="mtInfWork"><option value="">(all works)</option></select></div>
    </div>
    <div class="field">
      <label for="mtInfSearch"><strong>Look up a verb's infinitives</strong> <span class="help">— optional, by lemma</span></label>
      <div class="combo">
        <input id="mtInfSearch" type="text" autocomplete="off" spellcheck="false" placeholder="type Greek (accents optional) or Beta Code — e.g. λύω, luw, or click to browse…">
        <div id="mtInfSearchMenu" class="combo-menu" hidden></div>
      </div>
      <div id="mtInfDetail" style="margin-top:.5rem;"></div>
    </div>
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
