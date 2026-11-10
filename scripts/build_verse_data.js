#!/usr/bin/env node
/* Build the data for the verse encoder page (verse-encode.html).
 *
 *     node scripts/build_verse_data.js
 *
 * Reads   scripts/verse_sources/homer.json        Iliad and Odyssey (fetch_verse_texts.js)
 *         assets/data/encoder/texts.json           Hymns, Theogony, Works and Days, Shield
 *         assets/data/morphology/morphology.csv    lemmas and the encoded infinitives
 *         assets/data/scansion/homer_lines.csv     stored scansion, used only as a check
 *         scripts/verse_sources/wau_lexemes.json   lexemes with initial digamma
 *         scripts/verse_sources/readings.csv       other editions' readings, if any
 * Writes  assets/data/verse/index.json             texts, units, digamma list, counts
 *         assets/data/verse/<text>.json            one file per book, poem or hymn
 *         assets/data/verse/lengths.json           vowel lengths learned from Homer
 *
 * The scansion itself is assets/js/verse-engine.js, the same code the page runs,
 * so a line is stored as its text plus what the engine cannot work out alone:
 * vowel lengths, digamma words, infinitives, repeats. The page scans it again.
 *
 * With VERSE_TABLES set to a folder, full tables of every line, syllable,
 * infinitive and digamma site are also written there as TSV, for analysis.
 */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.dirname(__dirname);
const V = require(path.join(ROOT, "assets/js/verse-engine.js"));
require(path.join(ROOT, "assets/js/compound-engine.js"));
const I = require(path.join(ROOT, "assets/js/infinitive-engine.js"));
const DATA = path.join(ROOT, "assets", "data"), OUT = path.join(DATA, "verse"), SRC = path.join(__dirname, "verse_sources");
const TABLES = process.env.VERSE_TABLES || "";
const strip = V.strip;

/* ---- reading -------------------------------------------------------------- */
function readCsv(file) {
  const t = fs.readFileSync(file, "utf8").replace(/^﻿/, ""), rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] === undefined ? "" : r[i]])));
}
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/* ---- texts and units -------------------------------------------------------- */
const homer = json(path.join(SRC, "homer.json")), enc = json(path.join(DATA, "encoder", "texts.json"));
const TEXTS = [];
homer.texts.forEach((t) => TEXTS.push({ id: t.id, work: t.work, book: t.book, title: t.work + " " + t.book, group: t.work, lines: t.lines }));
const ENC_ID = { theog: "th", wd: "wd", shield: "sh" };
enc.texts.forEach((t) => TEXTS.push({
  id: ENC_ID[t.id] || t.id.replace(/^hh/, "hh-"), work: t.work, book: String(t.book), group: t.group === "Homeric Hymns" ? "Homeric Hymns" : "Hesiod",
  title: t.group === "Homeric Hymns" ? "Hymn " + t.title : t.title, lines: t.lines,
}));
// Stretches kept apart as units of their own. A line outside every range
// belongs to the unit of its whole text.
const SECTIONS = [
  { id: "il-2-ships", text: "il-2", from: 494, to: 877, label: "Catalogue of Ships", recent: "yes" },
  { id: "il-10", text: "il-10", label: "Doloneia", recent: "yes" },
  { id: "il-18-shield", text: "il-18", from: 478, to: 606, label: "Shield of Achilles", recent: "yes" },
  { id: "il-24", text: "il-24", label: "Iliad 24", recent: "undecided" },
  { id: "od-8-ares", text: "od-8", from: 266, to: 369, label: "Song of Ares and Aphrodite", recent: "yes" },
  { id: "od-11", text: "od-11", label: "Nekyia", recent: "yes" },
  { id: "od-24-nekyia", text: "od-24", from: 1, to: 204, label: "Second Nekyia", recent: "yes" },
  { id: "hh-8", text: "hh-8", label: "Hymn to Ares", recent: "late", note: "Roman in date and archaizing; kept out of the archaic estimates" },
];
function unitOf(textId, n) {
  const num = parseInt(n, 10);
  const s = SECTIONS.find((x) => x.text === textId && (x.from == null || (num >= x.from && num <= x.to)));
  return s ? s.id : textId;
}

