"""Canonical Greek text-normalization utilities for the build pipeline.

Mirrors assets/js/mopsos-text.js exactly (same algorithm, same table) so a
value computed here at build time and a value computed in the browser at
query time always agree. If you change one, change the other.

Two independent normalizations, for two different jobs:

  strip_diacritics(s) -> accent-and-breathing-insensitive SEARCH KEY.
    NFD-decomposes, drops every combining diacritical mark (accent,
    breathing, iota subscript/ypogegrammeni all live in one Unicode block,
    U+0300-U+036F), lowercases, folds final sigma to medial sigma, then
    drops anything left that is not a bare Greek letter. That last step is
    what makes it robust to non-combining leftovers from pre-Unicode
    transcription found in this corpus's source CSVs -- standalone spacing
    breathing marks (ʼ, ʽ), stray editorial marks such as "(*)" or
    "?", and a handful of legacy ASCII stand-ins (a bare "~" used for a
    circumflex, a spacing "´" used for an acute) that predate this data's
    conversion to Unicode -- without enumerating them by hand: if it is not
    one of α-ω, it is dropped. SQLite (as used here, via sql.js) has no
    built-in accent-insensitive collation, so a precomputed search-key
    column plus normalizing the query text the same way is the standard
    workaround: this column IS "ignore accents" for this database.

  to_beta_code(s) -> Beta Code transliteration (the Perseus/TLG ASCII
    scheme for Ancient Greek: e.g. "μῆνις" -> "mh=nis"), the fully
    accented ASCII representation -- NOT search-folded, kept exactly as
    written (including any of the legacy artifacts above; this column is a
    faithful transliteration, not a cleaned-up one, so review/fixes to the
    source data stay visible rather than silently papered over).
    Table ported (single-character entries only) from the character map in
    perseids-tools/beta-code-js (https://github.com/perseids-tools/beta-code-js,
    MIT License, (c) 2017) -- see that project for the general Beta Code ->
    Unicode direction and edge cases (this build only ever needs Unicode ->
    Beta Code, one direction).
"""

import re
import unicodedata

_COMBINING_RE = re.compile(r"[\u0300-\u036f]")
_GREEK_RANGE_RE = re.compile(r"[^\u03b1-\u03c9]")

# Unicode Greek (incl. precomposed accented/breathing forms) -> Beta Code.
# Do not hand-edit; regenerate from beta-code-js's
# vendor/beta-code-json/unicode_to_beta_code.json if that table changes.
UNICODE_TO_BETA = {
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
}


def strip_diacritics(s):
    """Accent/breathing/iota-subscript-insensitive lowercase search key."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFD", str(s))
    s = _COMBINING_RE.sub("", s)
    s = s.lower().replace("\u03c2", "\u03c3")
    return _GREEK_RANGE_RE.sub("", s)


def to_beta_code(s, custom_map=None):
    """Fully-accented Beta Code transliteration of a Greek string."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFC", str(s))
    m = UNICODE_TO_BETA
    if custom_map:
        m = dict(UNICODE_TO_BETA)
        m.update(custom_map)
    return "".join(m.get(ch, ch) for ch in s)
