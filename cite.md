---
layout: default
title: About
section: cite
---


<section class="panel">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">How to Cite</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>

<div class="card cite-page">
  <h2>1. Reference</h2>
  <p class="cite-text">Migliaretti, Elisa, Spiridon-Iosif Capotos, Zachary Fletcher, and Muhammad Rehan. 2026. &ldquo;MoPSoS: Introduction to the database of Ancient Greek morphology, prosody, syntax and scansion.&rdquo; Conference presentation, Celtic Conference in Classics, 15 July 2026.</p>

  <div class="cite-bib-head">
    <h2>2. BibTeX</h2>
    <button id="copyBib" class="btn btn-sm" type="button">Copy</button>
  </div>
  <pre id="bibtex" class="cite-pre">@misc&#123;mopsos2026,
  author       = &#123;Migliaretti, Elisa and Capotos, Spiridon-Iosif and Fletcher, Zachary and Rehan, Muhammad&#125;,
  title        = &#123;&#123;MoPSoS: Introduction to the database of Ancient Greek morphology, prosody, syntax and scansion&#125;&#125;,
  year         = &#123;2026&#125;,
  month        = jul,
  howpublished = &#123;Conference presentation, Celtic Conference in Classics&#125;,
  note         = &#123;Presented 15 July 2026&#125;
&#125;</pre>
</div>

{% raw %}
<script>
  (function () {
    var b = document.getElementById("copyBib");
    var pre = document.getElementById("bibtex");
    if (!b || !pre) return;
    b.addEventListener("click", function () {
      var text = pre.textContent;
      function done() { b.textContent = "Copied!"; setTimeout(function () { b.textContent = "Copy"; }, 1400); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          var r = document.createRange(); r.selectNodeContents(pre);
          var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        });
      } else {
        var r = document.createRange(); r.selectNodeContents(pre);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        try { document.execCommand("copy"); done(); } catch (e) {}
      }
    });
  })();
</script>
{% endraw %}

  </div>
</section>


<section class="panel" data-open="true">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Sources</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>

<div class="card cite-page">
  <h2>Texts</h2>
  <p class="cite-text">The corpus covers the Archaic Greek hexameter tradition: Homer, <em>Iliad</em> and <em>Odyssey</em>, and Hesiod, <em>Theogony</em> and <em>Works and Days</em>.</p>

  <h2>Scansion and metre</h2>
  <p class="cite-text">Syllable quantities and the hexameter foot parse are drawn from <a href="https://hypotactic.com" target="_blank" rel="noopener">Hypotactic</a>, re-parsed into the MoPSoS line and word schema.</p>
  <ul class="cite-text" style="margin:.2rem 0 0 1.1rem;">
    <li>Chamberlain, David. &ldquo;A Reading of Homer (Work in Progress).&rdquo; <em>Greek and Roman Verse</em>. June 17, 2025.</li>
  </ul>

  <h2>Syntactic and morphological annotation</h2>
  <p class="cite-text">Per-word morphology (and the syntactic parses behind it) is taken from the openly published Ancient Greek dependency treebanks:</p>
  <ul class="cite-text" style="margin:.2rem 0 0 1.1rem;">
    <li>Celano, Giuseppe G. A., Gregory Crane, Bridget Almas, et al. <em>The Ancient Greek and Latin Dependency Treebank</em>.</li>
    <li>Gorman, Vanessa. <em>Gorman Trees</em>.</li>
    <li>Harrington, J. Matthew. <em>Harrington Trees</em>.</li>
    <li>Mambrini, Francesco. <em>Daphne Trees</em>.</li>
    <li>Van Hal, Toon, &amp; Alek Keersmaekers. <em>Pedalion Trees</em>.</li>
  </ul>

  <h2>Transliteration</h2>
  <p class="cite-text">Beta Code conversion uses <a href="https://github.com/perseids-tools/beta-code-js" target="_blank" rel="noopener">perseids-tools/beta-code-js</a> (MIT License).</p>

  <p class="help" style="margin-top:1rem;">Full provenance and per-file licensing are documented in the repository (see Download Data).</p>
</div>

  </div>
</section>


<section class="panel" data-open="true">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Download Data</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>

<div class="card cite-page">
  <h2>Repository</h2>
  <p class="cite-text">The complete corpus, the build scripts, and the site source are openly available on GitHub. The built database (<code>corpus.sqlite.gz</code>) that powers every search on this site lives under <code>assets/data/</code>.</p>

  <p class="cite-links" style="margin:.8rem 0 .3rem;">
    <a class="btn btn-primary" href="https://github.com/mopsos-team/mopsos" target="_blank" rel="noopener">Open the GitHub repository &rarr;</a>
  </p>
  <p class="cite-text"><code>https://github.com/mopsos-team/mopsos</code></p>
</div>

  </div>
</section>
