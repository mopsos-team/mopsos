#!/usr/bin/env python3
"""Build assets/data/corpus.sqlite.gz from the committed CSV sources.

A config-driven CSV -> SQLite importer. The per-file config shape follows Zach's
convert_csv_to_sqlite pattern -- a list of dicts with `column_mapping` and
`data_coercion` (callables), reading with utf-8-sig so any BOM is stripped. It
adds the four things this site needs that a plain importer doesn't:

  * `columns`  - keep/reorder a subset of CSV columns (scansion_lines keeps 9 of
                 homer_lines.csv's 19 columns; importing all 19 would change the
                 table schema the app queries).
  * `indexes`  - the slim index set the queries rely on (no indexes => the slow
                 full-scan behaviour we removed earlier comes back).
  * VIEWS      - summaries are SQL views over one base table, not a second copy
                 of the data (e.g. scansion_books is a GROUP BY over
                 scansion_lines, so the data lives in exactly one place).
  * VACUUM + gzip - the app fetches corpus.sqlite.gz, so the output is the
                 compacted, gzipped database, not a raw .sqlite.

Adding a table is one new dict in TABLES; adding a summary is one new entry in
VIEWS. Run:  python3 scripts/build_corpus.py   (stdlib only: csv, sqlite3, gzip)
"""

import csv
import gzip
import os
import shutil
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "assets", "data")
OUT = os.path.join(DATA, "corpus.sqlite.gz")
TMP = os.path.join(DATA, ".corpus.build.sqlite")

# Numeric SQL types -> the Python parser used to coerce their values.
NUMERIC_PARSERS = {"INTEGER": int, "REAL": float}

# --- one CSV -> one table ---------------------------------------------------
#   columns        : subset/order of CSV columns to keep (None = every column)
#   column_mapping : {csv_header: new_column_name}            (Zach's pattern)
#   sql_types      : {column: "INTEGER"|"REAL"|"TEXT"}  -> DDL type + auto-coercion
#   data_coercion  : {column: callable}  custom value cleaner (Zach's pattern);
#                    overrides sql_types coercion when both are given
#   indexes        : columns to index (skipped if not kept)
TABLES = [
    dict(
        file_path=os.path.join(DATA, "default.csv"),
        table_name="morphology",
        columns=None,
        column_mapping={},
        sql_types=dict(total_distance="REAL", word_count="INTEGER", distance="REAL",
                       is_valid="INTEGER", id="INTEGER"),
        # is_valid is stored as the strings "true"/"false" in the CSV; map to 1/0
        # to match the app's own conversion (buildDatabase in mopsos-shared.js).
        data_coercion={"is_valid": lambda v: 1 if v.strip().lower() == "true"
                       else (0 if v.strip().lower() == "false" else v)},
        indexes=["lemma", "form", "work", "author", "sentence_id"],
    ),
    dict(
        file_path=os.path.join(DATA, "scansion", "homer_lines.csv"),
        table_name="scansion_lines",
        columns=["work", "book", "line_num", "n_syllables", "n_words",
                 "feet_pattern", "is_speech", "is_newpara", "line_text"],
        column_mapping={},
        sql_types=dict(line_num="INTEGER", n_syllables="INTEGER", n_words="INTEGER",
                       is_speech="INTEGER", is_newpara="INTEGER"),
        data_coercion={},
        indexes=["work", "feet_pattern"],
    ),
    # --- new tables go here, one dict per CSV. Auto-skipped until the CSV
    #     exists, so this is safe to leave in place.
    dict(
        file_path=os.path.join(DATA, "ncompounds", "ncompounds_analysis.csv"),
        table_name="ncompounds_analysis",
        columns=["compound", "member1", "member1_category", "member2",
                 "member2_category"],
        column_mapping={},
        sql_types={},
        data_coercion={},
        indexes=["compound"],
    ),
    dict(
        file_path=os.path.join(DATA, "ncompounds", "ncompounds_attestations.csv"),
        table_name="ncompounds_attestations",
        columns=["compound", "work", "book", "line_num"],
        column_mapping={},
        sql_types=dict(line_num="INTEGER"),
        data_coercion={},
        indexes=["compound", "work", "book", "line_num"],
    ),
]

# --- derived summaries: data stays in one table; the view computes the rest -
VIEWS = {
    "scansion_books": """
        SELECT work, book,
               COUNT(*)         AS n_lines,
               SUM(n_words)     AS total_words,
               SUM(n_syllables) AS total_syllables,
               SUM(is_newpara)  AS n_newpara,
               SUM(is_speech)   AS n_speech_lines
        FROM scansion_lines
        GROUP BY work, book
    """,
}


