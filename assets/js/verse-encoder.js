/* ============================================================================
 *  VERSE ENCODER: the unlisted page for checking the scansion of each line and
 *  recording what only a reader can decide about it. The scansion and every
 *  measure come from verse-engine.js, run here on the text of each line, so a
 *  correction takes effect at once. Saving is in encoder-store.js.
 *
 *  Three kinds of record go to the team sheet:
 *    vln  one per corrected or checked line: its text, pattern and corrections
 *    vit  one per decision on something in a line (digamma, infinitive, ...)
 *    vwl  one per digamma lexeme whose status the team has set
 *  The infinitive page's own records (inf) are read, never written.
 * ========================================================================== */
(function () {
  "use strict";
  const V = window.VerseEngine;
  const { $, esc, plural, toast, toGreek, saveFile, csv, createStore } = window.EncoderKit;
  const DATA = "assets/data/verse/";
  const REVIEW_COST = 2.4, REVIEW_MARGIN = 0.5;
  const strip = V.strip;

  const S = { index: null, text: null, lines: [], shown: [], cur: -1, syl: -1, filter: "all", lengths: null };
  const kit = createStore({
    key: "mopsos-verse-v1", kinds: ["vln", "vit", "vwl", "inf"], url: document.body.dataset.sheetUrl || "",
    ui: () => ({ textId: S.text && S.text.id, filter: S.filter, line: S.cur >= 0 && S.lines[S.cur] ? S.lines[S.cur].raw.n : "" }),
    onRemote: () => { if (S.text) { S.lines.forEach(compute); renderAll(); } renderCounts(); refreshPanels(); },
  });
  const store = kit.rows, put = kit.put;

  /* ---- digamma lexemes --------------------------------------------------- */
  const STATUSES = [["certain", "certain"], ["probable", "probable"], ["disputed", "disputed"], ["none", "no digamma"]];
  const wauStatus = (id) => { const r = store.vwl.get(id); return r ? r.status : (S.index.wau.find((x) => x.id === id) || {}).status; };
  const wauHead = (id) => (S.index.wau.find((x) => x.id === id) || {}).head || id;

  /* ---- one line ------------------------------------------------------------ */
  const lexKey = (form) => form.normalize("NFD").replace(/̀/g, "́").toLowerCase().normalize("NFC").replace(/[’ʼ'᾽]/g, "");
  const cleanMap = (m) => { const o = {}; Object.keys(m || {}).forEach((k) => { if (m[k] !== "" && m[k] != null) o[k] = m[k]; }); return o; };
  function compute(l) {
    const ov = store.vln.get(l.id) || null, raw = l.raw;
    l.ov = ov;
    l.text = ov && ov.text ? ov.text : raw.t;
    l.textChanged = l.text !== raw.t;
    const hints = {};
    let wau = raw.w || [], inf = raw.i || [], cand = raw.c || [];
    if (!l.textChanged) (raw.h || "").split(" ").forEach((h, i) => { if (h) hints[i] = h; });
    else {
      // A corrected text keeps what is known about the words it still has.
      const old = V.tokenize(raw.t).words, now = V.tokenize(l.text).words, oh = (raw.h || "").split(" ");
      const byForm = new Map();
      old.forEach((w, i) => { if (!byForm.has(lexKey(w.form))) byForm.set(lexKey(w.form), i); });
      const back = now.map((w) => byForm.get(lexKey(w.form)));
      now.forEach((w, i) => { const h = back[i] != null ? oh[back[i]] : (S.lengths && S.lengths[lexKey(w.form)]); if (h) hints[i] = h; });
      const move = (list, at) => list.map((x) => ({ x, wi: back.indexOf(at(x)) })).filter((p) => p.wi >= 0);
      wau = move(wau, (x) => x[0]).map((p) => [p.wi, p.x[1]]);
      inf = move(inf, (x) => x.wi).map((p) => Object.assign({}, p.x, { wi: p.wi }));
      cand = move(cand, (x) => x[0]).map((p) => [p.wi, p.x[1]]);
    }
    l.wauAll = wau;
    l.wau = wau.filter((x) => wauStatus(x[1]) !== "none");
    l.cand = cand;
    const over = ov ? { q: cleanMap(ov.q), div: cleanMap(ov.div), syn: cleanMap(ov.syn), wt: cleanMap(ov.wt) } : {};
    l.opts = { hints, wau: l.wau.map((x) => x[0]), over, pat: (ov && ov.pat) || undefined };
    l.res = V.analyze(l.text, l.opts);
    l.free = l.opts.pat ? V.analyze(l.text, Object.assign({}, l.opts, { pat: undefined })) : l.res;
    l.resW = l.wau.length ? V.analyze(l.text, Object.assign({}, l.opts, { useW: true })) : null;
    // Infinitives: the build's, and any the team has encoded on the infinitive page.
    const words = l.res.words;
    l.inf = inf.filter((t) => words[t.wi]).map((t) => Object.assign({}, t, { form: words[t.wi].form }));
    store.inf.forEach((r) => {
      if (r.work !== S.text.work || String(r.book) !== String(S.text.book) || String(r.line) !== String(raw.n)) return;
      if (r.voice === "m" || r.voice === "e") return;
      const wi = words.findIndex((w) => strip(w.form) === strip(r.form));
      if (wi < 0) return;
      const mine = { wi, form: words[wi].form, lemma: r.lemma, tense: r.tense, voice: r.voice, conj: r.conj, morph: String(r.morph), stem: r.stem || "", src: "team sheet" };
      const at = l.inf.findIndex((t) => t.wi === wi);
      if (at >= 0) l.inf[at] = Object.assign({}, l.inf[at], mine); else l.inf.push(mine);
    });
    l.review = [];
    if (!l.res.ok) l.review.push("no scansion");
    else {
      const hand = ov && (ov.pat || Object.keys(over.wt || {}).length);
      if (!hand && Math.min(l.res.cost, l.resW && l.resW.ok ? l.resW.cost : l.res.cost) >= REVIEW_COST) l.review.push("costly licence");
      if (!hand && l.res.margin < REVIEW_MARGIN) l.review.push("two readings");
      if (!hand && raw.r && !l.textChanged && raw.r !== l.res.pat) l.review.push("differs from the site");
    }
    l.items = l.res.ok ? buildItems(l) : [];
    l.changed = !!ov && !!(ov.text || ov.pat || ["q", "div", "syn", "wt"].some((k) => Object.keys(over[k] || {}).length));
    l.checked = !!(ov && ov.checked);
  }

  /* ---- what there is to decide in a line ------------------------------------ */
  const YESNO = [["yes", "yes"], ["no", "no"], ["unsure", "cannot tell"]];
  const FIELDS = {
    digamma: [{ name: "answer", label: "Digamma here", options: [["observed", "observed"], ["neglected", "neglected"], ["no evidence", "no evidence"], ["removable", "neglected, but a small change removes it"], ["not digamma", "not a digamma word"]] }],
    overlong: [
      { name: "answer", label: "Where the heavy syllable comes from", options: [["inherited", "inherited material"], ["Ionic innovation", "an Ionic innovation"], ["Aeolic or artificial", "an Aeolic or artificial ending"], ["unsure", "cannot tell"]] },
      { name: "restorable", label: "Can an older form remove it?", options: [["yes", "yes"], ["no", "no"], ["unsure", "cannot tell"]] },
      { name: "older", label: "The older form", text: true, greek: true },
    ],
    wernicke: [{ name: "answer", label: "Wernicke's Law", options: [["breach", "breached"], ["no breach", "not breached"], ["unsure", "cannot tell"]] }],
    hermann: [{ name: "answer", label: "Hermann's bridge", options: [["breach", "breached"], ["no breach", "not breached"], ["unsure", "cannot tell"]] }],
    infinitive: [
      { name: "answer", label: "Could another ending have stood here?", options: [["required", "no, the metre needs this one"], ["replaceable", "yes, as the line stands"], ["licence", "yes, with a licence"], ["word order", "only with a different word order"], ["no rival", "no rival ending exists"], ["unsure", "cannot tell"]] },
      { name: "formula", label: "Its place in the formula", options: [["model", "the model form"], ["modification", "a modification"], ["not formulaic", "not formulaic"], ["unsure", "cannot tell"]] },
      { name: "reading", label: "Does a variant reading change the ending?", options: [["no", "no"], ["yes", "yes"], ["not checked", "not checked"]] },
      { name: "variants", label: "The readings", help: "Greek or Beta Code. Filled with the rival forms found elsewhere in the texts that would scan here; change it to what the editions read.", text: true, greek: true, wide: true },
    ],
    innovation: [
      { name: "answer", label: "Is it one?", options: YESNO },
      { name: "kind", label: "What kind", options: [["innovation", "a change in the language"], ["variant", "a variant open to the poet"]] },
    ],
  };
  const TITLES = { digamma: "Digamma", overlong: "Overlong syllable", wernicke: "Wernicke's Law", hermann: "Hermann's bridge", infinitive: "Infinitive", innovation: "Possible innovation" };
  const partName = (s) => (s.part === "P" ? "princeps" : "biceps") + " of foot " + s.foot;
  const sylText = (l, s) => l.res.text.slice(s.s, s.e).replace(/[,.;·:—!?()"«»·;]/g, "").replace(/\s+/g, " ").trim();
  const TENSE = { p: "present", a: "aorist", f: "future", r: "perfect", t: "future perfect" }, VOICE = { a: "active", p: "passive" }, CONJ = { t: "thematic", a: "athematic", s: "sigmatic", c: "contract" };

  const NEC_FILL = { "required by the metre": "required", "replaceable as the line stands": "replaceable", "replaceable with a licence": "licence", "no rival ending": "no rival", "no rival of the other dialect": "no rival" };
  /* A first reading of the token's place in its formula, from what repeats. The
   * same two words in the same forms is the model when it is the commonest way
   * they occur together, and a modification when another form is commoner. */
  function formulaPlace(t) {
    const fam = t.fam || [], rep = t.rep && t.rep.n ? t.rep.n : 0;
    if (!rep && fam.reduce((s, v) => s + v[1], 0) < 2) return "not formulaic";
    if (fam.length < 2) return "model";
    const here = fam.find((v) => v[2]);
    return here && here[1] >= fam[0][1] ? "model" : "modification";
  }
  /* Roman typing to Greek, word by word, for the fields that hold Greek. A word
   * that starts with a capital, ends in a full stop or holds a digit is left as
   * typed, so that West, codd. and P.Oxy. 223 survive beside the reading. */
  function greekTyped(value) {
    return String(value || "").split(/(\s+)/).map((tok) => {
      if (!/[a-z]/i.test(tok) || /[Ͱ-Ͽἀ-῿]/.test(tok) || /^[A-Z]/.test(tok) || /\d/.test(tok) || /\.$/.test(tok)) return tok;
      const m = /^(.*?)([,;:·]*)$/.exec(tok);
      return toGreek(m[1]) + m[2];
    }).join("").normalize("NFC");
  }

  function buildItems(l) {
    const res = l.res, m = res.measures, out = [], words = res.words;
    const add = (type, key, wi, machine, more) => out.push(Object.assign({ type, key, wi, form: wi != null && words[wi] ? words[wi].form : "", machine }, more || {}));
    const site = new Map(res.sites.map((s) => [s.wi, s]));
    // Infinitives first: they are the main question.
    l.inf.forEach((t) => {
      const ending = V.endingOf(strip(t.form), t.conj), stemSyl = t.stem && t.stem !== "0" ? t.stem.length : 0;
      const sig = V.signature(ending, t.conj, stemSyl);
      const alts = /[’ʼ'᾽]$/.test(t.form) ? [] : V.infinitiveAlternatives(t.form, { conj: t.conj, tense: t.tense, lemma: t.lemma, stemSyllables: stemSyl });
      const nec = alts.length ? V.necessity(l.text, t.wi, alts, l.opts).results : [];
      const other = /Ionic/.test(sig) ? nec.filter((x) => !/Ionic/.test(x.signature)) : nec.filter((x) => /Ionic/.test(x.signature));
      const machine = !alts.length ? "no rival ending" : !other.length ? "no rival of the other dialect" : other.some((x) => x.verdict === "yes") ? "replaceable as the line stands" : other.some((x) => x.verdict === "licence") ? "replaceable with a licence" : "required by the metre";
      // The spelling the texts themselves give each rival form, where they have it.
      const att = new Map((t.att || []).map((f) => [strip(f), f]));
      nec.forEach((x) => { x.shown = att.get(strip(x.form)) || x.form; x.attested = att.has(strip(x.form)); });
      // What the page fills in for the reader to confirm or change.
      const fill = { answer: NEC_FILL[machine] || "", formula: formulaPlace(t), variants: nec.filter((x) => x.attested && x.verdict !== "no").map((x) => x.shown).join(", ") };
      add("infinitive", "i" + t.wi, t.wi, machine, { tok: t, ending, sig, nec, fill });
    });
    l.wau.forEach(([wi, id]) => {
      const s = site.get(wi), verdict = s ? V.wauVerdict(s) : "no evidence";
      add("digamma", "w" + wi, wi, verdict, { lex: id, site: s });
    });
    // Overlength is asked about where it counts most, the princeps of the fifth
    // and sixth foot. Every other overlong syllable is underlined in the line.
    m.overlong.filter((o) => o.zone).forEach((o) => {
      const s = res.sylls[o.syl], w = strip(words[s.wi].form), isInf = l.inf.find((t) => t.wi === s.wi);
      let hint = "", older = "";
      if (s.wordFinal && /εων$/.test(w)) { hint = "Ionic innovation"; older = "-άων"; }
      else if (s.wordFinal && /ου$/.test(w)) older = "-οο";
      else if (s.wordFinal && isInf) hint = /Ionic/.test(V.signature(V.endingOf(w, isInf.conj), isInf.conj)) ? "" : "Aeolic or artificial";
      add("overlong", "o" + s.at, s.wi, (o.zone ? "in the " + partName(s) + ", where it counts most" : "in the " + partName(s)) + (s.viaMcl ? "; only if stop and liquid are split" : ""), { syl: o.syl, zone: o.zone, hint, older });
    });
    if (m.wernicke && m.wernicke.breach) add("wernicke", "k", res.sylls[m.wernicke.syl].wi, (m.wernicke.appositive ? "breached, but the word leans on its neighbour" : m.wernicke.sure ? "breached" : "breached if the vowel is short") + " (" + m.wernicke.shape + ")", { syl: m.wernicke.syl });
    if (m.hermann && !m.hermann.softened) add("hermann", "h", res.sylls[m.hermann.syl].wi, "breached", { syl: m.hermann.syl });
    m.synizesis.forEach((x) => { const s = res.sylls[x.syl]; add("innovation", "ns" + s.at, s.wi, "synizesis", { syl: x.syl, what: "synizesis" }); });
    m.mcl.filter((x) => !x.heavy).forEach((x) => { const s = res.sylls[x.syl]; add("innovation", "nm" + s.at, s.wi, "stop and liquid (" + x.cluster + ") do not make position", { syl: x.syl, what: "stop and liquid, light" }); });
    l.inf.forEach((t) => { if (V.endingOf(strip(t.form), t.conj) === "έειν" && t.conj !== "c") add("innovation", "ne" + t.wi, t.wi, "-έειν", { what: "-έειν" }); });
    l.cand.forEach(([wi, type]) => { if (words[wi]) add("innovation", "nc" + wi + type.slice(0, 3), wi, type, { what: type }); });
    out.forEach((it) => { it.id = l.id + "|" + it.key; it.rec = store.vit.get(it.id) || null; });
    return out;
  }
  const neglected = (l) => l.items.some((it) => it.type === "digamma" && ((it.rec && it.rec.answer) || it.machine) === "neglected");

  /* ---- texts ---------------------------------------------------------------- */
  function populateTexts() {
    const groups = ["Iliad", "Odyssey", "Hesiod", "Homeric Hymns"];
    $("textSel").innerHTML = groups.map((g) => '<optgroup label="' + esc(g) + '">' + S.index.texts.filter((t) => t.group === g).map((t) =>
      '<option value="' + esc(t.id) + '">' + esc(t.title) + " · " + t.n + " lines" + "</option>").join("") + "</optgroup>").join("");
  }
  async function loadText(id, lineNo) {
    const meta = S.index.texts.find((t) => t.id === id) || S.index.texts[0];
    $("encLoad").hidden = false;
    try {
      const r = await fetch(DATA + meta.id + ".json");
      if (!r.ok) throw new Error(meta.id);
      S.text = await r.json();
    } catch (e) { $("encLoad").hidden = true; toast("That text did not load. Check your connection."); return; }
    $("textSel").value = S.text.id;
    S.lines = S.text.lines.map((raw, i) => ({ i, raw, id: S.text.id + "|" + raw.n }));
    S.lines.forEach(compute);
    S.cur = -1; S.syl = -1;
    renderAll();
    const at = lineNo ? S.lines.findIndex((l) => String(l.raw.n) === String(lineNo)) : -1;
    openLine(at >= 0 && S.shown.includes(at) ? at : (S.shown.length ? S.shown[0] : -1), true);
    $("encLoad").hidden = true;
    kit.save();
  }

  /* ---- the reader ------------------------------------------------------------- */
  const FILTERS = {
    all: () => true, review: (l) => l.review.length > 0, open: (l) => l.review.length > 0 && !l.checked,
    wau: (l) => l.wau.length > 0, neglect: neglected, inf: (l) => l.inf.length > 0,
    zone: (l) => l.res.ok && l.res.measures.overlong.some((o) => o.zone),
    bridge: (l) => l.res.ok && ((l.res.measures.wernicke && l.res.measures.wernicke.breach && !l.res.measures.wernicke.appositive) || (l.res.measures.hermann && !l.res.measures.hermann.softened)),
    changed: (l) => l.changed,
  };
  function lineHtml(l) {
    const res = l.res, wau = new Set(l.wau.map((x) => x[0])), inf = new Set(l.inf.map((t) => t.wi));
    let html = "", at = 0;
    res.words.forEach((w) => {
      html += esc(res.text.slice(at, w.s));
      const cls = (wau.has(w.i) ? " vw-wau" : "") + (inf.has(w.i) ? " vw-inf" : "");
      html += cls ? '<span class="w' + cls + '">' + esc(res.text.slice(w.s, w.e)) + "</span>" : esc(res.text.slice(w.s, w.e));
      at = w.e;
    });
    html += esc(res.text.slice(at));
    const answered = l.items.filter((it) => it.rec).length;
    const chips = l.review.map((r) => '<span class="vs-chip vs-warn">' + esc(r) + "</span>").join("") +
      (l.checked ? '<span class="vs-chip vs-done">checked</span>' : "") + (l.changed ? '<span class="vs-chip">changed</span>' : "") +
      (answered ? '<span class="vs-chip">' + plural(answered, "answer") + "</span>" : "");
    return '<div class="enc-ln vs-ln' + (l.i === S.cur ? " cur" : "") + '" data-i="' + l.i + '"><span class="enc-no">' + esc(l.raw.n) + '</span><span class="enc-tx">' + html +
      '<span class="vs-meta"><span class="vs-marks">' + (res.ok ? esc(V.scansionString(res)) : "no scansion") + "</span>" + chips + "</span></span></div>";
  }
  function renderReader() {
    const f = FILTERS[S.filter] || FILTERS.all;
    S.shown = S.lines.filter(f).map((l) => l.i);
    $("lines").innerHTML = S.shown.length ? S.shown.map((i) => lineHtml(S.lines[i])).join("") : '<p class="help" style="margin:.4rem;">No line of this text fits.</p>';
  }
  function renderLineRow(l) {
    const el = $("lines").querySelector('[data-i="' + l.i + '"]');
    if (el) el.outerHTML = lineHtml(l);
  }
  function renderTally() {
    const n = S.lines.length, rev = S.lines.filter((l) => l.review.length), open = rev.filter((l) => !l.checked).length;
    const sec = [...new Set(S.lines.map((l) => l.raw.u).filter(Boolean))].map((u) => S.index.sections.find((x) => x.id === u)).filter(Boolean);
    const whole = S.index.sections.find((x) => x.text === S.text.id && x.from == null);
    const units = (whole ? [whole] : sec).map((x) => x.label + (x.from != null ? " (" + x.from + " to " + x.to + ")" : "") + ": " + (x.recent === "yes" ? "counted as recent" : x.recent === "late" ? "late, kept apart" : "recent or not is undecided"));
    $("tally").innerHTML = plural(n, "line") + " · " + plural(rev.length, "line") + " to review, " + open + " not yet checked · " +
      plural(S.lines.reduce((s, l) => s + l.inf.length, 0), "infinitive") + " · " + plural(S.lines.reduce((s, l) => s + l.wau.length, 0), "digamma word") +
      " · showing " + S.shown.length + (units.length ? "<br>" + esc(units.join(" · ")) : "");
  }
  function renderAll() { renderReader(); renderTally(); renderDesk(); }

  /* ---- the desk ---------------------------------------------------------------- */
  const cur = () => (S.cur >= 0 ? S.lines[S.cur] : null);
  function openLine(i, quiet) {
    const before = $("lines").querySelector(".vs-ln.cur");
    if (before) before.classList.remove("cur");
    S.cur = i; S.syl = -1;
    const el = i >= 0 ? $("lines").querySelector('[data-i="' + i + '"]') : null;
    if (el) { el.classList.add("cur"); if (!quiet) el.scrollIntoView({ block: "nearest" }); else el.scrollIntoView({ block: "center" }); }
    renderDesk();
    kit.save();
  }
  const opt = (list, v, blank) => (blank === false ? "" : '<option value="">' + esc(blank || "") + "</option>") + list.map(([k, t]) => '<option value="' + esc(k) + '"' + (String(k) === String(v == null ? "" : v) ? " selected" : "") + ">" + esc(t) + "</option>").join("");
  function sylGrid(l) {
    const res = l.res, over = l.opts.over;
    let html = '<div class="syl-scan">', foot = 0;
    res.sylls.forEach((s) => {
      if (s.foot !== foot) { html += (foot ? '<span class="syl-flab">' + foot + '</span></span><span class="syl-div">|</span>' : "") + '<span class="syl-foot">'; foot = s.foot; }
      const hand = (over.wt && over.wt[s.at]) || (over.q && over.q[s.at]) || (over.syn && over.syn[s.at] != null) || (over.div && over.div[s.at]);
      const cls = (s.i === S.syl ? " sel" : "") + (s.overlong && !s.viaMcl ? " ovl" : s.overlong || s.overlongMaybe ? " ovq" : "") + (s.lic.length ? " lic" : "") + (hand ? " hand" : "") + (s.synizesis ? " syn" : "");
      html += '<span class="syl-col' + cls + '" data-syl="' + s.i + '" title="' + esc(sylTitle(s)) + '"><span class="syl-mark">' + (s.w === "H" ? "–" : "⏑") + '</span><span class="syl-txt">' + esc(sylText(l, s) || "·") + "</span></span>";
    });
    return html + '<span class="syl-flab">' + foot + "</span></span></div>";
  }
  const lenName = { L: "long vowel", S: "short vowel", "?": "vowel of unknown length" };
  function sylTitle(s) {
    return [s.w === "H" ? "heavy" + (s.heavyBy ? " by " + s.heavyBy : "") : "light", lenName[s.len], s.coda ? "closed by " + s.coda + " (" + s.codaClass + ")" : "open", s.overlong ? "overlong" : s.overlongMaybe ? "overlong if the vowel is long" : ""].concat(s.lic).filter(Boolean).join(" · ");
  }
  function sylControls(l) {
    const s = l.res.sylls[S.syl];
    if (!s) return '<p class="help vs-legend">Click a syllable to change it. <span style="border-bottom:2px solid #a61c00">Underlined</span> is overlong; a <span style="border-bottom:2px dotted #a61c00">dotted line</span> means only if its vowel is long, or only if stop and liquid are split. A coloured mark needed a licence.</p>';
    const over = l.opts.over, n = l.res.nuclei, k = s.k0, next = n[s.k1 + 1], nuc = n[k];
    const adjacent = next && s.between === 0;
    let html = '<div class="word-inline"><div class="enc-sub" style="margin-top:0">Syllable ' + (s.i + 1) + ': <span class="enc-greek">' + esc(sylText(l, s)) + '</span></div><p class="help" style="margin:.1rem 0 .45rem;">' + esc(sylTitle(s)) + " · " + esc(partName(s)) + " · rime " + esc(s.rime) + '</p><div class="vs-row">';
    html += '<div class="field"><label><strong>Weight</strong></label><select data-ov="wt" data-at="' + s.at + '">' + opt([["H", "heavy"], ["L", "light"]], over.wt && over.wt[s.at], "as scanned") + "</select></div>";
    html += '<div class="field"><label><strong>Vowel</strong></label><select data-ov="q" data-at="' + nuc.at + '">' + opt([["L", "long"], ["S", "short"]], over.q && over.q[nuc.at], nuc.nat === "?" ? "not known" : "as written") + "</select></div>";
    if (nuc.diph || (over.div && over.div[nuc.at])) html += '<div class="field"><label><strong>' + esc(nuc.v) + '</strong></label><select data-ov="div" data-at="' + nuc.at + '">' + opt([["split", "two vowels"], ["join", "one diphthong"]], over.div && over.div[nuc.at], "as written") + "</select></div>";
    else if (adjacent && next.wi === nuc.wi && !s.synizesis) html += '<div class="field"><label><strong>' + esc(nuc.v + next.v) + '</strong></label><select data-ov="div" data-at="' + nuc.at + '">' + opt([["join", "one diphthong"]], over.div && over.div[nuc.at], "two vowels") + "</select></div>";
    if (adjacent || s.synizesis || (over.syn && over.syn[nuc.at] != null)) html += '<div class="field"><label><strong>Synizesis with the next vowel</strong></label><select data-ov="syn" data-at="' + nuc.at + '">' + opt([["1", "run together"], ["0", "kept apart"]], over.syn && over.syn[nuc.at], "as scanned") + "</select></div>";
    return html + "</div></div>";
  }
  function itemHtml(l, it) {
    const rec = it.rec || {}, fields = FIELDS[it.type];
    let body = "";
    if (it.type === "infinitive") {
      const t = it.tok;
      body += '<p class="vs-machine">' + esc([TENSE[t.tense] || t.tense, VOICE[t.voice] || t.voice, CONJ[t.conj] || t.conj].filter(Boolean).join(" ")) + " of <span class=\"enc-greek\">" + esc(t.lemma || "?") + "</span> · ending <span class=\"enc-greek\">-" + esc(it.ending || "?") + "</span> · " + esc(it.sig || "no dialect mark") +
        (t.src !== "corpus" ? ' · <span class="cmp-warn">' + esc(t.src === "team sheet" ? "encoded by the team" : t.src === "known form" ? "form known from the corpus, not yet checked here" : "suggested, not yet checked") + "</span>" : "") + "</p>";
      if (it.nec.length) {
        body += '<div class="vs-table"><table class="paradigm-table vs-alts"><thead><tr><th>Instead</th><th>Dialect</th><th>Would it scan?</th></tr></thead><tbody>' + it.nec.map((x) =>
          '<tr><td><span class="pdg-form">' + esc(x.shown) + "</span>" + (x.attested ? "" : '<span class="pdg-c">not attested</span>') + (x.scansion && x.verdict !== "no" ? '<span class="vs-alt-scan">' + esc(x.scansion) + "</span>" : "") + "</td><td>" + esc(x.signature) + '</td><td class="' + x.verdict + '">' + (x.verdict === "yes" ? "yes" : x.verdict === "licence" ? "with a licence" : "no") + "</td></tr>").join("") + "</tbody></table></div>";
      }
      body += '<p class="vs-machine"><strong>The page reads:</strong> ' + esc(it.machine) + ".</p>";
      if (t.rep && t.rep.n) body += '<p class="vs-machine">Repeated ' + plural(t.rep.n, "more time") + ': <span class="enc-greek">' + esc(t.rep.text) + '</span> <span class="small-muted">' + esc(t.rep.refs.join(", ")) + (t.rep.n > t.rep.refs.length ? "…" : "") + "</span></p>";
      if (t.fam && t.fam.length > 1) body += '<p class="vs-machine">The same two words elsewhere: ' + t.fam.map((v) => '<span class="enc-greek">' + (v[2] ? "<strong>" + esc(v[0]) + "</strong>" : esc(v[0])) + "</span> ×" + v[1]).join(", ") + "</p>";
    } else if (it.type === "digamma") {
      const s = it.site;
      body += '<p class="vs-machine">' + esc(wauHead(it.lex)) + " (" + esc(wauStatus(it.lex)) + ") · " + (s ? "before it: " + esc(s.ctx) + (s.elided ? ' <span class="enc-greek">' + esc(s.elided) + "</span>" : "") + " · " + esc(partName(s)) + (s.nu ? " · the ν before it is movable" : "") + (s.sure ? "" : " · vowel length not certain") : "first word of the line") +
        "<br><strong>The page reads:</strong> " + esc(it.machine) + ".</p>";
    } else {
      const s = it.syl != null ? l.res.sylls[it.syl] : null;
      body += '<p class="vs-machine">' + (s ? 'Syllable <span class="enc-greek">' + esc(sylText(l, s)) + "</span> · " : "") + "<strong>The page reads:</strong> " + esc(it.machine) + "." +
        (it.type === "overlong" && (it.hint || it.older) ? " Suggested: " + esc([it.hint, it.older ? "older " + it.older : ""].filter(Boolean).join(", ")) + "." : "") + "</p>";
    }
    // Until the reader saves an answer, the fields show what the page filled in.
    const fill = it.rec ? {} : it.fill || {};
    const filled = Object.keys(fill).some((k) => fill[k]);
    const inputs = fields.map((f) => {
      const v = it.rec ? rec[f.name] || "" : fill[f.name] || "", auto = !it.rec && fill[f.name] ? " auto" : "";
      return '<div class="field' + (f.wide ? " vs-wide" : "") + '"><label><strong>' + esc(f.label) + "</strong>" + (f.help ? ' <span class="help">' + esc(f.help) + "</span>" : "") + "</label>" + (f.text
        ? '<input type="text" class="enc-greek' + auto + '" data-item="' + esc(it.key) + '" data-f="' + f.name + '"' + (f.greek ? ' data-greek="1"' : "") + ' value="' + esc(v) + '" autocomplete="off" spellcheck="false">'
        : '<select class="' + auto.trim() + '" data-item="' + esc(it.key) + '" data-f="' + f.name + '">' + opt(f.options, v) + "</select>") + "</div>";
    }).join("");
    return '<div class="word-inline vs-item' + (it.rec ? " answered" : "") + '" data-key="' + esc(it.key) + '"><div class="vs-head"><span>' + esc(TITLES[it.type]) + (it.form ? ' · <span class="enc-greek">' + esc(it.form) + "</span>" : "") + '</span><span class="small-muted">' + (it.rec ? "answered" : "") + "</span></div>" + body +
      (filled ? '<p class="help vs-filled">The tinted fields were filled in by the page. Change any that are wrong. They are saved when you change one or mark the line checked.</p>' : "") +
      '<div class="vs-row">' + inputs + '<div class="field vs-wide"><label><strong>Note</strong></label><input type="text" data-item="' + esc(it.key) + '" data-f="note" value="' + esc(rec.note || "") + '" autocomplete="off"></div></div></div>';
  }
  function renderDesk() {
    const l = cur(), body = $("deskBody"), foot = $("deskFoot");
    if (!l) { body.innerHTML = '<p class="help">Choose a line on the left.</p>'; foot.innerHTML = ""; return; }
    const res = l.res, ov = l.ov || {};
    const sec = l.raw.u ? S.index.sections.find((x) => x.id === l.raw.u) : null;
    let html = '<div class="vs-desk"><p class="scan-ref">' + esc(S.text.title + "." + l.raw.n) + (sec ? " · " + esc(sec.label) : "") + (l.raw.d ? " · " + l.raw.d + "% of the words repeat elsewhere" : "") + "</p>";
    html += '<div class="scan-line"><div class="scan-greek">' + esc(l.text) + "</div>" + (res.ok ? sylGrid(l) : '<p class="cmp-warn">The page found no scansion for this line. Correct the text, or set the weights by hand.</p>') + "</div>";
    if (res.ok) {
      const lic = res.licences.map((x) => x.what + " (" + sylText(l, res.sylls[x.syl]) + ")");
      html += '<p class="help" style="margin:.4rem 0 .2rem;">' + (lic.length ? "Licences: " + esc(lic.join("; ")) + "." : "No licence needed.") +
        (res.measures.caesura.length ? " Word end: " + esc(res.measures.caesura.join(", ")) + "." : " No word end at the usual places.") +
        (l.raw.r && !l.textChanged ? (l.raw.r === res.pat ? " Agrees with the scansion stored on the site." : ' <span class="cmp-warn">The site stores ' + esc(l.raw.r) + ".</span>") : "") + "</p>";
      if (l.resW) html += '<p class="help" style="margin:.1rem 0;">With digamma counted: ' + (l.resW.ok ? '<span style="font-family:\'IBM Plex Mono\',monospace">' + esc(V.scansionString(l.resW)) + "</span> · " + (l.resW.cost < res.cost - 0.3 ? "easier, so the digamma helps the line" : l.resW.cost > res.cost + 0.3 ? "harder, so the line goes against it" : "no different") : "the line does not scan") + ".</p>";
      html += sylControls(l);
    }
    // The scansion the page chose stands first and is what shows; the others follow,
    // easiest first, each with the feet it would give.
    const feet = (p) => p.split("").map((c) => (c === "D" ? "–⏑⏑" : "––")).join(" | ") + " | –×";
    const chosen = l.free.ok ? l.free.pat + "   " + V.scansionString(l.free) + "   · chosen by the page" : "no scansion found";
    const ranked = l.free.ranked.filter((r) => r.pat !== l.free.pat).map((r) => [r.pat, r.pat + "   " + feet(r.pat) + "   · " + (r.cost - l.free.cost >= 100 ? "far off" : "harder by " + (r.cost - l.free.cost).toFixed(1))]);
    V.PATTERNS.forEach((p) => { if (p !== l.free.pat && !ranked.some((r) => r[0] === p)) ranked.push([p, p + "   " + feet(p) + "   · does not fit as it stands"]); });
    html += '<div class="vs-row" style="margin-top:.5rem"><div class="field vs-wide"><label for="vPat"><strong>Scansion</strong> <span class="help">feet 1 to 5: D dactyl, S spondee.' + (ov.pat ? " Set by hand." : "") + '</span></label><select id="vPat" class="vs-pat">' + opt(ranked, ov.pat, chosen) + "</select></div>" +
      '<div class="field vs-wide"><label for="vNote"><strong>Note on the line</strong></label><input type="text" id="vNote" value="' + esc(ov.note || "") + '" autocomplete="off"></div></div>';
    html += '<div class="field"><label for="vText"><strong>Text</strong> <span class="help">correct it here, in Greek or Beta Code; the line is scanned again</span></label><input type="text" id="vText" class="enc-greek" value="' + esc(l.text) + '" autocomplete="off" spellcheck="false"></div>';
    if (l.raw.alt) html += '<p class="help" style="margin:0 0 .4rem;">Other readings: ' + l.raw.alt.map((a, i) => esc(a[0]) + ' <span class="enc-greek">' + esc(a[1]) + '</span> <button type="button" class="btn btn-sm" data-act="reading" data-r="' + i + '">Scan this</button>').join(" · ") + "</p>";
    if (l.items.length) html += '<div class="enc-sub">In this line</div>' + l.items.map((it) => itemHtml(l, it)).join("");
    else if (res.ok) html += '<p class="help">Nothing in this line needs a decision.</p>';
    body.innerHTML = html + "</div>";
    foot.innerHTML = '<div class="btn-row"><button class="btn btn-primary" id="primary" type="button">' + (l.checked ? "Checked · next line" : "Mark checked · next line") + '</button><button class="btn" data-act="next" type="button">Skip</button>' +
      (l.textChanged ? '<button class="btn" data-act="restore" type="button">Restore the text</button>' : "") + (l.ov ? '<button class="btn btn-warn" data-act="reset" type="button">Undo every change to this line</button>' : "") + "</div>" +
      '<p class="help enc-keys"><kbd>Enter</kbd> checked and next · <kbd>N</kbd> next · <kbd>B</kbd> back</p>';
  }

  /* ---- saving --------------------------------------------------------------------- */
  function saveLine(l, change) {
    const ov = Object.assign({}, l.ov || {});
    change(ov);
    ["q", "div", "syn", "wt"].forEach((k) => { ov[k] = cleanMap(ov[k]); if (!Object.keys(ov[k]).length) delete ov[k]; });
    ["text", "pat", "note", "checked"].forEach((k) => { if (!ov[k]) delete ov[k]; });
    if (ov.text === l.raw.t) delete ov.text;
    const empty = !Object.keys(ov).filter((k) => !["text_id", "work", "book", "line", "base", "feet", "weights"].includes(k)).length;
    if (empty) { put("vln", l.id, null); compute(l); return; }
    Object.assign(ov, { text_id: S.text.id, work: S.text.work, book: S.text.book, line: l.raw.n, base: l.raw.t });
    store.vln.set(l.id, ov);          // so the next scan sees it
    compute(l);
    ov.feet = l.res.ok ? l.res.pat : "";
    ov.weights = l.res.ok ? V.scansionString(l.res) : "";
    put("vln", l.id, ov);
  }
  function afterLineChange(l, keepSyl) {
    if (!keepSyl) S.syl = -1;
    renderLineRow(l); renderTally(); renderDesk(); renderCounts();
  }
  function saveItem(l, key) {
    const it = l.items.find((x) => x.key === key);
    if (!it) return;
    const rec = {};
    $("deskBody").querySelectorAll('[data-item="' + key + '"]').forEach((el) => { if (el.value.trim()) rec[el.dataset.f] = el.value.trim(); });
    if (!Object.keys(rec).length) { put("vit", it.id, null); it.rec = null; }
    else {
      const w = l.res.words[it.wi];
      Object.assign(rec, { text_id: S.text.id, work: S.text.work, book: S.text.book, line: l.raw.n, type: it.type, word: it.wi != null ? it.wi + 1 : "", form: it.form, machine: it.machine,
        what: it.what || (it.type === "digamma" ? wauHead(it.lex) : it.type === "infinitive" ? [it.tok.lemma, it.ending, it.sig].join(" · ") : it.syl != null ? sylText(l, l.res.sylls[it.syl]) : "") });
      if (it.type === "infinitive") {
        rec.alternatives = it.nec.map((x) => x.shown + ": " + x.verdict).join("; ");
        // what the page had filled in, so a changed answer can be told from a confirmed one
        if (it.fill.formula) rec.machine_formula = it.fill.formula;
        if (it.fill.variants) rec.machine_variants = it.fill.variants;
      }
      if (it.type === "digamma" && it.site) rec.context = it.site.ctx;
      void w;
      put("vit", it.id, rec); it.rec = rec;
    }
    const box = $("deskBody").querySelector('.vs-item[data-key="' + key + '"]');
    if (box) {
      box.classList.toggle("answered", !!it.rec); box.querySelector(".vs-head .small-muted").textContent = it.rec ? "answered" : "";
      if (it.rec) { box.querySelectorAll(".auto").forEach((el) => el.classList.remove("auto")); const note = box.querySelector(".vs-filled"); if (note) note.remove(); }
    }
    renderLineRow(l); renderCounts();
  }

  /* ---- moving about ----------------------------------------------------------------- */
  function go(dir) {
    if (!S.shown.length) return;
    const at = S.shown.indexOf(S.cur);
    const next = at < 0 ? 0 : at + dir;
    if (next < 0 || next >= S.shown.length) { toast(dir > 0 ? "That was the last line showing." : "That is the first line showing."); return; }
    openLine(S.shown[next]);
  }
  function markChecked() {
    const l = cur();
    if (!l) return;
    // Checking the line confirms what the page filled in and the reader left alone.
    l.items.filter((it) => !it.rec && it.fill && Object.keys(it.fill).some((k) => it.fill[k])).forEach((it) => saveItem(l, it.key));
    if (!l.checked) { saveLine(l, (ov) => { ov.checked = true; }); renderLineRow(l); renderTally(); renderCounts(); }
    go(1);
  }

  /* ---- events ----------------------------------------------------------------------- */
  $("textSel").addEventListener("change", (e) => loadText(e.target.value));
  $("showSel").addEventListener("change", (e) => { S.filter = e.target.value; renderReader(); renderTally(); if (!S.shown.includes(S.cur)) openLine(S.shown.length ? S.shown[0] : -1, true); else openLine(S.cur, true); });
  $("goLine").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const at = S.lines.findIndex((l) => String(l.raw.n) === e.target.value.trim());
    if (at < 0) { toast("This text has no line " + e.target.value.trim() + "."); return; }
    if (!S.shown.includes(at)) { S.filter = "all"; $("showSel").value = "all"; renderReader(); renderTally(); }
    openLine(at, true);
    e.target.blur();
  });
  $("lines").addEventListener("click", (e) => { const el = e.target.closest(".vs-ln"); if (el) openLine(+el.dataset.i); });
  $("deskBody").addEventListener("click", (e) => {
    const l = cur();
    if (!l) return;
    const col = e.target.closest(".syl-col");
    if (col) { S.syl = S.syl === +col.dataset.syl ? -1 : +col.dataset.syl; renderDesk(); return; }
    const b = e.target.closest("[data-act]");
    if (b && b.dataset.act === "reading") { saveLine(l, (ov) => { ov.text = l.raw.alt[+b.dataset.r][1]; ov.q = ov.div = ov.syn = ov.wt = {}; }); afterLineChange(l); }
  });
  $("deskBody").addEventListener("change", (e) => {
    const l = cur(), el = e.target;
    if (!l) return;
    if (el.dataset.ov) {
      const kind = el.dataset.ov, at = el.dataset.at, v = el.value;
      saveLine(l, (ov) => { ov[kind] = Object.assign({}, ov[kind]); if (v === "") delete ov[kind][at]; else ov[kind][at] = kind === "syn" ? +v : v; });
      afterLineChange(l);
    } else if (el.id === "vPat") { saveLine(l, (ov) => { ov.pat = el.value; }); afterLineChange(l); }
    else if (el.id === "vNote") { saveLine(l, (ov) => { ov.note = el.value.trim(); }); renderLineRow(l); renderCounts(); }
    else if (el.id === "vText") {
      const text = greekTyped(el.value).trim();
      el.value = text;
      if (!text) { el.value = l.text; return; }
      if (text === l.text) return;
      const apply = () => { saveLine(l, (ov) => { ov.text = text; ov.q = ov.div = ov.syn = ov.wt = {}; ov.pat = ""; }); afterLineChange(l); };
      // A new word may need its vowel lengths, which are kept in a separate file.
      if (S.lengths) apply();
      else fetch(DATA + "lengths.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((o) => { S.lengths = o; apply(); });
    } else if (el.dataset.item) {
      if (el.dataset.greek) el.value = greekTyped(el.value);
      saveItem(l, el.dataset.item);
    }
  });
  $("deskFoot").addEventListener("click", (e) => {
    const l = cur();
    if (!l) return;
    if (e.target.id === "primary") { markChecked(); return; }
    const act = e.target.dataset.act;
    if (act === "next") go(1);
    else if (act === "restore") { saveLine(l, (ov) => { ov.text = ""; ov.q = ov.div = ov.syn = ov.wt = {}; }); afterLineChange(l); }
    else if (act === "reset") {
      const was = l.ov;
      put("vln", l.id, null); compute(l); afterLineChange(l);
      toast("Changes to line " + l.raw.n + " undone.", () => { put("vln", l.id, was); compute(l); afterLineChange(l); });
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!panelOpen("panelEncode") || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { if (e.key === "Enter" && tag === "INPUT") e.target.blur(); return; }
    if (e.key === "Enter" && tag !== "BUTTON" && tag !== "A") { e.preventDefault(); markChecked(); return; }
    const k = e.key.toLowerCase();
    if (k === "n") { e.preventDefault(); go(1); }
    else if (k === "b") { e.preventDefault(); go(-1); }
  });

  /* ---- panels ------------------------------------------------------------------------ */
  function panelOpen(id) { return !$(id).querySelector(".panel-body").hidden; }
  function renderCounts() {
    $("nSaved").textContent = store.vln.size + store.vit.size ? " (" + (store.vln.size + store.vit.size) + ")" : "";
    $("nWau").textContent = S.index ? " (" + S.index.wau.length + ")" : "";
  }
  function renderWau() {
    const rows = S.index.wau.map((x) => {
      const r = store.vwl.get(x.id) || {};
      return "<tr><td><span class=\"pdg-form\">" + esc(x.head) + "</span></td><td>" + esc(x.note) + "</td><td>" + esc(x.status) + '</td><td><select data-wau="' + esc(x.id) + '" data-f="status">' + opt(STATUSES, r.status, "as suggested") +
        '</select></td><td><input type="text" data-wau="' + esc(x.id) + '" data-f="note" value="' + esc(r.note || "") + '" autocomplete="off"></td><td>' + x.n + "</td><td>" + x.observed + "</td><td>" + x.neglected + "</td></tr>";
    }).join("");
    $("wauIn").innerHTML = '<div class="card"><p class="help" style="margin-top:0;">These lexemes are treated as once beginning with digamma. The statuses are suggestions and have not been checked against a reference work. Set each one here; “no digamma” takes the lexeme out of the count. Tokens, observed and neglected are for every text, as the page first read them.</p>' +
      '<div class="table-wrap enc-table vs-wau" style="max-height:560px"><table class="paradigm-table"><thead><tr><th>Lexeme</th><th>Why</th><th>Suggested</th><th>Status</th><th>Note</th><th>Tokens</th><th>Observed</th><th>Neglected</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
  }
  $("wauIn").addEventListener("change", (e) => {
    const id = e.target.dataset.wau;
    if (!id) return;
    const rec = {};
    $("wauIn").querySelectorAll('[data-wau="' + id + '"]').forEach((el) => { if (el.value.trim()) rec[el.dataset.f] = el.value.trim(); });
    if (!Object.keys(rec).length) put("vwl", id, null);
    else put("vwl", id, Object.assign(rec, { id, lexeme: wauHead(id) }));
    if (S.text) { S.lines.forEach((l) => { if (l.wauAll.some((x) => x[1] === id)) compute(l); }); renderAll(); }
  });
  const LINE_COLS = ["text_id", "work", "book", "line", "text", "feet", "weights", "changed", "checked", "note"];
  const ITEM_COLS = ["text_id", "work", "book", "line", "type", "word", "form", "what", "machine", "answer", "detail", "note"];
  const changedOf = (v) => [v.text ? "text" : "", v.pat ? "feet" : "", v.wt ? "weight" : "", v.q ? "vowel length" : "", v.div ? "division" : "", v.syn ? "synizesis" : ""].filter(Boolean).join(", ");
  const detailOf = (v) => ["formula", "reading", "variants", "restorable", "older", "kind", "context", "alternatives"].filter((k) => v[k]).map((k) => k + ": " + v[k]).join("; ");
  const lineRows = () => [...store.vln.values()].map((v) => [v.text_id, v.work, v.book, v.line, v.text || v.base, v.feet, v.weights, changedOf(v), v.checked ? "1" : "", v.note || ""]);
  const itemRows = () => [...store.vit.values()].map((v) => [v.text_id, v.work, v.book, v.line, v.type, v.word, v.form, v.what || "", v.machine || "", v.answer || "", detailOf(v), v.note || ""]);
  function renderSaved() {
    const table = (cols, rows) => '<div class="table-wrap enc-table"><table class="paradigm-table"><thead><tr>' + cols.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.slice(0, 400).map((r) => "<tr>" + r.map((c, i) => "<td" + (cols[i] === "text" || cols[i] === "form" ? ' class="enc-greek"' : "") + ">" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
    const L = lineRows(), I = itemRows();
    $("savedIn").innerHTML = '<div class="card"><h2>Lines</h2><p class="help" style="margin-top:-.35rem;">' + plural(L.length, "line") + " checked or corrected, in every text." + (L.length > 400 ? " The first 400 are shown." : "") + "</p>" + (L.length ? table(LINE_COLS, L) : "") +
      '<div class="btn-row"><button class="btn" data-dl="lines" type="button">Download as CSV</button></div></div>' +
      '<div class="card"><h2>Decisions</h2><p class="help" style="margin-top:-.35rem;">' + plural(I.length, "decision") + "." + (I.length > 400 ? " The first 400 are shown." : "") + "</p>" + (I.length ? table(ITEM_COLS, I) : "") +
      '<div class="btn-row"><button class="btn" data-dl="items" type="button">Download as CSV</button><button class="btn" data-dl="backup" type="button">Download a backup of everything</button></div></div>';
  }
  $("savedIn").addEventListener("click", (e) => {
    const what = e.target.dataset.dl;
    if (what === "lines") saveFile("verse_lines.csv", csv([LINE_COLS].concat(lineRows())));
    else if (what === "items") saveFile("verse_decisions.csv", csv([ITEM_COLS].concat(itemRows())));
    else if (what === "backup") { saveFile("verse_encoder_backup.json", JSON.stringify({ vln: [...store.vln.entries()], vit: [...store.vit.entries()], vwl: [...store.vwl.entries()] })); kit.markBackedUp(); }
  });
  function refreshPanels() {
    if (!S.index) return;
    if (panelOpen("panelWau")) renderWau();
    if (panelOpen("panelSaved")) renderSaved();
  }
  document.querySelectorAll(".panel").forEach((panel) => panel.querySelector(".panel-head").addEventListener("click", () => setTimeout(refreshPanels, 0)));

  /* ---- boot --------------------------------------------------------------------------- */
  fetch(DATA + "index.json").then((r) => { if (!r.ok) throw new Error("index"); return r.json(); }).then((index) => {
    S.index = index;
    const saved = kit.load();
    S.filter = FILTERS[saved.filter] ? saved.filter : "all";
    $("showSel").value = S.filter;
    populateTexts();
    renderCounts();
    kit.start();
    return loadText(saved.textId || "hh-2", saved.line);
  }).catch(() => {
    $("encLoad").outerHTML = '<p class="cmp-warn">The texts did not load. Check your connection and reload the page.</p>';
  });
})();
