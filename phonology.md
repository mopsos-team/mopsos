---
layout: default
title: Phonology
section: phonology
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Phonology <span class="wip-badge" title="Under construction">🚧 under construction</span></h1>
  <p class="tab-desc">Phonological structure of the corpus: phoneme inventory, syllable shapes, onset/coda clusters, diphthongs, vowel quantity, sonority and alliteration, across any set of tokens you choose.</p>
  <div class="tab-meta-row">
    <button class="info-btn" data-info="phonInfo">What is this?</button>
  </div>
  <div id="phonInfo" class="info-panel" hidden>
    <h4>Phonology tab</h4>
    <p>Choose which tokens to analyse and (optionally) how to limit them, then pick a single view from the drop-down. Each token is normalised (diacritics stripped, final ς→σ) and given a rule-based orthographic syllabification by the maximal-onset principle; every statistic is derived from those structured syllables.</p>
    <ul>
      <li><strong>Flexible scope</strong>: analyse all forms, just verbs, only genitive nouns, lemmata, and more.</li>
      <li><strong>One view at a time</strong>: use “What to view” to switch between phoneme, syllable, cluster, quantity, sonority and alliteration analyses.</li>
    </ul>
  </div>
</section>

<div id="phonLoadingBar" class="load-progress"><span>Loading corpus…</span></div>

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
    <textarea id="phonSql" spellcheck="false" data-nl2sql data-nl2sql-run="btnRunPhonSql">SELECT form, lemma FROM morphology;</textarea>
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
        <option value="phonemes" selected>Normalized letter / phoneme-proxy distribution</option>
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
  <p class="help" style="margin:.5rem 0 0; padding:.55rem .7rem; border:1px solid var(--gold); border-radius:9px; background:rgba(194,161,78,.1);">
    <strong>Note:</strong> these are heuristic analyses derived from normalized orthography, not a full reconstruction of Ancient Greek phonology. Letters stand in as proxies for phonemes, and syllabification follows orthographic rules rather than reconstructed pronunciation.
  </p>
  <p id="phonViewDesc" class="help" style="margin-top:.2rem;"></p>
  <div id="phonSummary" class="analysis-wrap" style="margin-top:.4rem;"></div>
  <div class="viz-wrap" style="margin-top:.7rem;"><div id="phonChart"></div></div>
  <div id="phonTable" style="margin-top:.7rem;"></div>
</div>