def make_coercer(column, sql_types, data_coercion):
    """Return a function mapping one raw CSV string to its stored value.
    Precedence: explicit data_coercion callable > numeric sql_type > text.
    Empty becomes NULL everywhere; for numeric columns '-' is also NULL, but
    text columns keep '-' (a meaningful 'not applicable' marker in this data)."""
    if column in data_coercion:
        fn = data_coercion[column]

        def coerce_custom(value):
            if value.strip() == "":
                return None
            try:
                return fn(value)
            except (ValueError, TypeError):
                print(f"    warn: could not coerce {value!r} in '{column}'; storing NULL")
                return None
        return coerce_custom

    parser = NUMERIC_PARSERS.get(sql_types.get(column, "TEXT").upper())
    if parser:
        def coerce_numeric(value):
            s = value.strip()
            if s in ("", "-"):
                return None
            try:
                return parser(s)
            except ValueError:
                return value  # leave unexpected values rather than crash
        return coerce_numeric

    return lambda value: None if value == "" else value


def load_table(con, cfg):
    path = cfg["file_path"]
    rel = os.path.relpath(path, ROOT)
    if not os.path.exists(path):
        print(f"  - skip {cfg['table_name']}: {rel} not found")
        return None

    sql_types = cfg.get("sql_types", {})
    mapping = cfg.get("column_mapping", {})
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        headers = reader.fieldnames or []
        src_cols = cfg["columns"] or headers
        missing = [c for c in src_cols if c not in headers]
        if missing:
            sys.exit(f"ERROR: {cfg['table_name']} ({rel}) is missing columns: {missing}")
        out_cols = [mapping.get(c, c) for c in src_cols]
        coercers = [make_coercer(o, sql_types, cfg.get("data_coercion", {})) for o in out_cols]

        coldefs = ", ".join(f'"{o}" {sql_types.get(o, "TEXT")}' for o in out_cols)
        con.execute(f'DROP TABLE IF EXISTS "{cfg["table_name"]}"')
        con.execute(f'CREATE TABLE "{cfg["table_name"]}" ({coldefs})')
        ins = f'INSERT INTO "{cfg["table_name"]}" VALUES ({", ".join("?" for _ in out_cols)})'

        n, batch = 0, []
        con.execute("BEGIN")
        for row in reader:
            batch.append([coercers[i](row.get(src_cols[i], "") or "") for i in range(len(src_cols))])
            if len(batch) >= 5000:
                con.executemany(ins, batch); n += len(batch); batch = []
        if batch:
            con.executemany(ins, batch); n += len(batch)
        con.execute("COMMIT")

    idx = [c for c in cfg.get("indexes", []) if c in out_cols]
    for c in idx:
        con.execute(f'CREATE INDEX "ix_{cfg["table_name"]}_{c}" ON "{cfg["table_name"]}" ("{c}")')
    print(f"  - {cfg['table_name']}: {n:,} rows, {len(out_cols)} cols, indexes={idx or 'none'}")
    return n


def main():
    if os.path.exists(TMP):
        os.remove(TMP)
    con = sqlite3.connect(TMP)
    con.isolation_level = None  # explicit BEGIN/COMMIT; lets VACUUM run cleanly
    con.execute("PRAGMA journal_mode=OFF")
    con.execute("PRAGMA synchronous=OFF")

    print("Tables:")
    built = [c["table_name"] for c in TABLES if load_table(con, c) is not None]

    print("Views:")
    for name, sql in VIEWS.items():
        con.execute(f'DROP VIEW IF EXISTS "{name}"')
        try:
            con.execute(f'CREATE VIEW "{name}" AS {sql}')
            con.execute(f'SELECT * FROM "{name}" LIMIT 1')  # validate against base tables
            print(f"  - {name} (view)")
        except sqlite3.Error as e:
            con.execute(f'DROP VIEW IF EXISTS "{name}"')
            print(f"  - skip view {name}: {e}")

    con.execute("VACUUM")
    con.close()

    raw = os.path.getsize(TMP)
    with open(TMP, "rb") as f_in, gzip.GzipFile(OUT, "wb", compresslevel=9, mtime=0) as f_out:
        shutil.copyfileobj(f_in, f_out)
    gz = os.path.getsize(OUT)
    os.remove(TMP)

    print(f"\nWrote {os.path.relpath(OUT, ROOT)}: {gz / 1e6:.2f} MB gzip (raw {raw / 1e6:.1f} MB)")
    print("Tables built:", ", ".join(built))
    print("Reminder: bump IDB_KEY in assets/js/mopsos-shared.js when the DATA")
    print("changes (e.g. when the compound tables are added) so returning")
    print("browsers fetch the rebuilt database instead of their cached copy.")


if __name__ == "__main__":
    main()
