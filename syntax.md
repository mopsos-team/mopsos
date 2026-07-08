---
layout: default
title: Syntax
section: syntax
---

<div id="syntaxLoadStatus" class="load-progress"><span>Loading the corpus…</span></div>

<section class="panel">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Syntax Search</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>
  <div class="panel-info">
    <button class="info-btn" data-info="syntaxInfo">What is this?</button>
  <div id="syntaxInfo" class="info-panel" hidden>
    <h4>Syntax tab</h4>
    <p>Every token in the corpus carries a signed dependency distance to its head (distance = position of the word minus position of its head; 0 marks the root).</p>
    <ul>
      <li><strong>Pick a sentence</strong>: choose a work, book, and line number; the dependency tree (renderable horizontally, vertically, or as bracketed text) and a token table are drawn for the sentence containing that line (with a selector when two sentences share the line).</li>
      <li><strong>Syntax-Meter Interface Search</strong>: because the same tokens carry their metrical record, the tab measures the syntax-metre interface directly from the corpus: where sentence boundaries fall in the verse (line end, the caesura points, the bucolic diaeresis), how many lines are enjambed, how many dependency arcs cross a line boundary, plus head direction and dependency length by part of speech.</li>
    </ul>
  </div>
  </div>

<div class="card">
  <h2>1. Pick a sentence from the corpus</h2>
  <p class="help" style="margin-top:-.3rem;">Choose a line; the whole sentence containing it is drawn (Homeric sentences often span several lines).</p>
  <div class="grid-3">
    <div class="field"><label for="syntaxWork"><strong>Work</strong></label><select id="syntaxWork" disabled></select></div>
    <div class="field"><label for="syntaxBook"><strong>Book</strong></label><select id="syntaxBook"></select></div>
    <div class="field">
      <label for="syntaxLine"><strong>Line</strong></label>
      <input id="syntaxLine" type="number" min="1" value="1" style="width:100%;">
    </div>
  </div>
  <div class="btn-row" style="margin-top:.5rem;">
    <button id="btnSyntaxDraw" class="btn" disabled>Draw the sentence</button>
  </div>
  <div class="field" id="syntaxSentWrap" hidden style="margin-top:.5rem;">
    <label for="syntaxSentSel"><strong>This line holds more than one sentence</strong></label>
    <select id="syntaxSentSel"></select>
  </div>
</div>

<div class="card">
  <h2>2. Sentence structure</h2>
  <div id="syntaxSummary" class="analysis-wrap"></div>
  <div class="grid-3">
    <div class="field">
      <label for="syntaxTreeMode"><strong>Render as</strong></label>
      <select id="syntaxTreeMode">
        <option value="h" selected>Horizontal tree</option>
        <option value="v">Vertical tree</option>
        <option value="t">Text (brackets)</option>
      </select>
    </div>
  </div>
  <div class="viz-wrap" style="margin-top:.5rem;">
    <h3>Dependency Tree</h3>
    <div id="syntaxTree"></div>
    <pre id="syntaxPhrase" class="status" hidden style="min-height:200px;"></pre>
  </div>
  <div id="syntaxTable" style="margin-top:.8rem;"></div>
</div>

  </div>
</section>

<section class="panel">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Syntax-Meter Interface Search</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>

<div class="card">
  <p class="help" style="margin-top:-.3rem;">Corpus-wide measurements of the syntax-metre interface, computed live from the merged record: sentence boundaries located by the metrical position of their final word, enjambment, arcs across the line boundary, and dependency profiles.</p>
  <div class="grid-3">
    <div class="field"><label for="syntaxMetreWork"><strong>Scope</strong></label><select id="syntaxMetreWork" disabled><option value="">(both poems)</option></select></div>
    <div class="field"><label for="syntaxMetreBook"><strong>Book</strong></label><select id="syntaxMetreBook" disabled><option value="">(all books)</option></select></div>
    <div class="field" style="align-self:end;"><button id="btnSyntaxMetre" class="btn" disabled>Compute</button></div>
  </div>
  <div id="syntaxMetreSummary" class="analysis-wrap" style="margin-top:.6rem;"></div>
  <div class="viz-wrap" style="margin-top:.6rem;"><div id="syntaxSentEnd"></div></div>
  <div class="grid-2" style="margin-top:.6rem;">
    <div class="viz-wrap">
      <div class="field" style="max-width:280px;margin:.4rem .4rem 0;">
        <label for="syntaxHeadDirHead"><strong>Head is a…</strong></label>
        <select id="syntaxHeadDirHead" disabled><option value="">(any part of speech)</option></select>
      </div>
      <div id="syntaxHeadDir"></div>
    </div>
    <div class="viz-wrap"><div id="syntaxDepLen"></div></div>
  </div>
  <p id="syntaxMetreNote" class="help" style="margin-top:.5rem;"></p>
  <details class="help" style="margin-top:.4rem;">
    <summary style="cursor:pointer;"><strong>Numbers in the Visualization</strong></summary>
    <p style="margin-top:.4rem;">An enjambed line is one whose final word does not end its sentence. Dependency heads are recovered from the stored signed distances. The head-direction chart reads per dependent: the Preposition bars describe where the preposition’s own head (the verb its phrase modifies) stands, not the noun inside the phrase; that noun is counted under Noun, where its prepositional head precedes it 91% of the time (the rest is anastrophe). Note the treebank's attachment conventions when reading the head-direction chart: a preposition HEADS its noun phrase and itself attaches to the verb it modifies, so “head follows” dominating for prepositions reflects Greek's late verbs (the prepositional phrase usually precedes its verb), while nouns governed by a preposition show “head precedes”, the familiar preposition-before-noun order.</p>
  </details>
</div>

  </div>
</section>
