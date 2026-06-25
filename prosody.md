---
layout: default
title: Prosody
section: prosody
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Scansion</h1>
  <p class="lead">Metrical Scansion and Rhythm</p>
</section>

<div class="card">
  <h2>1. Homer scansion corpus (assets/data/scansion)</h2>
  <p class="help">Load precomputed Homeric scansion tables (files, lines, words, syllables) for corpus-level metrical statistics.</p>
  <div class="grid-3">
    <div class="field">
      <label for="scansionWork"><strong>Corpus scope</strong></label>
      <select id="scansionWork">
        <option value="all" selected>All works</option>
        <option value="iliad">Iliad</option>
        <option value="odyssey">Odyssey</option>
      </select>
    </div>
    <div class="field startup-actions">
      <button id="btnLoadScansionCorpus" class="btn">Load scansion corpus</button>
    </div>
    <div class="field startup-actions">
      <button id="btnScansionRefresh" class="btn">Refresh statistics</button>
    </div>
  </div>
  <div id="scansionLoadStatus" class="status muted">Scansion corpus not loaded yet.</div>
  <div id="scansionCorpusSummary" class="analysis-wrap"></div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Lines by work</h3><div id="scansionLinesByWork"></div></div>
    <div class="viz-wrap"><h3>Top feet patterns</h3><div id="scansionFeetPatterns"></div></div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Syllable quantity profile</h3><div id="scansionQuantityProfile"></div></div>
    <div class="viz-wrap"><h3>Line-level pacing</h3><div id="scansionPacingProfile"></div></div>
  </div>

  <h3 style="margin-top:1rem;">Selection explorer</h3>
  <div class="grid-3">
    <div class="field">
      <label for="scansionBookFilter"><strong>Book</strong></label>
      <select id="scansionBookFilter"><option value="all">All books</option></select>
    </div>
    <div class="field">
      <label for="scansionFootFilter"><strong>Metrical foot</strong></label>
      <select id="scansionFootFilter">
        <option value="all">All feet</option>
        <option value="1">Foot 1</option><option value="2">Foot 2</option><option value="3">Foot 3</option>
        <option value="4">Foot 4</option><option value="5">Foot 5</option><option value="6">Foot 6</option>
      </select>
    </div>
    <div class="field">
      <label for="scansionHemiFilter"><strong>Hemistich</strong></label>
      <select id="scansionHemiFilter"><option value="all">All</option><option value="1">1st hemi</option><option value="2">2nd hemi</option></select>
    </div>
  </div>
  <div class="grid-3">
    <div class="field">
      <label for="scansionQuantityFilter"><strong>Syllable quantity</strong></label>
      <select id="scansionQuantityFilter"><option value="all">All</option><option value="long">Long</option><option value="short">Short</option></select>
    </div>
    <div class="field">
      <label for="scansionWordMatchMode"><strong>Word matching mode</strong></label>
      <select id="scansionWordMatchMode">
        <option value="contains" selected>Contains</option>
        <option value="containsAll">Contains all terms</option>
        <option value="startsWith">Starts with</option>
        <option value="endsWith">Ends with</option>
        <option value="equals">Exact match</option>
        <option value="regex">Regex</option>
      </select>
    </div>
    <div class="field">
      <label for="scansionWordColumn"><strong>Search column</strong></label>
      <select id="scansionWordColumn"><option value="word_text" selected>Word / form</option><option value="lemma">Lemma</option><option value="form">Form</option></select>
    </div>
  </div>
  <div class="grid-3">
    <div class="field">
      <label for="scansionWordQuery"><strong>Word query</strong></label>
      <input id="scansionWordQuery" type="text" placeholder="e.g. μῆνιν or ^μῆ.* (regex)" />
    </div>
    <div class="field inline-group">
      <label class="inline"><input id="scansionRegexInsensitive" type="checkbox" checked /> Regex case-insensitive</label>
      <label class="inline"><input id="scansionRegexUnicode" type="checkbox" checked /> Regex unicode mode</label>
    </div>
    <div class="field startup-actions">
      <button id="btnScansionApplyFilters" class="btn btn-primary">Apply selection filters</button>
    </div>
  </div>
  <div class="grid-3">
    <div class="field"><label for="scansionPosFilter"><strong>POS</strong></label><select id="scansionPosFilter"><option value="">(any)</option></select></div>
    <div class="field"><label for="scansionPersonFilter"><strong>Person</strong></label><select id="scansionPersonFilter"><option value="">(any)</option></select></div>
    <div class="field"><label for="scansionNumberFilter"><strong>Number</strong></label><select id="scansionNumberFilter"><option value="">(any)</option></select></div>
  </div>
  <div class="grid-3">
    <div class="field"><label for="scansionTenseFilter"><strong>Tense</strong></label><select id="scansionTenseFilter"><option value="">(any)</option></select></div>
    <div class="field"><label for="scansionMoodFilter"><strong>Mood</strong></label><select id="scansionMoodFilter"><option value="">(any)</option></select></div>
    <div class="field"><label for="scansionVoiceFilter"><strong>Voice</strong></label><select id="scansionVoiceFilter"><option value="">(any)</option></select></div>
  </div>
  <div class="grid-3">
    <div class="field"><label for="scansionGenderFilter"><strong>Gender</strong></label><select id="scansionGenderFilter"><option value="">(any)</option></select></div>
    <div class="field"><label for="scansionCaseFilter"><strong>Case</strong></label><select id="scansionCaseFilter"><option value="">(any)</option></select></div>
    <div class="field"><label for="scansionDegreeFilter"><strong>Degree</strong></label><select id="scansionDegreeFilter"><option value="">(any)</option></select></div>
  </div>
  <div id="scansionSelectionSummary" class="analysis-wrap"></div>
  <div class="viz-wrap"><h3>Filtered selection table</h3><div id="scansionSelectionTable"></div></div>

