---
layout: default
title: Phonology
section: phonology
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Phonology</h1>
  <p class="tab-desc">Phonological structure of the corpus: phoneme inventory, syllable shapes, onset/coda clusters, diphthongs, vowel quantity, sonority and alliteration — computed over any set of tokens you select with SQL.</p>
  <div class="tab-meta-row">
    <button class="info-btn" data-info="phonInfo">What is this?</button>
  </div>
  <div id="phonInfo" class="info-panel" hidden>
    <h4>Phonology tab</h4>
    <p>Pick the tokens to analyse with a SQL query (table <code>morphology</code>), choose which column holds the word form, then select a single view from the drop-down. Each token is normalised (diacritics stripped, final ς→σ) and syllabified by the maximal-onset principle; every statistic is derived from those structured syllables and drawn with D3.</p>
    <ul>
      <li><strong>SQL-driven</strong> — analyse all forms, just verbs, only genitive nouns, lemmata, or any query you write.</li>
      <li><strong>One view at a time</strong> — use “What to view” to switch between phoneme, syllable, cluster, quantity, sonority and alliteration analyses.</li>
    </ul>
  </div>
</section>

<div id="phonLoadingBar" class="load-progress"><span>Loading corpus into SQLite…</span></div>

<div class="card">
  <h2>1. Token source (SQL)</h2>
  <p class="help" style="margin-top:-.35rem;">This query selects the tokens to analyse. It must return at least one text column of word forms.</p>
  <textarea id="phonSql" spellcheck="false" style="width:100%;min-height:96px;resize:vertical;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;line-height:1.5;padding:.7rem .8rem;white-space:pre;">SELECT form, lemma FROM morphology;</textarea>
  <div id="phonSqlExamples" class="btn-row" style="margin-top:.45rem;flex-wrap:wrap;"></div>
  <div class="grid-3" style="margin-top:.5rem;">
    <div class="field"><label for="phonTokenCol"><strong>Token / form column</strong></label><select id="phonTokenCol" disabled></select></div>
  </div>
  <div class="btn-row"><button id="btnRunPhon" class="btn btn-primary" disabled>Run query &amp; analyze</button></div>
  <pre id="phonStatus" class="status" style="margin-top:.6rem;">Waiting for corpus…</pre>
</div>

<div class="card">
  <h2>2. Phonological view</h2>
  <div class="view-picker">
    <div class="field">
      <label for="phonView"><strong>What to view</strong></label>
      <select id="phonView">
        <option value="phonemes" selected>Phoneme distribution</option>
        <option value="shapes">Syllable shape profile (CV / CVC …)</option>
        <option value="onsets">Onset clusters</option>
        <option value="codas">Coda clusters</option>
        <option value="diphthongs">Diphthong distribution</option>
        <option value="quantity">Vowel quantity profile</option>
        <option value="balance">Vowel vs consonant balance</option>
        <option value="syllen">Syllable length profile</option>
        <option value="complexity">Onset / coda complexity</option>
        <option value="sonority">Sonority profile</option>
        <option value="initials">Initial-sound profile</option>
        <option value="alliteration">Adjacent alliteration windows</option>
        <option value="table">Token-level phonology table</option>
      </select>
    </div>
    <div class="field" style="max-width:140px;">
      <label for="phonTopN"><strong>Top N</strong></label>
      <input id="phonTopN" type="text" value="24" />
    </div>
  </div>
  <p id="phonViewDesc" class="help" style="margin-top:.2rem;"></p>
  <div id="phonSummary" class="analysis-wrap" style="margin-top:.4rem;"></div>
  <div class="viz-wrap" style="margin-top:.7rem;"><div id="phonChart"></div></div>
  <div id="phonTable" style="margin-top:.7rem;"></div>
</div>
