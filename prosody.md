---
layout: default
title: Prosody
section: prosody
---

<div id="scanLoadStatus" class="load-progress"><span>Loading scansion corpus…</span></div>

<section class="panel" data-open="true">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Meter Search</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>
  <div class="panel-info">
    <button class="info-btn" data-info="prosodyInfo">What is this?</button>
  <div id="prosodyInfo" class="info-panel" hidden>
    <h4>Scansion tab</h4>
    <p>Scansion marks each syllable of a line as long or short and groups the syllables into feet, each a dactyl (¯ ˘ ˘) or a spondee (¯ ¯). Every word in the corpus carries its own metrical record: its syllable shape and the feet it occupies in the line. All of the views here are computed from that record.</p>
    <ul>
      <li><strong>Pick one view at a time</strong> from the drop-down: individual lines word by word, the commonest foot patterns, the dactyl/spondee balance by position, where a word or grammatical category falls in the verse, the commonest words at each foot, and the length profiles. The word box accepts Greek or English and suggests matching forms as you type.</li>
      <li><strong>Limit the scope</strong> to the <em>Iliad</em>, the <em>Odyssey</em>, or a single book before running.</li>
    </ul>
  </div>
  </div>

<div class="card">
  <h2>What to view</h2>
  <div class="view-picker">
    <div class="field">
      <label for="scanView"><strong>View</strong></label>
      <select id="scanView">
        <option value="line_scan" selected>Scan individual lines</option>
        <option value="lines_by_book">Lines per book</option>
        <option value="feet_patterns">Commonest foot patterns</option>
        <option value="foot_composition">Dactyl vs spondee by foot position</option>
        <option value="word_foot">Where a word falls in the line</option>
        <option value="foot_words">Commonest words by foot position</option>
        <option value="quantity">Long / short syllable profile</option>
        <option value="syllables">Syllables per line</option>
        <option value="words">Words per line</option>
        <option value="book_summary">Per-book summary table</option>
        <option value="lines_table">Browse scanned lines</option>
      </select>
    </div>
    <div class="field">
      <label for="scanWork"><strong>Work</strong></label>
      <select id="scanWork">
        <option value="" selected>Both poems</option>
        <option value="iliad">Iliad</option>
        <option value="odyssey">Odyssey</option>
      </select>
    </div>
    <div class="field">
      <label for="scanBook"><strong>Book</strong></label>
      <select id="scanBook" disabled><option value="">(all books)</option></select>
    </div>
    <div class="field" style="max-width:140px;">
      <label for="scanTopN"><strong>Top N</strong></label>
      <input id="scanTopN" type="text" value="15" />
    </div>
    <div class="field" id="scanLineWrap" style="max-width:150px;" hidden>
      <label for="scanLineFrom"><strong>From line</strong></label>
      <input id="scanLineFrom" type="text" value="1" />
    </div>
    <div class="field" id="scanWordWrap" hidden>
      <label for="scanWord"><strong>Word form</strong></label>
      <div class="combo">
        <input id="scanWord" type="text" autocomplete="off" spellcheck="false" placeholder="type Greek / English, or click to browse all forms…" />
        <div id="scanWordMenu" class="combo-menu" hidden></div>
      </div>
    </div>
    <div class="field" id="scanFootWrap" style="max-width:150px;" hidden>
      <label for="scanFoot"><strong>Foot</strong></label>
      <select id="scanFoot">
        <option value="1">Foot 1</option><option value="2">Foot 2</option><option value="3">Foot 3</option>
        <option value="4">Foot 4</option><option value="5">Foot 5</option><option value="6">Foot 6</option>
      </select>
    </div>
  </div>
  <div class="btn-row"><button id="btnRunScan" class="btn btn-primary" disabled>Show view</button></div>
  <details id="scanGrammar" class="adv" hidden style="margin-top:.4rem;">
    <summary><strong>Grammatical category</strong> (optional): restrict to words of a chosen part of speech and inflection</summary>
    <div class="feature-grid" style="margin-top:.5rem;">
      <div class="field"><label for="scanGPos">Part of speech</label>
        <select id="scanGPos"><option value="">(any)</option><option value="n">noun</option><option value="v">verb</option><option value="a">adjective</option><option value="p">pronoun</option><option value="d">adverb</option><option value="l">article</option><option value="r">preposition</option><option value="c">conjunction</option><option value="g">particle</option><option value="m">numeral</option><option value="i">interjection</option></select></div>
      <div class="field"><label for="scanGCase">Case</label>
        <select id="scanGCase"><option value="">(any)</option><option value="n">nominative</option><option value="g">genitive</option><option value="d">dative</option><option value="a">accusative</option><option value="v">vocative</option></select></div>
      <div class="field"><label for="scanGNumber">Number</label>
        <select id="scanGNumber"><option value="">(any)</option><option value="s">singular</option><option value="d">dual</option><option value="p">plural</option></select></div>
      <div class="field"><label for="scanGGender">Gender</label>
        <select id="scanGGender"><option value="">(any)</option><option value="m">masculine</option><option value="f">feminine</option><option value="n">neuter</option></select></div>
      <div class="field"><label for="scanGTense">Tense</label>
        <select id="scanGTense"><option value="">(any)</option><option value="p">present</option><option value="i">imperfect</option><option value="a">aorist</option><option value="r">perfect</option><option value="l">pluperfect</option><option value="f">future</option></select></div>
      <div class="field"><label for="scanGMood">Mood</label>
        <select id="scanGMood"><option value="">(any)</option><option value="i">indicative</option><option value="s">subjunctive</option><option value="o">optative</option><option value="m">imperative</option><option value="n">infinitive</option><option value="p">participle</option></select></div>
      <div class="field"><label for="scanGVoice">Voice</label>
        <select id="scanGVoice"><option value="">(any)</option><option value="a">active</option><option value="m">middle</option><option value="p">passive</option><option value="e">mediopassive</option></select></div>
      <div class="field"><label for="scanGPerson">Person</label>
        <select id="scanGPerson"><option value="">(any)</option><option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option></select></div>
    </div>
    <p class="help" style="margin:.35rem 0 0;">In <em>Where a word falls</em>, leave the word box empty and set a category to see the metrical position of that whole category. Grammar is read off each token's own analysis in the corpus.</p>
  </details>
  <p id="scanViewDesc" class="help" style="margin-top:.2rem;"></p>
  <div id="scanSummary" class="analysis-wrap" style="margin-top:.4rem;"></div>
  <div class="viz-wrap" style="margin-top:.7rem;"><div id="scanChart"></div></div>
  <div id="scanTable" style="margin-top:.7rem;"></div>
</div>

  </div>
</section>
