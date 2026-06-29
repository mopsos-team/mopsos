---
layout: default
title: How to Cite
section: cite
---

<section class="hero card">
  <h1>How to Cite</h1>
  <p class="lede">If you use MOPSOS in published or presented research, please cite the project as a conference presentation.</p>
</section>

<div class="card cite-page">
  <h2>Reference</h2>
  <p class="cite-text">Migliaretti, Elisa, Spiridon-Iosif Capotos, Zachary Fletcher, and Muhammad Rehan. 2026. &ldquo;MoPSoS: Introduction to the database of Ancient Greek morphology, prosody, syntax and scansion.&rdquo; Conference presentation, &ldquo;Epic through Numbers&rdquo; panel, Celtic Conference in Classics, 15 July 2026.</p>

  <div class="cite-bib-head">
    <h2>BibTeX</h2>
    <button id="copyBib" class="btn btn-sm" type="button">Copy</button>
  </div>
  <pre id="bibtex" class="cite-pre">@misc&#123;mopsos2026,
  author       = &#123;Migliaretti, Elisa and Capotos, Spiridon-Iosif and Fletcher, Zachary and Rehan, Muhammad&#125;,
  title        = &#123;&#123;MoPSoS: Introduction to the database of Ancient Greek morphology, prosody, syntax and scansion&#125;&#125;,
  year         = &#123;2026&#125;,
  month        = jul,
  howpublished = &#123;Conference presentation, ``Epic through Numbers'' panel, Celtic Conference in Classics&#125;,
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
