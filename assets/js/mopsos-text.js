/* ============================================================================
 *  MOPSOS TEXT — canonical Greek text-normalization utilities.
 *  Shared, dependency-free for search keys (no MopsosSQL/MopsosUI needed),
 *  safe to load on any page. Two independent normalizations, for two jobs:
 *
 *    stripDiacritics(s)  -> accent-and-breathing-insensitive SEARCH KEY.
 *      NFD-decomposes, drops every combining diacritical mark (accent,
 *      breathing, iota subscript/ypogegrammeni all live in one Unicode block,
 *      U+0300-U+036F), lowercases, folds final sigma to medial sigma, then
 *      drops anything left that isn't a bare Greek letter. That last step is
 *      what makes it robust to non-combining leftovers from pre-Unicode
 *      transcription in the source data (standalone spacing breathing marks
 *      like ʼ/ʽ, stray editorial marks such as (*) or ?) without
 *      enumerating them by hand: if it isn't one of a-ω, it's gone.
 *      This is the same routine already duplicated (slightly differently)
 *      across morphotactics.js/clustering.js/phonology.js/prosody.js/etc.;
 *      new code should call MopsosText.stripDiacritics() instead of adding
 *      yet another copy. Existing copies are left as-is.
 *
 *    toBetaCode(s) -> Beta Code transliteration (Perseus/TLG ASCII scheme),
 *      the fully-accented ASCII representation, NOT search-folded. Delegates
 *      to the beta-code-js library (perseids-tools), loaded from the CDN in
 *      _layouts/default.html as the window.BetaCode global; no transliteration
 *      table lives in this repo. scripts/greek_text.py delegates the same job
 *      to that project's Python package (beta-code) for the build pipeline.
 *      If the library is not loaded, toBetaCode returns "" and the search
 *      boxes simply lose their Beta Code hints.
 *
 *  Also: hasGreek(), looseBetaKey() — small helpers the adaptive search box
 *  uses to decide how to interpret what someone typed (Greek text vs. plain
 *  ASCII/Beta Code) and to compare Beta Code loosely (diacritic symbols
 *  stripped), the ASCII-side equivalent of stripDiacritics().
 * ========================================================================== */
(function () {
  function stripDiacritics(x) {
    return String(x == null ? "" : x).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\u03c2/g, "\u03c3").replace(/[^\u03b1-\u03c9]/g, "");
  }

  function toBetaCode(x) {
    if (x == null || x === "") return "";
    var B = window.BetaCode;
    if (!B || typeof B.greekToBetaCode !== "function") return "";
    return B.greekToBetaCode(String(x));
  }

  // Beta Code with its diacritic/annotation symbols stripped and case-folded
  // -- the ASCII-side analogue of stripDiacritics(), for loosely matching a
  // typed, accentless ASCII guess (e.g. "menis") against a precomputed
  // _beta column (e.g. "mh=nis") the same way stripDiacritics() lets an
  // accentless Greek guess match an accented Greek column.
  function looseBetaKey(beta) {
    return String(beta == null ? "" : beta).toLowerCase().replace(/[^a-z]/g, "");
  }

  // Does the string contain any Greek-block characters (basic or extended)?
  // Used to decide whether typed input should be treated as Greek (match via
  // stripDiacritics) or as plain ASCII/Beta Code (match via looseBetaKey).
  function hasGreek(s) {
    return /[\u0370-\u03ff\u1f00-\u1fff]/.test(String(s == null ? "" : s));
  }

  window.MopsosText = { stripDiacritics: stripDiacritics, toBetaCode: toBetaCode,
    looseBetaKey: looseBetaKey, hasGreek: hasGreek };
})();
