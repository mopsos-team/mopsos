---
layout: default
title: Prosody
section: prosody
---

<section class="hero card">
  <p class="kicker">MOPSOS</p>
  <h1>Scansion</h1>
  <p class="tab-desc">Analyse the metre of Homeric hexameter — scan lines into feet, profile syllable quantities, and measure rhythm across the Iliad and Odyssey — all computed live with SQL and drawn with D3.</p>
  <div class="tab-meta-row">
    <button class="info-btn" data-info="prosodyInfo">What is this?</button>
  </div>
  <div id="prosodyInfo" class="info-panel" hidden>
    <h4>Scansion tab</h4>
    <p>Scansion is the analysis of a line's metrical structure — marking which syllables are long and which are short, and grouping them into feet. Every Homeric line in the corpus has been scanned into its six hexameter feet (table <code>scansion_lines</code>), where each foot is either a dactyl (<code>LSS</code>, — ‿ ‿) or a spondee (<code>LL</code>, — —).</p>
    <ul>
      <li><strong>Pick one view at a time</strong> from the drop-down — lines per book, the commonest foot patterns, dactyl/spondee balance by position, the long/short profile, line length, speech vs. narrative, and more.</li>
      <li><strong>Limit the scope</strong> to the Iliad, the Odyssey, or a single book before running.</li>
    </ul>
    <p>Quantity reflects syllable weight (a syllable closed by a consonant or containing a long vowel/diphthong is heavy/long); feet are the recurring rhythmic units of the verse.</p>
  </div>
</section>

<div id="scanLoadStatus" class="load-progress"><span>Loading scansion corpus…</span></div>

<div class="card">
  <h2>What to view</h2>
  <div class="view-picker">
    <div class="field">
      <label for="scanView"><strong>View</strong></label>
      <select id="scanView">
        <option value="lines_by_book" selected>Lines per book</option>
        <option value="feet_patterns">Commonest foot patterns</option>
        <option value="foot_composition">Dactyl vs spondee by foot position</option>
        <option value="quantity">Long / short syllable profile</option>
        <option value="syllables">Syllables per line</option>
        <option value="words">Words per line</option>
        <option value="speech">Speech vs narrative</option>
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
  </div>
  <div class="btn-row"><button id="btnRunScan" class="btn btn-primary" disabled>Show view</button></div>
  <p id="scanViewDesc" class="help" style="margin-top:.2rem;"></p>
  <div id="scanSummary" class="analysis-wrap" style="margin-top:.4rem;"></div>
  <div class="viz-wrap" style="margin-top:.7rem;"><div id="scanChart"></div></div>
  <div id="scanTable" style="margin-top:.7rem;"></div>
</div>
