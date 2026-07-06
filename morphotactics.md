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
      <li><strong>Nominal compounds</strong>: filter the analyzed compounds by a specific first or second member (adaptive Greek or Beta Code input, with a browsable list of attested members) or by the members’ syntactic categories, and by attesting work. The panel shows how the member categories pair up, the commonest first and second members among the matches, and where the matching compounds are localized in the hexameter (from the merged metrical record); the lookup gives one compound’s members, every metrical pattern it shows, every occurrence in the corpus with its line text, and a button that scans all of its lines word by word.</li>
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
  <div class="tab-meta-row"><button class="info-btn" data-info="mtCmpInfo">What is this?</button></div>
  <div id="mtCmpInfo" class="info-panel" hidden>
    <h4>Nominal compounds panel</h4>
    <p>Filter the analyzed compounds by first member, second member, member category, or attesting work; see which members are commonest, how the member categories pair up, and where the matching compounds sit in the verse.</p>
    <ul>
      <li><strong>Members</strong>: pick a specific member (type Greek with or without accents, or Beta Code, or click to browse the attested members) <em>or</em> a member category; a specific member fixes its category anyway, so use whichever is handier. The member values come from the compound analysis itself, and the two slots combine freely.</li>
      <li><strong>Lookup</strong>: choosing one compound shows its members, every metrical position it takes in the verse (form, shape, feet, princeps or biceps start), every occurrence in the corpus with its line text, and a button that scans all of its lines word by word.</li>
    </ul>
  </div>
  <div class="mt-controls">
    <div class="grid-3">
      <div class="field">
        <label for="mtCmpM1"><strong>First member</strong></label>
        <div class="combo">
          <input id="mtCmpM1" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. ἀ/ἀν, εὐ, πολύς, or Beta Code like eu…; click to browse">
          <div id="mtCmpM1Menu" class="combo-menu" hidden></div>
        </div>
      </div>
      <div class="field"><label for="mtCmpM1Cat"><strong>or first-member category</strong></label><select id="mtCmpM1Cat"><option value="">(any category)</option></select></div>
      <div class="field"><label for="mtCmpM1Sub"><strong>or first-member subcategory</strong></label><select id="mtCmpM1Sub" disabled><option value="">(any subcategory)</option></select></div>
    </div>
    <div class="grid-3">
      <div class="field">
        <label for="mtCmpM2"><strong>Second member</strong></label>
        <div class="combo">
          <input id="mtCmpM2" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. μάχομαι, ἵππος, or Beta Code like maxomai…; click to browse">
          <div id="mtCmpM2Menu" class="combo-menu" hidden></div>
        </div>
      </div>
      <div class="field"><label for="mtCmpM2Cat"><strong>or second-member category</strong></label><select id="mtCmpM2Cat"><option value="">(any category)</option></select></div>
      <div class="field"><label for="mtCmpM2Sub"><strong>or second-member subcategory</strong></label><select id="mtCmpM2Sub" disabled><option value="">(any subcategory)</option></select></div>
    </div>
    <div class="grid-3">
      <div class="field"><label for="mtCmpWork"><strong>Attested in</strong></label><select id="mtCmpWork"><option value="">(all works)</option></select></div>
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
  <div id="mtCmpMatchesSec">
    <h3 style="margin-top:1rem;">Matching compounds</h3>
    <div id="mtCmpMatches" style="margin-top:.3rem;"></div>
  </div>
  <div id="mtCmpPairSec">
    <h3 style="margin-top:1rem;">Compound member categories</h3>
    <div class="viz-wrap"><div id="mtCmpChart"></div></div>
    <p id="mtCmpDesc" class="fig-caption" style="margin-top:.25rem;"></p>
    <div id="mtCmpTable" style="margin-top:.8rem;"></div>
  </div>
  <div id="mtCmpMembersSec">
    <h3 style="margin-top:1rem;">Members of the matching compounds</h3>
    <p class="help" style="margin-top:.1rem;">The commonest first and second members among the compounds matching the filters above. Each lexeme's bar is split by allomorph in descending order of attestation (variants differing only in accent or capitalization count as one, labeled by their commonest accented form; hover a segment for its exact share). Click a member to open a chart just below with each of its allomorphs counted separately.</p>
    <div class="grid-2">
      <div class="viz-wrap" id="mtCmpM1Wrap"><div id="mtCmpM1Chart"></div></div>
      <div class="viz-wrap" id="mtCmpM2Wrap"><div id="mtCmpM2Chart"></div></div>
    </div>
    <div class="viz-wrap" style="margin-top:.6rem;"><div id="mtCmpFlowChart"></div></div>
    <p id="mtCmpFlowNote" class="fig-caption" style="margin-top:.25rem;"></p>
  </div>
  <div id="mtCmpLocSec" hidden>
    <h3 style="margin-top:1rem;">Metrical localization</h3>
    <p id="mtCmpLocNote" class="help" style="margin-top:.1rem;"></p>
    <div class="viz-wrap"><div id="mtCmpLocChart"></div></div>
  </div>
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
