/* ============================================================================
 *  MOPSOS TEXT — canonical Greek text-normalization utilities.
 *  Shared, dependency-free (no MopsosSQL/MopsosUI needed), safe to load on
 *  any page. Two independent normalizations, for two different jobs:
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
 *      the fully-accented ASCII representation, NOT search-folded. Ported
 *      from the character table in perseids-tools/beta-code-js (MIT
 *      licensed); see https://github.com/perseids-tools/beta-code-js and
 *      the "What is Beta Code" note in scripts/greek_text.py, which carries
 *      the same table for the Python build pipeline. Keep both in sync.
 *
 *  Also: hasGreek(), looseBetaKey() — small helpers the adaptive search box
 *  uses to decide how to interpret what someone typed (Greek text vs. plain
 *  ASCII/Beta Code) and to compare Beta Code loosely (diacritic symbols
 *  stripped), the ASCII-side equivalent of stripDiacritics().
 * ========================================================================== */
(function () {
  // Unicode Greek (incl. precomposed accented/breathing forms) -> Beta Code.
  // Ported verbatim (single-character entries only) from beta-code-js's
  // vendor/beta-code-json/unicode_to_beta_code.json. MIT License, (c) 2017
  // perseids-tools. Do not hand-edit; regenerate from that file if it changes.
  var UNICODE_TO_BETA = {
  ",": ",",
  "-": "-",
  ".": ".",
  ";": ";",
  "`": "\\",
  "·": ":",
  "ʹ": "#",
  "ʼ": ")",
  "ʽ": "(",
  "Ά": "*/a",
  "Έ": "*/e",
  "Ή": "*/h",
  "Ί": "*/i",
  "Ό": "*/o",
  "Ύ": "*/u",
  "Ώ": "*/w",
  "ΐ": "i/+",
  "Α": "*a",
  "Β": "*b",
  "Γ": "*g",
  "Δ": "*d",
  "Ε": "*e",
  "Ζ": "*z",
  "Η": "*h",
  "Θ": "*q",
  "Ι": "*i",
  "Κ": "*k",
  "Λ": "*l",
  "Μ": "*m",
  "Ν": "*n",
  "Ξ": "*c",
  "Ο": "*o",
  "Π": "*p",
  "Ρ": "*r",
  "Σ": "*s",
  "Τ": "*t",
  "Υ": "*u",
  "Φ": "*f",
  "Χ": "*x",
  "Ψ": "*y",
  "Ω": "*w",
  "Ϊ": "*+i",
  "Ϋ": "*+u",
  "ά": "a/",
  "έ": "e/",
  "ή": "h/",
  "ί": "i/",
  "ΰ": "u/+",
  "α": "a",
  "β": "b",
  "γ": "g",
  "δ": "d",
  "ε": "e",
  "ζ": "z",
  "η": "h",
  "θ": "q",
  "ι": "i",
  "κ": "k",
  "λ": "l",
  "μ": "m",
  "ν": "n",
  "ξ": "c",
  "ο": "o",
  "π": "p",
  "ρ": "r",
  "ς": "s",
  "σ": "s",
  "τ": "t",
  "υ": "u",
  "φ": "f",
  "χ": "x",
  "ψ": "y",
  "ω": "w",
  "ϊ": "i+",
  "ϋ": "u+",
  "ό": "o/",
  "ύ": "u/",
  "ώ": "w/",
  "ϲ": "s3",
  "Ϲ": "*s3",
  "ἀ": "a)",
  "ἁ": "a(",
  "ἂ": "a)\\",
  "ἃ": "a(\\",
  "ἄ": "a)/",
  "ἅ": "a(/",
  "ἆ": "a)=",
  "ἇ": "a(=",
  "Ἀ": "*)a",
  "Ἁ": "*(a",
  "Ἂ": "*)\\a",
  "Ἃ": "*(\\a",
  "Ἄ": "*)/a",
  "Ἅ": "*(/a",
  "Ἆ": "*)=a",
  "Ἇ": "*(=a",
  "ἐ": "e)",
  "ἑ": "e(",
  "ἒ": "e)\\",
  "ἓ": "e(\\",
  "ἔ": "e)/",
  "ἕ": "e(/",
  "Ἐ": "*)e",
  "Ἑ": "*(e",
  "Ἒ": "*)\\e",
  "Ἓ": "*(\\e",
  "Ἔ": "*)/e",
  "Ἕ": "*(/e",
  "ἠ": "h)",
  "ἡ": "h(",
  "ἢ": "h)\\",
  "ἣ": "h(\\",
  "ἤ": "h)/",
  "ἥ": "h(/",
  "ἦ": "h)=",
  "ἧ": "h(=",
  "Ἠ": "*)h",
  "Ἡ": "*(h",
  "Ἢ": "*)\\h",
  "Ἣ": "*(\\h",
  "Ἤ": "*)/h",
  "Ἥ": "*(/h",
  "Ἦ": "*)=h",
  "Ἧ": "*(=h",
  "ἰ": "i)",
  "ἱ": "i(",
  "ἲ": "i)\\",
  "ἳ": "i(\\",
  "ἴ": "i)/",
  "ἵ": "i(/",
  "ἶ": "i)=",
  "ἷ": "i(=",
  "Ἰ": "*)i",
  "Ἱ": "*(i",
  "Ἲ": "*)\\i",
  "Ἳ": "*(\\i",
  "Ἴ": "*)/i",
  "Ἵ": "*(/i",
  "Ἶ": "*)=i",
  "Ἷ": "*(=i",
  "ὀ": "o)",
  "ὁ": "o(",
  "ὂ": "o)\\",
  "ὃ": "o(\\",
  "ὄ": "o)/",
  "ὅ": "o(/",
  "Ὀ": "*)o",
  "Ὁ": "*(o",
  "Ὂ": "*)\\o",
  "Ὃ": "*(\\o",
  "Ὄ": "*)/o",
  "Ὅ": "*(/o",
  "ὐ": "u)",
  "ὑ": "u(",
  "ὒ": "u)\\",
  "ὓ": "u(\\",
  "ὔ": "u)/",
  "ὕ": "u(/",
  "ὖ": "u)=",
  "ὗ": "u(=",
  "Ὑ": "*(u",
  "Ὓ": "*(\\u",
  "Ὕ": "*(/u",
  "Ὗ": "*(=u",
  "ὠ": "w)",
  "ὡ": "w(",
  "ὢ": "w)\\",
  "ὣ": "w(\\",
  "ὤ": "w)/",
  "ὥ": "w(/",
  "ὦ": "w)=",
  "ὧ": "w(=",
  "Ὠ": "*)w",
  "Ὡ": "*(w",
  "Ὢ": "*)\\w",
  "Ὣ": "*(\\w",
  "Ὤ": "*)/w",
  "Ὥ": "*(/w",
  "Ὦ": "*)=w",
  "Ὧ": "*(=w",
  "ὰ": "a\\",
  "ὲ": "e\\",
  "ὴ": "h\\",
  "ὶ": "i\\",
  "ὸ": "o\\",
  "ὺ": "u\\",
  "ὼ": "w\\",
  "ᾀ": "a)|",
  "ᾁ": "a(|",
  "ᾂ": "a)\\|",
  "ᾃ": "a(\\|",
  "ᾄ": "a)/|",
  "ᾅ": "a(/|",
  "ᾆ": "a)=|",
  "ᾇ": "a(=|",
  "ᾈ": "*)a|",
  "ᾉ": "*(a|",
  "ᾊ": "*)\\a|",
  "ᾋ": "*(\\a|",
  "ᾌ": "*)/a|",
  "ᾍ": "*(/a|",
  "ᾎ": "*)=a|",
  "ᾏ": "*(=a|",
  "ᾐ": "h)|",
  "ᾑ": "h(|",
  "ᾒ": "h)\\|",
  "ᾓ": "h(\\|",
  "ᾔ": "h)/|",
  "ᾕ": "h(/|",
  "ᾖ": "h)=|",
  "ᾗ": "h(=|",
  "ᾘ": "*)h|",
  "ᾙ": "*(h|",
  "ᾚ": "*)\\h|",
  "ᾛ": "*(\\h|",
  "ᾜ": "*)/h|",
  "ᾝ": "*(/h|",
  "ᾞ": "*)=h|",
  "ᾟ": "*(=h|",
  "ᾠ": "w)|",
  "ᾡ": "w(|",
  "ᾢ": "w)\\|",
  "ᾣ": "w(\\|",
  "ᾤ": "w)/|",
  "ᾥ": "w(/|",
  "ᾦ": "w)=|",
  "ᾧ": "w(=|",
  "ᾨ": "*)w|",
  "ᾩ": "*(w|",
  "ᾪ": "*)\\w|",
  "ᾫ": "*(\\w|",
  "ᾬ": "*)/w|",
  "ᾭ": "*(/w|",
  "ᾮ": "*)=w|",
  "ᾯ": "*(=w|",
  "ᾲ": "a\\|",
  "ᾳ": "a|",
  "ᾴ": "a/|",
  "ᾶ": "a=",
  "ᾷ": "a=|",
  "Ὰ": "*\\a",
  "ᾼ": "*a|",
  "᾽": "'",
  "ῂ": "h\\|",
  "ῃ": "h|",
  "ῄ": "h/|",
  "ῆ": "h=",
  "ῇ": "h=|",
  "Ὲ": "*\\e",
  "Ὴ": "*\\h",
  "ῌ": "*h|",
  "ῒ": "i\\+",
  "ῖ": "i=",
  "ῗ": "i=+",
  "Ὶ": "*\\i",
  "ῢ": "u\\+",
  "ῤ": "r)",
  "ῥ": "r(",
  "ῦ": "u=",
  "ῧ": "u=+",
  "Ὺ": "*\\u",
  "Ῥ": "*(r",
  "ῲ": "w\\|",
  "ῳ": "w|",
  "ῴ": "w/|",
  "ῶ": "w=",
  "ῷ": "w=|",
  "Ὸ": "*\\o",
  "Ὼ": "*\\w",
  "ῼ": "*w|",
  "—": "_"
};

  function stripDiacritics(x) {
    return String(x == null ? "" : x).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\u03c2/g, "\u03c3").replace(/[^\u03b1-\u03c9]/g, "");
  }

  function toBetaCode(x, customMap) {
    var s = String(x == null ? "" : x).normalize("NFC");
    var map = UNICODE_TO_BETA;
    if (customMap) {
      map = {};
      for (var k in UNICODE_TO_BETA) map[k] = UNICODE_TO_BETA[k];
      for (var k2 in customMap) map[k2] = customMap[k2];
    }
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      out.push(Object.prototype.hasOwnProperty.call(map, ch) ? map[ch] : ch);
    }
    return out.join("");
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