</div>

<div class="card">
  <h2>2. Scansion + text</h2>
  <div id="prosodySummary" class="analysis-wrap"></div>
  <div class="viz-wrap">
    <h3>Verse alignment (text + scansion)</h3>
    <div id="prosodyAlignment"></div>
  </div>
  <div class="viz-wrap">
    <h3>Template + caesura diagnostics</h3>
    <div id="prosodyDiagnostics"></div>
  </div>
</div>


<div class="card">
  <h2>3. Advanced visual analytics + line browser</h2>
  <div class="grid-3">
    <div class="field">
      <label for="prosodyGraphMode"><strong>Graph mode</strong></label>
      <select id="prosodyGraphMode">
        <option value="bars" selected>Bars</option>
        <option value="stacked">Stacked profile</option>
        <option value="radar">Radar-like profile</option>
      </select>
    </div>
    <div class="field">
      <label for="prosodyGraphTopN"><strong>Top N entries</strong></label>
      <input id="prosodyGraphTopN" type="text" value="20" />
    </div>
    <div class="field startup-actions">
      <button id="btnProsodyRerender" class="btn">Rerender analytics</button>
    </div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap"><h3>Foot-position stress map</h3><div id="prosodyFootHeat"></div></div>
    <div class="viz-wrap"><h3>Caesura + mismatch histogram</h3><div id="prosodyHist"></div></div>
  </div>
  <div class="grid-3">
    <div class="field">
      <label for="scansionLineScope"><strong>Line scope</strong></label>
      <select id="scansionLineScope">
        <option value="all" selected>Current scope</option>
      </select>
    </div>
    <div class="field">
      <label for="scansionLineQuery"><strong>Line contains word</strong></label>
      <input id="scansionLineQuery" type="text" placeholder="e.g. Ἀχιλῆος" />
    </div>
    <div class="field startup-actions">
      <button id="btnRenderLineScansion" class="btn btn-primary">Display per-line scansion</button>
    </div>
  </div>
  <div class="viz-wrap"><h3>Per-line scansion browser</h3><div id="prosodyLineScansionTable"></div></div>
</div>


<div class="card">
  <h2>4. Pattern clustering + slot repetition analysis</h2>
  <div class="grid-3">
    <div class="field">
      <label for="patternClusterThreshold"><strong>Pattern similarity threshold</strong></label>
      <input id="patternClusterThreshold" type="text" value="0.70" />
    </div>
    <div class="field">
      <label for="patternClusterTopN"><strong>Top patterns</strong></label>
      <input id="patternClusterTopN" type="text" value="20" />
    </div>
    <div class="field startup-actions">
      <button id="btnPatternCluster" class="btn btn-primary">Cluster metrical patterns</button>
    </div>
  </div>
  <div id="patternClusterSummary" class="analysis-wrap"></div>
  <div class="viz-wrap"><h3>Pattern clusters</h3><div id="patternClusterTable"></div></div>

  <div class="grid-3" style="margin-top:.8rem;">
    <div class="field">
      <label for="slotFootSelect"><strong>Slot foot</strong></label>
      <select id="slotFootSelect"><option value="all" selected>All feet</option><option value="1">Foot 1</option><option value="2">Foot 2</option><option value="3">Foot 3</option><option value="4">Foot 4</option><option value="5">Foot 5</option><option value="6">Foot 6</option></select>
    </div>
    <div class="field">
      <label for="slotWordQuery"><strong>Word query (optional)</strong></label>
      <input id="slotWordQuery" type="text" placeholder="Leave blank to show top-N words by slot" />
    </div>
    <div class="field">
      <label for="slotTopN"><strong>Top N words</strong></label>
      <input id="slotTopN" type="text" value="25" />
    </div>
  </div>
  <div class="btn-row"><button id="btnSlotRepetition" class="btn">Analyze slot repetition</button></div>
  <div id="slotRepetitionSummary" class="analysis-wrap"></div>
  <div class="viz-wrap"><h3>Slot repetition table</h3><div id="slotRepetitionTable"></div></div>
</div>