/* ---- morphology: lemmas and the encoded infinitives --------------------------- */
console.log("Reading morphology.csv");
const MORPH_WORK = { Iliad: "Iliad", Odyssey: "Odyssey", Theogony: "Theogony", "Works and Days": "Works and Days" };
const byVerse = new Map(), formLemma = new Map(), knownInf = new Set();
readCsv(path.join(DATA, "morphology", "morphology.csv")).forEach((r) => {
  const key = r.work + "|" + r.book + "|" + r.verse;
  if (!byVerse.has(key)) byVerse.set(key, []);
  const row = { k: strip(r.form), form: r.form, lemma: r.lemma.trim(), pos: r.pos, mood: r.mood, tense: r.tense, voice: r.voice, cas: r["case"], conj: r.conjugation, morph: r.morpheme, stem: (r.metrical_stem_shape || "").replace(/Η/g, "H") };
  byVerse.get(key).push(row);
  if (!row.k) return;
  if (!formLemma.has(row.k)) formLemma.set(row.k, new Map());
  const m = formLemma.get(row.k);
  m.set(row.lemma + "|" + row.pos, (m.get(row.lemma + "|" + row.pos) || 0) + 1);
  if (row.pos === "v" && row.mood === "n") knownInf.add(row.k);
});
const bestLemma = new Map();
formLemma.forEach((m, k) => { const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0].split("|"); bestLemma.set(k, { lemma: top[0], pos: top[1] }); });
const ix = I.buildIndex(json(path.join(DATA, "encoder", "lexicon.json")), json(path.join(DATA, "encoder", "infinitives.json")));

/* ---- stored scansion, as a check ---------------------------------------------- */
const refPat = new Map();
readCsv(path.join(DATA, "scansion", "homer_lines.csv")).forEach((r) => {
  // Odyssey 1 and 6 in this file are copies of books 10 and 9.
  if (!r.line_num || (r.work === "odyssey" && (r.book === "1" || r.book === "6"))) return;
  const feet = r.feet_pattern.split("|");
  if (feet.length !== 6) return;
  const pat = feet.slice(0, 5).map((f) => (f === "LSS" ? "D" : f === "LL" ? "S" : "?")).join("");
  if (pat.includes("?")) return;
  refPat.set((r.work === "iliad" ? "il-" : "od-") + r.book + "|" + parseInt(r.line_num, 10), { pat, k: strip(r.line_text) });
});

/* ---- digamma ------------------------------------------------------------------ */
const wauSeed = json(path.join(SRC, "wau_lexemes.json")).lexemes, wauByLemma = new Map();
wauSeed.forEach((x) => x.keys.forEach((k) => wauByLemma.set(k.normalize("NFC"), x)));
function wauOf(word, info) {
  if (!info || !info.lemma || !word.letters.length || !"αεηιουω".includes(word.letters[0].ch) || word.aph) return null;
  const x = wauByLemma.get(info.lemma.normalize("NFC"));
  if (!x) return null;
  const k = V.plain(word);
  return x.stems.some((s) => s === "*" || k.startsWith(s)) ? x : null;
}

/* ---- other editions' readings ---------------------------------------------------- */
const readings = new Map(), readingsFile = path.join(SRC, "readings.csv");
if (fs.existsSync(readingsFile)) {
  readCsv(readingsFile).forEach((r) => {
    if (!r.text || !r.text_id) return;
    const key = r.text_id + "|" + r.line;
    if (!readings.has(key)) readings.set(key, []);
    readings.get(key).push([r.edition, r.text.normalize("NFC")]);
  });
}

