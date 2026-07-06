---
layout: default
title: Phonology
section: phonology
---

<div id="phonLoadingBar" class="load-progress"><span>Loading corpus…</span></div>

<section class="panel">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Phonology Search</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>
  <div class="panel-info">
    <button class="info-btn" data-info="phonInfo">What is this?</button>
  <div id="phonInfo" class="info-panel" hidden>
    <h4>Phonology tab</h4>
    <p>Choose which tokens to analyse and (optionally) how to limit them, then pick a single view. Each token is normalised (diacritics stripped, final ς→σ) and syllabified by the maximal-onset principle; the segmental and syllabic views are derived from that single pass, so their numbers are mutually consistent.</p>
    <ul>
      <li><strong>Segments</strong>: frequencies, positional distribution inside the word, word-initial and word-final segments, bigram phonotactics, and the functional load of each segment contrast.</li>
      <li><strong>Syllable structure</strong>: shapes, cluster inventories, and the sonority contour of complex onsets, with the non-rising exceptions itemised.</li>
      <li><strong>Prosody and sandhi</strong>: weight by nature checked against weight by position (surfacing muta cum liquida and correption), and elision and hiatus at word boundaries in verse order.</li>
    </ul>
  </div>
  </div>

<div class="card">
  <h2>1. What to analyze</h2>
  <p class="help" style="margin-top:-.35rem;">Choose which tokens to analyse and (optionally) limit them, then run. For full control, open Advanced.</p>
  <div class="grid-3">
    <div class="field">
      <label for="phonAnalyze"><strong>Analyze</strong></label>
      <select id="phonAnalyze">
        <option value="form" selected>Word forms</option>
        <option value="lemma">Lemmata (distinct)</option>
      </select>
    </div>
    <div class="field">
      <label for="phonLimitPos"><strong>Part of speech</strong></label>
      <select id="phonLimitPos" disabled><option value="">(all)</option></select>
    </div>
    <div class="field" id="phonLimitCaseWrap" hidden>
      <label for="phonLimitCase"><strong>Case</strong></label>
      <select id="phonLimitCase"><option value="">(any)</option></select>
    </div>
    <div class="field">
      <label for="phonLimitWork"><strong>Work</strong></label>
      <select id="phonLimitWork" disabled><option value="">(all)</option></select>
    </div>
  </div>
  <div class="btn-row"><button id="btnRunPhon" class="btn btn-primary" disabled>Run analysis</button></div>

  <button class="adv-toggle btn btn-sm" data-adv="phonAdvPanel" style="margin-top:.5rem;">Advanced: custom SQL ▾</button>
  <div id="phonAdvPanel" class="adv-panel" hidden>
    <p class="help" style="margin-top:-.1rem;">A read-only query selecting the tokens to analyse; it must return at least one text column of word forms. <kbd>Ctrl/Cmd</kbd>+<kbd>Enter</kbd> runs.</p>
    <textarea id="phonSql" spellcheck="false">SELECT form, lemma FROM morphology;</textarea>
    <div id="phonSqlExamples" class="btn-row" style="margin-top:.45rem;flex-wrap:wrap;"></div>
    <div class="grid-3" style="margin-top:.5rem;">
      <div class="field"><label for="phonTokenCol"><strong>Token / form column</strong></label><select id="phonTokenCol" disabled></select></div>
    </div>
    <div class="btn-row"><button id="btnRunPhonSql" class="btn">Run custom SQL</button></div>
  </div>

  <pre id="phonStatus" class="status" style="margin-top:.6rem;">Waiting for corpus…</pre>
</div>

<div class="card">
  <h2>2. Phonological view</h2>
  <div class="view-picker">
    <div class="field">
      <label for="phonView"><strong>What to view</strong></label>
      <select id="phonView">
        <optgroup label="Segments">
          <option value="segments" selected>Segment frequencies</option>
          <option value="positions">Position within the word (initial / medial / final)</option>
          <option value="initials">Word-initial segments</option>
          <option value="finals">Word-final segments</option>
          <option value="bigrams">Bigram phonotactics</option>
          <option value="fload">Functional load</option>
        </optgroup>
        <optgroup label="Syllable structure">
          <option value="shapes">Syllable shape profile (CV / CVC …)</option>
          <option value="syllen">Syllables per word</option>
          <option value="complexity">Onset / coda complexity</option>
          <option value="onsets">Complex onsets</option>
          <option value="codas">Complex codas</option>
          <option value="sonority">Sonority sequencing in onsets</option>
          <option value="diphthongs">Diphthong distribution</option>
        </optgroup>
        <optgroup label="Prosody and sandhi">
          <option value="weight">Weight: nature vs position</option>
          <option value="elision">Elision in the verse</option>
          <option value="hiatus">Hiatus at word boundaries</option>
        </optgroup>
        <optgroup label="Data">
          <option value="table">Token-level phonology table</option>
        </optgroup>
      </select>
    </div>
    <div class="field" style="max-width:140px;">
      <label for="phonTopN"><strong>Top N</strong></label>
      <input id="phonTopN" type="text" value="24" />
    </div>
  </div>
  <p class="help" style="margin:.5rem 0 0; padding:.55rem .7rem; border:1px solid var(--acc2); border-radius:9px; background:var(--pgbg);">
    <strong>Note:</strong> the segmental and syllabic views are heuristic analyses over normalized orthography (letters as phoneme proxies, orthographic syllabification), not a reconstruction of Ancient Greek phonology. The views under “Prosody and sandhi” additionally read the corpus itself: the per-word metrical record and word order in the line.
  </p>
  <p id="phonViewDesc" class="help" style="margin-top:.2rem;"></p>
  <div id="phonSummary" class="analysis-wrap" style="margin-top:.4rem;"></div>
  <div class="viz-wrap" style="margin-top:.7rem;"><div id="phonChart"></div></div>
  <div id="phonTable" style="margin-top:.7rem;"></div>
</div>

  </div>
</section>
