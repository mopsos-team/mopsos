# MoPSoS

**Database of Ancient Greek Morphology, Phonology, Syntax, and Scansion**

MoPSoS is an open-access, client-hosted sqlite-based corpus tool for Archaic Greek hexameter poetry (Homer, *Iliad* and *Odyssey*; Hesiod, *Theogony* and *Works and Days*). It supports searches over linguistic sub-categories not encoded in comparable databases: morphemes, phonological and syllabic structure, syntactic relations, and meter.

Live site: **https://mopsos.org**

Work in progress; the text collection is under development.

## Architecture

- **Static Jekyll site** (Jekyll ~> 4.3), deployed to GitHub Pages with a custom domain (`CNAME`).
- **In-browser SQLite** via [sql.js](https://sql.js.org/) (WASM, loaded from jsDelivr). On first load, `assets/js/mopsos-shared.js` fetches `assets/data/corpus.sqlite.gz`, decompresses it, and opens it as a single shared read-only database (`window.MopsosSQL`). The decompressed bytes are cached in IndexedDB so subsequent visits skip the network fetch.
- **Client-side libraries** (CDN, see `_layouts/default.html`): sql.js 1.13.0, D3 v7, PapaParse 5.4.1, beta-code-js 3.1.0.
- Every analysis tab queries the same database, so all analyses are SQL-integrated, and each tab's advanced panel accepts read-only custom SQL (`SELECT` / `WITH` / `EXPLAIN` / `PRAGMA`).

### Shared foundation (`assets/js/mopsos-shared.js`)

Four globals used by every tab:

| Global | Role |
| --- | --- |
| `MopsosSQL` | The shared in-memory SQLite database (load, cache, read-only exec) |
| `MopsosUI` | Label dictionaries, pagination, info buttons, table rendering |
| `MopsosSearch` | The corpus word-search card (scope drop-downs, lemma/form search, SQL console, paged results) |
| `MopsosChart` | D3 chart helpers (bars, grouped/stacked, heatmap, scatter, histogram, force network) |

Load order: `papaparse -> sql-wasm.js -> d3 -> mopsos-shared.js -> page script`.

## Pages

| Page | Script | What it does |
| --- | --- | --- |
| `index.html` | (inline) | Landing page |
| `morphology.html` | `morphology-standalone.js` | Form/lemma search with per-POS morphological feature filters, and compounding and infinitive information |
| `phonology.md` | `phonology.js` | Segment frequencies and positional distributions, bigram phonotactics, functional load, syllable shapes and cluster inventories, sonority contours, weight by nature vs. position, elision and hiatus (work in progress) |
| `syntax.md` | `syntax.js` | Dependency-based syntactic search over the treebank annotation (work in progress) |
| `prosody.md` | `prosody.js` | Word-by-word line scansion (¯ / ˘, feet), foot-pattern frequencies, dactyl vs. spondee by position, word localization in the line, per-book summaries |
| `morphotactics.md` | `morphotactics.js` | Nominal compound search (by member, member category, or work, with metrical localization), infinitive tense/voice inventories with per-verb lookup, POS transition matrices, feature co-occurrence, paradigm slot fill rates |
| `clustering.md` | `clustering.js` | Stylometry: cluster works, authors, lemmata, forms, or grammatical categories by frequency profiles, with configurable feature model, distance metric, method, and k |
| `cite.md` | | Citation, sources, and data download |

Greek search inputs accept polytonic Greek (accents optional), and Beta Code; `#x` anchors a match to the start of the word, `x#` to the end.

## Repository layout

```
_config.yml             Jekyll config (see the exclude list; comments explain why)
_layouts/default.html   Shared shell: nav, CDN scripts, panel/info-button wiring
index.html              Landing page
*.md / morphology.html  One file per analysis tab
assets/css/style.css    All styling
assets/js/              Shared foundation + one script per tab
assets/data/
  corpus.sqlite.gz      The built database the site actually fetches
  morphology/           Source CSV (per-token morphological annotation)
  ncompounds/           Compound analyses and attestations
  scansion/             Per-work line/word/syllable scansion CSVs (build sources)
scripts/
  build_corpus.py       CSV -> corpus.sqlite.gz builder (stdlib only)
  greek_text.py         Canonical normalization (mirrors mopsos-text.js exactly)
  parse_hypotactic.py   Re-parse hypotactic.com HTML into the line/word schema
```

## Local development

```bash
bundle install
bundle exec jekyll serve
# open http://localhost:4000
```

Requires Ruby with Bundler.

## Rebuilding the database

The site fetches only `assets/data/corpus.sqlite.gz`; the CSVs under `assets/data/` are build sources. To regenerate the database after changing a source CSV:

```bash
python3 scripts/build_corpus.py
```

Stdlib only (csv, sqlite3, gzip). The builder is config-driven: each table is one dict in `TABLES` (column selection, coercions, indexes, derived columns), each summary is one SQL view in `VIEWS`. Notes:

- **Derived search keys.** SQLite (as shipped in sql.js) has no accent-insensitive Unicode collation, so accent-insensitive search is a precomputed column (`strip_diacritics` in `scripts/greek_text.py`) plus identical query-side normalization in `assets/js/mopsos-text.js`. The two implementations mirror each other exactly; if you change one, change the other.

`scripts/parse_hypotactic.py` documents the scansion provenance: syllable quantities were scraped from hypotactic.com and re-parsed into the line/word schema (greedy hexameter parse; long + short short = dactyl, long + long = spondee).

## Deployment

Deployed via GitHub Actions to GitHub Pages (`mopsos.org`).

## Data sources

- **Scansion:** Chamberlain, David. "A Reading of Homer (Work in Progress)." *Greek and Roman Verse* (hypotactic.com), re-parsed into the MoPSoS schema.
- **Morphology and syntax:** the openly published Ancient Greek dependency treebanks: the Ancient Greek and Latin Dependency Treebank (Celano, Crane, Almas, et al.), Gorman Trees, Harrington Trees, Daphne Trees (Mambrini), and Pedalion Trees (Van Hal and Keersmaekers).
- **Transliteration:** [perseids-tools/beta-code-js](https://github.com/perseids-tools/beta-code-js) (MIT).

## Citation

> Migliaretti, Elisa, Spiridon-Iosif Capotos, Zachary Fletcher, and Muhammad Rehan. 2026. "MoPSoS: Introduction to the database of Ancient Greek morphology, prosody, syntax and scansion." Conference presentation, Celtic Conference in Classics, 15 July 2026.

```bibtex
@misc{mopsos2026,
  author       = {Migliaretti, Elisa and Capotos, Spiridon-Iosif and Fletcher, Zachary and Rehan, Muhammad},
  title        = {{MoPSoS: Introduction to the database of Ancient Greek morphology, prosody, syntax and scansion}},
  year         = {2026},
  month        = jul,
  howpublished = {Conference presentation, Celtic Conference in Classics},
  note         = {Presented 15 July 2026}
}
```