/* ---- pass 0: words, lemmas ------------------------------------------------------- */
console.log("Aligning words and lemmas");
const lexKey = (form) => form.normalize("NFD").replace(/̀/g, "́").toLowerCase().normalize("NFC").replace(/[’ʼ'᾽]/g, "");
const ALL = [];       // every line, in order
TEXTS.forEach((t) => {
  t.rows = t.lines.map(([n, text]) => {
    const tk = V.tokenize(text), rows = (MORPH_WORK[t.work] && byVerse.get(t.work + "|" + t.book + "|" + n)) || [];
    const used = new Set();
    const info = tk.words.map((w) => {
      const k = V.plain(w);
      const i = rows.findIndex((r, ri) => !used.has(ri) && r.k === k);
      if (i >= 0) { used.add(i); return { lemma: rows[i].lemma, pos: rows[i].pos, row: rows[i], k }; }
      const b = bestLemma.get(k);
      return { lemma: b ? b.lemma : "", pos: b ? b.pos : "", row: null, k };
    });
    const L = { t, n, text: tk.text, words: tk.words, info, unit: unitOf(t.id, n) };
    ALL.push(L);
    return L;
  });
});

/* ---- pass 1: learn vowel lengths from the Homer lines the stored scansion confirms -- */
console.log("Learning vowel lengths");
const seen = new Map();
let refLines = 0, refAgreeBare = 0;
ALL.forEach((L) => {
  const ref = refPat.get(L.t.id + "|" + parseInt(L.n, 10));
  if (ref && ref.k === strip(L.text)) L.ref = ref.pat;
  if (!L.ref) return;
  refLines++;
  const a = V.analyze(L.text);
  if (!a.ok || a.pat !== L.ref) return;
  refAgreeBare++;
  a.words.forEach((w, i) => {
    const s = a.lengths[i];
    if (!s || !/[LS]/.test(s)) return;
    const k = lexKey(w.form);
    if (!seen.has(k)) seen.set(k, []);
    const e = seen.get(k);
    for (let j = 0; j < s.length; j++) { e[j] = e[j] || { L: 0, S: 0 }; if (s[j] === "L" || s[j] === "S") e[j][s[j]]++; }
  });
});
const LENGTHS = {};
seen.forEach((e, k) => {
  const s = e.map((c) => { const n = c.L + c.S; return !n ? "?" : c.L / n >= 0.9 ? "L" : c.S / n >= 0.9 ? "S" : "?"; }).join("");
  if (/[LS]/.test(s)) LENGTHS[k] = s;
});
console.log("  " + Object.keys(LENGTHS).length + " forms; stored scansion available for " + refLines + " lines, " + refAgreeBare + " agree before any lengths are known");

/* ---- pass 2: scan everything ------------------------------------------------------ */
console.log("Scanning " + ALL.length + " lines");
const REVIEW_COST = 2.4, REVIEW_MARGIN = 0.5;
const THREE_CL = /^(?:ξεν[οιεηωυα]|μον[οηωα]|κορ(?:η|ησ|ην|αι|ασ|αισ)$|νοσ[οωυ]|γονατ|δορατ|ολ[οη][σνυι]?$)/;
const DIECTASIS = /(?:οω|οῳ|αα|αᾳ|ωο|ωω|οου|εει)/;
function scanLine(L) {
  const hints = {};
  L.words.forEach((w, i) => { const h = LENGTHS[lexKey(w.form)]; if (h) hints[i] = h; });
  L.hints = hints;
  L.wau = [];
  L.words.forEach((w, i) => { const x = wauOf(w, L.info[i]); if (x) L.wau.push([i, x.id]); });
  const wau = L.wau.map((x) => x[0]);
  const a = V.analyze(L.text, { hints, wau });
  L.a = a;
  L.review = [];
  if (wau.length && a.ok) {
    const aw = V.analyze(L.text, { hints, wau, useW: true });
    L.withW = aw.ok ? { pat: aw.pat, cost: aw.cost } : null;
  }
  if (!a.ok) L.review.push("no scansion");
  else {
    // A licence that a digamma explains is not a reason to look at the line.
    if (Math.min(a.cost, L.withW ? L.withW.cost : a.cost) >= REVIEW_COST) L.review.push("costly");
    if (a.margin < REVIEW_MARGIN) L.review.push("close call");
    if (L.ref && L.ref !== a.pat) L.review.push("differs from stored scansion");
  }
}
ALL.forEach(scanLine);

/* ---- infinitives ------------------------------------------------------------------ */
console.log("Infinitives");
const isMiddle = (voice, morph) => voice === "m" || voice === "e" || String(morph) === "7";
ALL.forEach((L) => {
  L.inf = [];
  L.words.forEach((w, i) => {
    const info = L.info[i], row = info.row;
    let tok = null;
    if (row && row.pos === "v" && row.mood === "n") {
      if (isMiddle(row.voice, row.morph)) return;
      if (row.conj && row.morph) tok = { src: "corpus", lemma: row.lemma, tense: row.tense, voice: row.voice, conj: row.conj, morph: row.morph, stem: row.stem };
    }
    if (!tok && (!row || (row.pos === "v" && row.mood === "n"))) {
      const next = L.words[i + 1];
      const c = I.classify(ix, w.form.replace(/[’ʼ'᾽]$/, ""), { elided: w.elided, next: next ? next.form : undefined });
      if (c.kind === "plain" || !c.analyses || !c.analyses.length) return;
      const g = c.analyses[0];
      if (isMiddle(g.voice, g.morph)) return;
      tok = { src: c.kind === "known" ? "known form" : "suggested", lemma: g.lemma, tense: g.tense, voice: g.voice, conj: g.conj, morph: String(g.morph), stem: g.stem || "" };
    }
    if (!tok) return;
    tok.wi = i;
    tok.form = w.form;
    tok.ending = V.endingOf(strip(w.form), tok.conj);
    tok.stemSyllables = tok.stem && tok.stem !== "0" ? tok.stem.length : 0;
    tok.signature = V.signature(tok.ending, tok.conj, tok.stemSyllables);
    const alts = w.elided ? [] : V.infinitiveAlternatives(w.form, tok);
    tok.alts = alts.map((x) => ({ ...x, attested: knownInf.has(strip(x.form)) }));
    if (L.a.ok && alts.length) {
      const res = V.necessity(L.text, i, alts, { hints: L.hints, wau: L.wau.map((x) => x[0]) }).results;
      tok.alts.forEach((x, j) => { x.verdict = res[j] ? res[j].verdict : ""; });
      const rivals = tok.alts.filter((x) => x.signature.split(" ")[0] !== tok.signature.split(" ")[0] || /Ionic/.test(x.signature) !== /Ionic/.test(tok.signature));
      const other = /Ionic/.test(tok.signature) ? tok.alts.filter((x) => !/Ionic/.test(x.signature)) : tok.alts.filter((x) => /Ionic/.test(x.signature));
      tok.necessity = !other.length ? "no rival form" : other.some((x) => x.verdict === "yes") ? "replaceable" : other.some((x) => x.verdict === "licence") ? "replaceable with a licence" : "required";
      void rivals;
    } else tok.necessity = w.elided ? "elided" : alts.length ? "" : "no rival form";
    L.inf.push(tok);
  });
});

/* ---- repeats ---------------------------------------------------------------------- */
console.log("Repeats");
const tri = new Map(), hemi = new Map(), pairLemma = new Map();
const lemKey = (L, i) => (L.info[i].lemma || L.info[i].k).normalize("NFC");
function hemistichs(L) {
  // Split at the main caesura of the third foot, else of the fourth.
  if (!L.a.ok) return null;
  const sy = L.a.sylls;
  const cut = sy.find((s) => s.foot === 3 && s.part === "P" && s.wordFinal) || sy.find((s) => s.foot === 3 && s.part === "B" && s.half === 1 && s.wordFinal) || sy.find((s) => s.foot === 4 && s.part === "P" && s.wordFinal);
  if (!cut) return null;
  return cut.wi;      // last word of the first half
}
ALL.forEach((L, li) => {
  const k = L.info.map((x) => x.k);
  L.keys = k;
  for (let i = 0; i + 2 < k.length; i++) {
    const key = k[i] + " " + k[i + 1] + " " + k[i + 2];
    if (!tri.has(key)) tri.set(key, []);
    tri.get(key).push(li);
  }
  for (let i = 0; i + 1 < k.length; i++) {
    const key = lemKey(L, i) + " " + lemKey(L, i + 1);
    if (!pairLemma.has(key)) pairLemma.set(key, new Map());
    const m = pairLemma.get(key), form = L.words[i].form + " " + L.words[i + 1].form;
    const fk = k[i] + " " + k[i + 1];
    if (!m.has(fk)) m.set(fk, { form, n: 0 });
    m.get(fk).n++;
  }
  L.cut = hemistichs(L);
  if (L.cut != null) {
    [k.slice(0, L.cut + 1), k.slice(L.cut + 1)].forEach((half, hi) => {
      if (half.length < 2) return;
      const key = hi + ":" + half.join(" ");
      if (!hemi.has(key)) hemi.set(key, []);
      hemi.get(key).push(li);
    });
  }
});
const refOf = (li) => ALL[li].t.id + " " + ALL[li].n;
ALL.forEach((L, li) => {
  const k = L.keys, covered = new Array(k.length).fill(false);
  for (let i = 0; i + 2 < k.length; i++) if (tri.get(k[i] + " " + k[i + 1] + " " + k[i + 2]).length > 1) covered[i] = covered[i + 1] = covered[i + 2] = true;
  const halves = L.cut == null ? [] : [[0, L.cut], [L.cut + 1, k.length - 1]];
  halves.forEach(([s, e], hi) => {
    const list = e - s >= 1 ? hemi.get(hi + ":" + k.slice(s, e + 1).join(" ")) : null;
    if (list && list.length > 1) for (let i = s; i <= e; i++) covered[i] = true;
  });
  L.density = k.length ? Math.round((100 * covered.filter(Boolean).length) / k.length) : 0;
  L.inf.forEach((tok) => {
    const i = tok.wi;
    let best = null;
    for (let s = Math.max(0, i - 2); s <= i && s + 2 < k.length; s++) {
      const key = k[s] + " " + k[s + 1] + " " + k[s + 2], list = tri.get(key);
      if (!best || list.length > best.list.length) best = { list, text: L.words.slice(s, s + 3).map((w) => w.form).join(" ") };
    }
    let half = null;
    halves.forEach(([s, e], hi) => { if (i >= s && i <= e && e - s >= 1) half = { list: hemi.get(hi + ":" + k.slice(s, e + 1).join(" ")), text: L.words.slice(s, e + 1).map((w) => w.form).join(" ") }; });
    const pick = half && half.list.length > 1 && (!best || half.list.length >= best.list.length) ? half : best;
    const n = pick ? pick.list.length - 1 : 0;
    tok.rep = { n, text: n ? pick.text : "", refs: n ? pick.list.filter((x) => x !== li).slice(0, 6).map(refOf) : [] };
    // The same two lemmas together, in whatever form: the formula and its variants.
    const fams = [];
    [[i - 1, i], [i, i + 1]].forEach(([x, y]) => {
      if (x < 0 || y >= k.length) return;
      const m = pairLemma.get(lemKey(L, x) + " " + lemKey(L, y));
      const total = [...m.values()].reduce((s, v) => s + v.n, 0);
      if (total > 1) fams.push({ total, here: k[x] + " " + k[y], variants: [...m.entries()].sort((p, q) => q[1].n - p[1].n).slice(0, 6).map(([fk, v]) => [v.form, v.n, fk === k[x] + " " + k[y] ? 1 : 0]) });
    });
    fams.sort((p, q) => q.total - p.total);
    tok.family = fams[0] || null;
  });
});

/* ---- innovations (candidates) --------------------------------------------------------- */
ALL.forEach((L) => {
  const out = [];
  if (!L.a.ok) { L.innov = out; return; }
  L.a.measures.synizesis.forEach((x) => out.push({ type: "synizesis", wi: L.a.sylls[x.syl].wi, kind: "innovation" }));
  L.a.measures.mcl.filter((x) => !x.heavy).forEach((x) => out.push({ type: "stop and liquid, light", wi: L.a.sylls[x.syl].wi, kind: "innovation" }));
  const sites = new Map(L.a.sites.map((s) => [s.wi, s]));
  L.wau.forEach(([wi]) => { const s = sites.get(wi); if (s && V.wauVerdict(s) === "neglected") out.push({ type: "digamma neglected", wi, kind: "innovation" }); });
  L.inf.forEach((t) => { if (t.ending === "έειν" && t.conj !== "c") out.push({ type: "-έειν", wi: t.wi, kind: "innovation" }); });
  L.words.forEach((w, i) => {
    const k = L.info[i].k, row = L.info[i].row, pos = L.info[i].pos;
    if (/(?:εω|εων)$/.test(k) && k.length > 3 && ((row && row.cas === "g" && /^[na]$/.test(row.pos)) || (!row && pos === "n"))) out.push({ type: "quantitative metathesis", wi: i, kind: "innovation" });
    if (THREE_CL.test(k)) out.push({ type: "no third compensatory lengthening", wi: i, kind: "innovation" });
    if ((strip(L.info[i].lemma) === "καλοσ" || strip(L.info[i].lemma) === "ισοσ") && /^(?:καλ|ισ)/.test(k)) {
      const first = L.a.sylls.find((s) => s.wi === i);
      if (first && first.w === "L") out.push({ type: "no third compensatory lengthening", wi: i, kind: "innovation" });
    }
    if (pos === "v" && DIECTASIS.test(k) && !/εειν$/.test(k)) out.push({ type: "diectasis", wi: i, kind: "innovation" });
  });
  L.innov = out;
});

/* ---- writing ------------------------------------------------------------------------- */
console.log("Writing");
fs.mkdirSync(OUT, { recursive: true });
fs.readdirSync(OUT).forEach((f) => { if (f.endsWith(".json")) fs.unlinkSync(path.join(OUT, f)); });
const index = {
  built: new Date().toISOString().slice(0, 10),
  source: "Perseus Digital Library (CC BY-SA 4.0). Iliad: " + homer.editions.Iliad + ". Odyssey: " + homer.editions.Odyssey + ". " + enc.source,
  sections: SECTIONS, wau: wauSeed.map((x) => ({ id: x.id, head: x.head, status: x.status, note: x.note, keys: x.keys, n: 0, observed: 0, neglected: 0 })), texts: [],
};
const wauIndex = new Map(index.wau.map((x) => [x.id, x]));
const hintString = (L) => { const top = L.words.length; let s = []; for (let i = 0; i < top; i++) s.push(L.hints[i] || ""); while (s.length && !s[s.length - 1]) s.pop(); return s.join(" "); };
TEXTS.forEach((t) => {
  const lines = t.rows.map((L) => {
    const o = { n: L.n, t: L.text };
    const h = hintString(L);
    if (h) o.h = h;
    if (L.wau.length) o.w = L.wau;
    if (L.ref) o.r = L.ref;
    if (L.unit !== t.id) o.u = L.unit;
    if (L.inf.length) o.i = L.inf.map((x) => ({ wi: x.wi, lemma: x.lemma, tense: x.tense, voice: x.voice, conj: x.conj, morph: x.morph, stem: x.stem, src: x.src, rep: x.rep.n ? x.rep : undefined, fam: x.family ? x.family.variants : undefined, att: x.alts.filter((a) => a.attested).map((a) => a.form) }));
    if (L.density) o.d = L.density;
    const inn = L.innov.filter((x) => !/synizesis|stop and liquid|digamma|-έειν/.test(x.type));   // the page works the others out itself
    if (inn.length) o.c = inn.map((x) => [x.wi, x.type]);
    const alt = readings.get(t.id + "|" + L.n);
    if (alt) o.alt = alt;
    if (L.a.ok) L.a.sites.forEach((s) => {
      const hit = L.wau.find((x) => x[0] === s.wi);
      if (!hit) return;
      const e = wauIndex.get(hit[1]), v = V.wauVerdict(s);
      e.n++; if (v === "observed") e.observed++; if (v === "neglected") e.neglected++;
    });
    return o;
  });
  fs.writeFileSync(path.join(OUT, t.id + ".json"), JSON.stringify({ id: t.id, work: t.work, book: t.book, title: t.title, lines }));
  index.texts.push({
    id: t.id, work: t.work, book: t.book, title: t.title, group: t.group, n: lines.length,
    review: t.rows.filter((L) => L.review.length).length, inf: t.rows.reduce((s, L) => s + L.inf.length, 0), wau: t.rows.reduce((s, L) => s + L.wau.length, 0),
    checked: t.rows.filter((L) => L.ref).length,
  });
});
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
fs.writeFileSync(path.join(OUT, "lengths.json"), JSON.stringify(LENGTHS));

/* ---- full tables, kept outside the site ------------------------------------------------ */
if (TABLES) {
  fs.mkdirSync(TABLES, { recursive: true });
  const tsv = (name, head, rows) => { fs.writeFileSync(path.join(TABLES, name), [head.join("\t")].concat(rows.map((r) => r.map((v) => (v == null ? "" : String(v).replace(/[\t\n]/g, " "))).join("\t"))).join("\n") + "\n"); console.log("  " + name + ": " + rows.length + " rows"); };
  const lineRows = [], sylRows = [], infRows = [], siteRows = [], innRows = [];
  ALL.forEach((L) => {
    const a = L.a, id = [L.t.id, L.t.work, L.t.book, L.n, L.unit];
    const m = a.ok ? a.measures : null;
    lineRows.push(id.concat([L.text, a.ok ? a.pat : "", a.ok ? V.weights(a) : "", a.ok ? a.cost : "", a.ok && a.margin < 1e8 ? a.margin : "", L.ref || "", L.review.join("; "),
      a.ok ? a.licences.map((x) => x.what).join("; ") : "", m ? m.caesura.join("; ") : "", m ? m.overlong.length : "", m ? m.overlong.filter((x) => x.zone).length : "",
      m && m.wernicke ? (m.wernicke.breach ? (m.wernicke.appositive ? "breach, appositive" : m.wernicke.sure ? "breach" : "possible breach") : "kept") : "", m && m.wernicke ? m.wernicke.shape : "",
      m && m.hermann ? (m.hermann.softened ? "softened" : "breach") : "", L.withW ? L.withW.cost : "", L.withW ? L.withW.pat : "", L.density, L.innov.length]));
    if (!a.ok) return;
    a.sylls.forEach((s) => sylRows.push(id.concat([s.i + 1, a.text.slice(s.s, s.e).trim(), s.w, s.foot, s.part === "P" ? "princeps" : "biceps", s.half || "", s.vowel, s.len, s.known ? 1 : 0, s.rime, s.coda, s.codaClass, s.firstCoda,
      s.closed ? 1 : 0, s.overlong ? 1 : s.overlongMaybe ? "?" : 0, s.viaMcl ? 1 : 0, s.heavyBy, s.wordFinal ? 1 : 0, a.words[s.wi].form, s.lic.join("; ")])));
    L.inf.forEach((t) => infRows.push(id.concat([t.wi + 1, t.form, t.lemma, t.tense, t.voice, t.conj, t.morph, t.ending, t.signature, t.stem, t.src,
      (() => { const s = a.sylls.find((x) => x.wi === t.wi); return s ? s.foot + (s.part === "P" ? "p" : "b" + (s.half || "")) : ""; })(),
      (() => { const nx = L.words[t.wi + 1]; if (!nx) return "line end"; const c = nx.letters.findIndex((l) => "αεηιουω".includes(l.ch)); return (L.words[t.wi].punct ? "pause, " : "") + (c === 0 ? "V" : c === 1 && !"ζξψ".includes(nx.letters[0].ch) ? "C" : "CC"); })(),
      t.necessity, t.alts.map((x) => x.form + " (" + x.signature + (x.attested ? ", attested" : "") + "): " + (x.verdict || "")).join("; "), t.rep.n, t.rep.text, t.rep.refs.join("; "),
      t.family ? t.family.variants.map((v) => v[0] + " ×" + v[1]).join("; ") : "", L.innov.length,
      (() => { const mm = a.measures, mine = a.sylls.filter((s) => s.wi === t.wi); return mine.some((s) => s.overlong && s.wordFinal) ? "overlong" : mm.wernicke && mm.wernicke.breach && a.sylls[mm.wernicke.syl].wi === t.wi ? "Wernicke" : ""; })()])));
    a.sites.forEach((s) => {
      const hit = L.wau.find((x) => x[0] === s.wi);
      siteRows.push(id.concat([s.wi + 1, s.form, L.info[s.wi].lemma, hit ? hit[1] : "", hit ? wauIndex.get(hit[1]).status : "", s.ctx, hit ? V.wauVerdict(s) : "", s.foot, s.part === "P" ? "princeps" : "biceps", s.elided, s.nu ? 1 : 0, s.pause ? 1 : 0, s.sure ? 1 : 0]));
    });
    L.innov.forEach((x) => innRows.push(id.concat([x.wi + 1, L.words[x.wi].form, L.info[x.wi].lemma, x.type, x.kind])));
  });
  const ID = ["text_id", "work", "book", "line", "unit"];
  tsv("lines.tsv", ID.concat(["text", "feet", "weights", "cost", "margin", "stored_feet", "review", "licences", "caesurae", "overlong", "overlong_5th_6th_princeps", "wernicke", "wernicke_shape", "hermann", "cost_with_digamma", "feet_with_digamma", "formulaic_density", "innovations"]), lineRows);
  tsv("syllables.tsv", ID.concat(["syllable", "text", "weight", "foot", "part", "half", "vowel", "vowel_length", "length_known", "rime", "coda", "coda_class", "first_coda", "closed", "overlong", "via_stop_liquid", "heavy_by", "word_final", "word", "licences"]), sylRows);
  tsv("inf_tokens.tsv", ID.concat(["word_idx", "form", "lemma", "tense", "voice", "conjugation", "morpheme", "ending", "signature", "stem_shape", "source", "position", "following", "necessity", "alt_forms", "formular_n", "repeat", "repeat_refs", "formula_variants", "innovations_in_line", "creates_violation"]), infRows);
  tsv("w_sites.tsv", ID.concat(["word_idx", "form", "lemma", "lexeme", "status", "context", "verdict", "foot", "part", "elided_word", "movable_nu", "pause", "length_known"]), siteRows);
  tsv("innovations.tsv", ID.concat(["word_idx", "form", "lemma", "type", "kind"]), innRows);
}

/* ---- report ---------------------------------------------------------------------------- */
const withRef = ALL.filter((L) => L.ref), agree = withRef.filter((L) => L.a.ok && L.a.pat === L.ref).length;
const by = (f) => ALL.reduce((m, L) => { const k = f(L); m[k] = (m[k] || 0) + 1; return m; }, {});
console.log("\nLines: " + ALL.length + ". No scansion: " + ALL.filter((L) => !L.a.ok).length + ". Marked for review: " + ALL.filter((L) => L.review.length).length);
console.log("Agreement with the stored Homer scansion: " + agree + " of " + withRef.length + " (" + ((100 * agree) / withRef.length).toFixed(2) + "%)");
console.log("Review, by group:", JSON.stringify(Object.fromEntries(Object.entries(by((L) => L.t.group)).map(([g, n]) => [g, ALL.filter((L) => L.t.group === g && L.review.length).length + " of " + n]))));
const infs = ALL.flatMap((L) => L.inf);
console.log("Infinitives with a rival ending: " + infs.filter((t) => t.alts.length).length + " of " + infs.length + ". Necessity:", JSON.stringify(infs.reduce((m, t) => { m[t.necessity] = (m[t.necessity] || 0) + 1; return m; }, {})));
console.log("Digamma words: " + ALL.reduce((s, L) => s + L.wau.length, 0));
const size = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log("Wrote " + fs.readdirSync(OUT).length + " files to assets/data/verse, " + (size / 1e6).toFixed(1) + " MB");
