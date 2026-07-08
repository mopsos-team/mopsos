---
layout: default
title: Prosody
section: prosody
---

<div id="scanLoadStatus" class="load-progress"><span>Loading scansion corpus…</span></div>

<section class="panel">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Scanned Line Display</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>
  <div class="panel-info">
    <button class="info-btn" data-info="prosodyInfo">What is this?</button>
  <div id="prosodyInfo" class="info-panel" hidden>
    <h4>Scansion card</h4>
    <p>Scansion marks each syllable of a line as long or short and groups the syllables into feet, each a dactyl (¯ ˘ ˘) or a spondee (¯ ¯). Every word in the corpus carries its own metrical record: its syllable shape and the feet it occupies in the line.</p>
    <ul>
      <li><strong>Scan lines word by word</strong>: each word appears under its own metrical marks (¯ long, ˘ short), with the feet it occupies and the line's derived foot pattern. Pick a scope and click <em>Show view</em>.</li>
      <li><strong>Limit the scope</strong> to a single work, a book within it, and a verse or verse range (e.g. 1-5) before running.</li>
    </ul>
  </div>
  </div>

<div class="card">
  <div class="view-picker">
    <div class="field" hidden>
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
      <select id="scanWork"><option value="" selected>(all works)</option></select>
    </div>
    <div class="field" id="scanBookWrap" hidden>
      <label for="scanBook"><strong>Book</strong></label>
      <select id="scanBook"><option value="">(all books)</option></select>
    </div>
    <div class="field" id="scanVerseWrap" style="max-width:150px;" hidden>
      <label for="scanVerse"><strong>Verse(s)</strong></label>
      <input id="scanVerse" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. 212 or 212-415" />
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
  <div class="viz-wrap" style="margin-top:.7rem;"><div id="scanChart"></div></div>
  <div id="scanTable" style="margin-top:.7rem;"></div>
</div>

  </div>
</section>

<section class="panel">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Metrical Shape Search</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>
  <div class="panel-info">
    <button class="info-btn" data-info="psInfo">What is this?</button>
  <div id="psInfo" class="info-panel" hidden>
    <h4>Word search card</h4>
    <p>Every scanned token carries its own metrical record: its shape (H = heavy/long, L = light/short, one letter per syllable, so μῆνιν is HL), the foot it begins and ends in (1–6), and its position within those feet (1 = the princeps). This panel searches those records token by token and lists each match with all of them.</p>
    <ul>
      <li><strong>Scope</strong>: pick a work to reveal its books and a verse box that takes a single verse (212) or a range (212-415).</li>
      <li><strong>Metrical filters</strong>: type a shape (the menu narrows the attested shapes as you type, or click to browse), and pin the starting or ending foot and the position within it.</li>
      <li><strong>Word searches</strong>: <em>Lemma contains</em> and <em>Form contains</em> find parts of the word, accent-insensitively; <code>#abc</code> anchors the start, <code>abc#</code> the end, and a toggle switches both to regular expressions. <em>Exact lemma</em> pins down one dictionary form and offers the corpus lemma list as you type. All three accept Greek (accents optional), Beta Code, or English.</li>
      <li><strong>SQL</strong>: the controls write an ordinary read-only query you can inspect and edit by hand.</li>
    </ul>
  </div>
  </div>
