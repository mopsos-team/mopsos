#!/usr/bin/env node
/* Fetch the Iliad and Odyssey from the Perseus Digital Library (CC BY-SA 4.0)
 * and write scripts/verse_sources/homer.json, the Homer text the verse encoder is
 * built from. The Hymns, Hesiod and the Shield are already in
 * assets/data/encoder/texts.json, from the same library.
 *
 *     node scripts/fetch_verse_texts.js            (downloads)
 *     node scripts/fetch_verse_texts.js <folder>   (reads the two XML files there)
 */
"use strict";
const fs = require("fs"), path = require("path");
const BASE = "https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data/";
const FILES = [
  { work: "Iliad", id: "il", file: "tlg0012/tlg001/tlg0012.tlg001.perseus-grc2.xml", edition: "D. B. Monro and T. W. Allen, Homeri Opera, Oxford 1920" },
  { work: "Odyssey", id: "od", file: "tlg0012/tlg002/tlg0012.tlg002.perseus-grc2.xml", edition: "A. T. Murray, The Odyssey, Loeb Classical Library 1919" },
];
const OUT = path.join(__dirname, "verse_sources", "homer.json");

function parse(xml, f) {
  const body = xml.slice(xml.indexOf("<body"));
  const texts = [];
  const bookRe = /<div[^>]*subtype="[Bb]ook"[^>]*>/g;
  const marks = [];
  let m;
  while ((m = bookRe.exec(body))) marks.push({ at: m.index, n: (/\bn="([^"]+)"/.exec(m[0]) || [])[1] });
  marks.forEach((b, i) => {
    const chunk = body.slice(b.at, i + 1 < marks.length ? marks[i + 1].at : body.length);
    const lines = [];
    const lineRe = /<l\b([^>]*)>([\s\S]*?)<\/l>/g;
    let l, auto = 0;
    while ((l = lineRe.exec(chunk))) {
      const n = (/\bn="([^"]+)"/.exec(l[1]) || [])[1];
      auto = n && /^\d+$/.test(n) ? parseInt(n, 10) : auto + 1;
      const text = l[2].replace(/<note[\s\S]*?<\/note>/g, "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().normalize("NFC");
      if (text) lines.push([n || String(auto), text]);
    }
    texts.push({ id: f.id + "-" + b.n, work: f.work, book: b.n, lines });
  });
  return texts;
}

async function main() {
  const dir = process.argv[2];
  const out = { source: "Perseus Digital Library, canonical-greekLit (CC BY-SA 4.0).", editions: {}, texts: [] };
  for (const f of FILES) {
    const xml = dir ? fs.readFileSync(path.join(dir, path.basename(f.file)), "utf8") : await (await fetch(BASE + f.file)).text();
    const texts = parse(xml, f);
    out.editions[f.work] = f.edition;
    out.texts.push(...texts);
    console.log(f.work + ": " + texts.length + " books, " + texts.reduce((a, t) => a + t.lines.length, 0) + " lines");
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("Wrote " + path.relative(process.cwd(), OUT) + ", " + (fs.statSync(OUT).size / 1e6).toFixed(2) + " MB");
}
main();
