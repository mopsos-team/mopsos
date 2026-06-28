---
layout: default
title: Syntax
section: syntax
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Syntax Workbench</h1>
  <p class="tab-desc">Explore how words relate to one another in the sentence: dependency trees, phrase-structure sketches, and corpus-wide profiles of grammatical relations and dependency distance.</p>
  <div class="tab-meta-row">
    <button class="info-btn" data-info="syntaxInfo">What is this?</button>
  </div>
  <div id="syntaxInfo" class="info-panel" hidden>
    <h4>Syntax tab</h4>
    <p>Syntax is the study of how words combine into larger structures. This workbench lets you inspect those structures two ways:</p>
    <ul>
      <li><strong>Manual TSV input</strong> — paste annotated token rows (id, form, lemma, pos, head, deprel, optional distance) to draw a dependency tree and a phrase-structure sketch for a single sentence.</li>
      <li><strong>Corpus profiles</strong> — summaries built from the loaded corpus, including the distribution of grammatical relations, construction hits, and how dependency distance (the signed gap between a token and its head) is distributed across categories.</li>
    </ul>
    <p>Dependency distance is read from the <code>distance</code> column; positive values mean the head follows the dependent, negative values mean it precedes.</p>
  </div>
</section>

<div id="syntaxLoadStatus" class="load-progress"><span>Loading</span></div>

<div class="card">
  <h2>2. Optional TSV input (manual)</h2>
  <p class="help">Use one token per line: <code>id[TAB]form[TAB]lemma[TAB]pos[TAB]head[TAB]deprel[TAB]distance(optional)</code>. Separate sentences with a blank line.</p>
  <div class="field">
    <label for="syntaxInput"><strong>Token rows</strong></label>
    <textarea id="syntaxInput" class="big-textarea">1	μῆνιν	μῆνις	n	2	obj	1
2	ἄειδε	ἀείδω	v	0	root	0
3	θεὰ	θεά	n	2	vocative	-1
4	Πηληϊάδεω	Πηληϊάδης	n	5	nmod	1
5	Ἀχιλῆος	Ἀχιλλεύς	n	3	appos	-2</textarea>
  </div>
</div>

<div class="card">
  <h2>3. Syntactic outputs</h2>
  <div id="syntaxSummary" class="analysis-wrap"></div>
  <div class="grid-2">
    <div class="viz-wrap">
      <h3>Dependency tree</h3>
      <svg id="syntaxDepSvg" class="cluster-svg" viewBox="0 0 1100 460"></svg>
    </div>
    <div class="viz-wrap">
      <h3>Phrase-structure sketch</h3>
      <pre id="syntaxPhrase" class="status" style="min-height:280px;"></pre>
    </div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap">
      <h3>Corpus relation profile</h3>
      <div id="syntaxRelationBars"></div>
    </div>
    <div class="viz-wrap">
      <h3>Construction hits</h3>
      <div id="syntaxHits"></div>
    </div>
  </div>
  <div class="grid-2">
    <div class="viz-wrap">
      <h3>Dependency category profile</h3>
      <div id="syntaxDistanceProfile"></div>
    </div>
    <div class="viz-wrap">
      <h3>Token table</h3>
      <div id="syntaxTable"></div>
    </div>
  </div>
</div>
