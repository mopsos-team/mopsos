"""Canonical Greek text-normalization utilities for the build pipeline.

Mirrors assets/js/mopsos-text.js (same behavior) so a value computed here at
build time and a value computed in the browser at query time always agree.
If you change one, change the other.

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
    accented ASCII representation -- NOT search-folded. Delegates to the
    beta-code package (perseids-tools/beta-code-py,
    https://github.com/perseids-tools/beta-code-py; `pip install beta-code`);
    no transliteration table lives in this repo. The browser side delegates
    the same job to that project's JS library (beta-code-js, loaded from the
    CDN in _layouts/default.html as the window.BetaCode global). The import
    is lazy, so the build pipeline (which only uses strip_diacritics)
    remains stdlib-only; beta-code is needed only if to_beta_code is
    actually called.
"""

import re
import unicodedata

_COMBINING_RE = re.compile(r"[\u0300-\u036f]")
_GREEK_RANGE_RE = re.compile(r"[^\u03b1-\u03c9]")


def strip_diacritics(s):
    """Accent/breathing/iota-subscript-insensitive lowercase search key."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFD", str(s))
    s = _COMBINING_RE.sub("", s)
    s = s.lower().replace("\u03c2", "\u03c3")
    return _GREEK_RANGE_RE.sub("", s)


def to_beta_code(s):
    """Fully-accented Beta Code transliteration of a Greek string.

    Thin wrapper around beta_code.greek_to_beta_code from the beta-code
    package (pip install beta-code).
    """
    if s is None or s == "":
        return ""
    import beta_code  # lazy: keeps the build pipeline stdlib-only
    return beta_code.greek_to_beta_code(str(s))
