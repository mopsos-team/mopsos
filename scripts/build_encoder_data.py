#!/usr/bin/env python3
"""Build the data files for the compound and infinitive encoder pages.

lexicon.json: the compound catalogue plus the corpus lemmas and their forms.
infinitives.json: every encoded corpus infinitive, and the forms that need
care. Run after changing a source CSV (build_corpus.py runs this too):

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
OUT_INF = os.path.join(DATA, "encoder", "infinitives.json")
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


def shape_text(value):
    """Metrical shapes use Latin H and L; a Greek capital eta has slipped in once."""
    return (value or "").replace("\u0397", "H").strip()


def infinitives():
    """known: form -> encodings with counts. partial: corpus infinitives with no
    encoding yet (only active and passive are encoded). others: encoded forms that
    are also other words, with how often."""
    known = collections.defaultdict(collections.Counter)
    partial, other = {}, collections.Counter()
    rows = read("morphology", "morphology.csv")
    for r in rows:
        k = key(r["form"])
        if not k or r["pos"] != "v" or r["mood"] != "n":
            continue
        if r["morpheme"] and r["conjugation"]:
            known[k][(r["lemma"].strip(), r["tense"], r["voice"], r["conjugation"], r["morpheme"],
                      shape_text(r["metrical_stem_shape"]), shape_text(r["metrical_shape"]))] += 1
        elif r["voice"] in ("a", "p"):
            partial.setdefault(k, [r["lemma"].strip(), r["tense"], r["voice"]])
    for r in rows:
        k = key(r["form"])
        if k in known and not (r["pos"] == "v" and r["mood"] == "n"):
            other[k] += 1
    return dict(
        built=datetime.date.today().isoformat(),
        known={k: [list(a) + [n] for a, n in c.most_common()] for k, c in sorted(known.items())},
        partial={k: v for k, v in sorted(partial.items()) if k not in known},
        others=dict(sorted(other.items())),
    )


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
    inf = infinitives()
    with open(OUT_INF, "w", encoding="utf-8", newline="\n") as f:
        json.dump(inf, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {os.path.relpath(OUT_INF, ROOT)}: {os.path.getsize(OUT_INF) / 1e3:.0f} KB, "
          f"{len(inf['known'])} encoded forms")


if __name__ == "__main__":
    main()
