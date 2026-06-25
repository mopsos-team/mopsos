---
layout: default
title: Syntax
section: syntax
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Syntax Workbench</h1>
  <p class="lead">Build dependency views either from tab-separated token lines or directly from CSVs that include <code>section_id</code>, <code>id</code>, and <code>distance</code>.</p>
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
