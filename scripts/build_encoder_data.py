#!/usr/bin/env python3
"""Build assets/data/encoder/lexicon.json for the compound encoder page.

The encoder suggests analyses from the compound catalogue and from the corpus
lemmas and their forms, so it needs both in the browser. Run after changing a
source CSV (build_corpus.py runs this too):

    python3 scripts/build_encoder_data.py

assets/data/encoder/texts.json is a separate, static source: the Homeric Hymns
and Hesiod, which the corpus does not cover line by line for the encoder.
"""

import collections
import csv
import datetime
import json
import os

import greek_text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "assets", "data")
OUT = os.path.join(DATA, "encoder", "lexicon.json")
COLUMNS = ["lemma", "inferred", "segmentation", "member1", "member1_category", "member1_subcategory",
           "member2", "member2_category", "member2_subcategory", "analysis_count", "member_count",
           "link_to", "uncertain"]


def read(*path):
    with open(os.path.join(DATA, *path), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def key(text):
    return greek_text.strip_diacritics(text).lower()


def corpus_lemmas():
    """One row per corpus lemma: lemma, pos, gender, conjugation, in Homer, count, forms."""
    seen = {}
    for r in read("morphology", "morphology.csv"):
        lemma = r["lemma"].strip()
        if not key(lemma):
            continue
        a = seen.setdefault(lemma, dict(pos=collections.Counter(), gen=collections.Counter(), conj=collections.Counter(),
                                        homer=0, n=0, forms=collections.Counter()))
        a["n"] += 1
        a["pos"][r["pos"]] += 1
        if r["gender"] not in ("", "-"):
            a["gen"][r["gender"]] += 1
        if r["conjugation"]:
            a["conj"][r["conjugation"]] += 1
        if r["author"] == "Homer":
            a["homer"] += 1
        form = key(r["form"])
        if form:
            a["forms"][form] += 1

    def top(counter):
        return counter.most_common(1)[0][0] if counter else ""

    return [[lemma, top(a["pos"]), top(a["gen"]), top(a["conj"]), 1 if a["homer"] else 0, a["n"],
             " ".join(k for k, _ in a["forms"].most_common())] for lemma, a in sorted(seen.items())]


def main():
    out = dict(
        built=datetime.date.today().isoformat(),
        columns=COLUMNS,
        compounds=[[r[c] for c in COLUMNS] for r in read("ncompounds", "ncompounds_analysis.csv")],
        include=[[r["lemma"], r["include"]] for r in read("ncompounds", "ncompounds_include.csv")],
        lemmas=corpus_lemmas(),
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {os.path.relpath(OUT, ROOT)}: {os.path.getsize(OUT) / 1e6:.2f} MB, "
          f"{len(out['compounds'])} analyses, {len(out['lemmas'])} lemmas")


if __name__ == "__main__":
    main()
