# MoPSoS

**Database of Ancient Greek Morphology, Phonology, Syntax, and Scansion**

MoPSoS is an open-access, client-hosted sqlite-based corpus tool for Ancient Greek hexameter poetry (Homer, *Iliad* and *Odyssey*; Hesiod, *Theogony* and *Works and Days*). It supports searches over linguistic sub-categories not encoded in comparable databases: morphemes, phonological and syllabic structure, syntactic relations, and meter.

Live site: **https://mopsos.org**

Work in progress; the text collection is under development.

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

## Architecture

- **Static Jekyll site** (Jekyll ~> 4.3), deployed to GitHub Pages with a custom domain.
- **In-browser SQLite** via [sql.js](https://sql.js.org/) (WASM, loaded from jsDelivr). On first load, `assets/js/mopsos-shared.js` fetches `assets/data/corpus.sqlite.gz`, decompresses it, and opens it as a single shared read-only database (`window.MopsosSQL`). The decompressed bytes are cached in IndexedDB so subsequent visits skip the network fetch.
- Every analysis tab queries the same database, so all analyses are SQL-integrated, and each tab's advanced panel accepts read-only custom SQL (`SELECT` / `WITH` / `EXPLAIN` / `PRAGMA`).

## Local development

**Requirements**

Most modern version of Ruby should work. Development was done with Ruby 3.4.4 on
macOS 26.5.

**How to start the server**

```bash
bundle install
bundle exec jekyll serve
```

## Rebuilding the database

**Requirements**

Any version of Python 3 should work, as long as it has the `sqlite3` library in the Standard Library.
Development was done with Python 3.8.16 on macOS 26.5.

**How to Build**

The site fetches only `assets/data/corpus.sqlite.gz`; the CSVs under `assets/data/` are build sources. To regenerate the database after changing a source CSV:

```bash
python3 scripts/build_corpus.py
```
## Deployment

Deployed via GitHub Pages.

## Data sources

- **Scansion:** Chamberlain, David. "A Reading of Homer (Work in Progress)." *Greek and Roman Verse* (hypotactic.com), re-parsed into the MoPSoS schema.
- **Morphology and syntax:** the openly published Ancient Greek dependency treebanks: the Ancient Greek and Latin Dependency Treebank (Celano, Crane, Almas, et al.), Gorman Trees, Harrington Trees, Daphne Trees (Mambrini), and Pedalion Trees (Van Hal and Keersmaekers).

## Licenses

The code is licensed under the GNU General Public License v3.0 ([GNU GPLv3](https://choosealicense.com/licenses/gpl-3.0/)).

The data are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.en).
