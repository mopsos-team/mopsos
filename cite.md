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


<section class="panel">
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
    <li>Chamberlain, David. <em><a href="https://hypotactic.com/latin/index.html?Use_Id=about" target="_blank" rel="noopener">Greek and Latin Meter</a></em>.</li>
  </ul>

  <h2>Syntactic and morphological annotation</h2>
  <p class="cite-text">Per-word morphology (and the syntactic parses behind it) is taken from the openly published Ancient Greek dependency treebanks:</p>
  <ul class="cite-text" style="margin:.2rem 0 0 1.1rem;">
    <li>Celano, Giuseppe G. A., Gregory Crane, Bridget Almas, et al. <em><a href="https://perseusdl.github.io/treebank_data/" target="_blank" rel="noopener">The Ancient Greek and Latin Dependency Treebank</a></em>.</li>
  </ul>
</div>

  </div>
</section>


<section class="panel">
  <button class="panel-head" type="button" aria-expanded="false">
    <span class="panel-title">Download Data</span>
    <span class="panel-toggle">&rsaquo; Expand</span>
  </button>
  <div class="panel-body" hidden>

<div class="card cite-page">
  <h2>Repository</h2>
  <p class="cite-text">The complete corpus, the build scripts, and the site source are openly available on GitHub at <a href="https://github.com/mopsos-team/mopsos" target="_blank" rel="noopener">https://github.com/mopsos-team/mopsos</a>.</p>

  <h2>License</h2>
  <p class="cite-text">This corpus is licensed as <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.en" target="_blank" rel="noopener">CC BY-SA 4.0</a>. We strongly encourage others to use and reuse the data in their own projects.</p>

  <p class="cite-text">The code is provided as free and open-source software licensed under the GNU General Public License v3.0 (<a href="https://choosealicense.com/licenses/gpl-3.0/" target="_blank" rel="noopener">GNU GPLv3</a>).</p>
</div>

  </div>
</section>