<div class="card">
  <h2>1. Filter</h2>
  <p class="help" style="margin-top:-.35rem;">Find scanned words by scope, metrical record, lemma, or form. Choose any values and Apply; results are paginated.</p>
  <div class="grid-3">
    <div class="field">
      <label for="psLimitWork"><strong>Book / work</strong></label>
      <select id="psLimitWork"><option value="">(all works)</option></select>
    </div>
    <div class="field" id="psLimitBookWrap" hidden>
      <label for="psLimitBook"><strong>Book number</strong></label>
      <select id="psLimitBook"><option value="">(all books)</option></select>
    </div>
    <div class="field" id="psVerseWrap" hidden>
      <label for="psVerseRange"><strong>Verse(s)</strong></label>
      <input type="text" id="psVerseRange" autocomplete="off" spellcheck="false" placeholder="e.g. 212 or 212-415">
    </div>
  </div>
  <div class="grid-3">
    <div class="field">
      <label for="psShape"><strong>Metrical shape</strong></label>
      <div class="combo">
        <input type="text" id="psShape" autocomplete="off" spellcheck="false" placeholder="e.g. HLL; type to filter the attested shapes, or click to browse">
        <div id="psShapeMenu" class="combo-menu" hidden></div>
      </div>
    </div>
    <div class="field">
      <label for="psFootStart"><strong>Foot start</strong></label>
      <select id="psFootStart"><option value="">(any)</option></select>
    </div>
    <div class="field">
      <label for="psFootStartPos"><strong>Foot start position</strong></label>
      <select id="psFootStartPos"><option value="">(any)</option></select>
    </div>
  </div>
  <div class="grid-3">
    <div class="field">
      <label for="psFootEnd"><strong>Foot end</strong></label>
      <select id="psFootEnd"><option value="">(any)</option></select>
    </div>
    <div class="field">
      <label for="psFootEndPos"><strong>Foot end position</strong></label>
      <select id="psFootEndPos"><option value="">(any)</option></select>
    </div>
  </div>
  <hr />
  <div class="grid-3" style="margin-top:1rem;">
    <div class="field">
      <label for="psFormLike"><strong>Form contains</strong></label>
      <input type="text" id="psFormLike" autocomplete="off" spellcheck="false" placeholder="Greek (accents optional) or Beta Code, e.g. οιο or oio; #οιο = starts with, οιο# = ends with">
    </div>
    <div class="field">
      <label for="psLemmaLike"><strong>Lemma contains</strong></label>
      <input type="text" id="psLemmaLike" autocomplete="off" spellcheck="false" placeholder="Greek (accents optional) or Beta Code, e.g. δακτυλ or daktul; #δακτυλ = starts with, δακτυλ# = ends with">
    </div>
    <div class="field">
      <label for="psLemmaExact"><strong>Lemma matches exactly</strong></label>
      <div class="combo">
        <input type="text" id="psLemmaExact" autocomplete="off" spellcheck="false" placeholder="Greek (accents optional), Beta Code (rododaktulos), or English (finger); click to browse">
        <div id="psLemmaExactMenu" class="combo-menu" hidden></div>
      </div>
    </div>
  </div>
  <p class="help" style="margin:.3rem 0 0;"><code>#abc</code> searches the start of the word, <code>abc#</code> the end, and <code>#abc#</code> finds an exact sequence match. You can also use regular expressions to query forms and lemmas.
    <label class="regex-toggle" style="margin-left:.6rem;"><input type="checkbox" id="psRegex"> Regular expressions <span class="info-tip" tabindex="0" data-tip="Advanced: the two 'contains' boxes are read as JavaScript regular expressions and matched against the lowercase, accent-free form/lemma (final ς is σ), e.g. ^ζευγ.*μεναι$">&#9432;</span></label></p>
  <div class="btn-row">
    <button id="btnPsApply" class="btn btn-primary" disabled>Apply filter</button>
    <button id="btnPsReset" class="btn">Reset</button>
    <button class="adv-toggle btn" data-adv="psSqlPanel">🐉 SQL (for advanced users) ▾</button>
  </div>

  <div id="psSqlPanel" class="adv-panel" hidden>
    <p class="help">Read-only SQL over table <code>morphology</code>. Reserved-word columns are quoted, e.g. <code>WHERE "case" = 'g'</code>.</p>
    <textarea class="sqlInput" id="psSqlInput" spellcheck="false"></textarea>
    <div class="btn-row" style="margin-top:.5rem;">
      <button id="psSqlRun" class="btn btn-primary">Run</button>
    </div>
    <pre id="psSqlStatus" class="status" style="margin-top:.55rem;">Ready: write SQL and press Enter.</pre>
  </div>

  <div id="psResults" style="margin-top:.7rem;"></div>
</div>

  </div>
</section>
