# MoPSoS

**Database of Ancient Greek Morphology, Phonology, Syntax, and Scansion**

MoPSoS is an open-access database of Ancient Greek texts. It supports searches over
linguistic sub-categories not encoded in comparable databases: morphemes, phonological
and syllabic structure, syntactic relations, and meter.

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

## Data sources

- **Scansion:**
    - Chamberlain, David. [*Greek and Latin Meter*](https://hypotactic.com/latin/index.html?Use_Id=about).
- **Morphology and syntax:**
    - Celano, Giuseppe G. A., Gregory Crane, Bridget Almas, et al. [*The Ancient Greek and Latin Dependency Treebank*](https://perseusdl.github.io/treebank_data/).

## Architecture

- **Static Jekyll site** (Jekyll ~> 4.3), deployed to GitHub Pages with a custom domain.
- **In-browser SQLite** via [sql.js](https://sql.js.org/). On first load, the code fetches
  `assets/data/corpus.sqlite.gz` and then hydrates the full database, which executes in an
  in-browser SQLite instance.

## Local development

**Requirements**

Most modern version of Ruby should work. Development was done with Ruby 4.0.5 on Windows 11
Enterprise Version 25H2 and with Ruby 3.4.4 on macOS 26.5.

**How to start the server**

```bash
bundle install
bundle exec jekyll serve
```

## Rebuilding the database

**Requirements**

Any version of Python 3 should work, as long as it has the `sqlite3` library in the Standard Library.
Development was done with Python 3.14.6 on Windows 11 Enterprise Version 25H2 and with Python 3.8.16
on macOS 26.5.

**How to Build**

The site fetches only `assets/data/corpus.sqlite.gz`; the CSVs under `assets/data/` are build sources. To regenerate the database after changing a source CSV:

```bash
python3 scripts/build_corpus.py
```

## Licenses

The code is licensed under the GNU General Public License v3.0 ([GNU GPLv3](https://choosealicense.com/licenses/gpl-3.0/)).

The data are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.en).
