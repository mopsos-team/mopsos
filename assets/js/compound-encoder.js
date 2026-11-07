/* ============================================================================
 *  COMPOUND ENCODER: the unlisted page for encoding nominal compounds from texts
 *  outside the corpus. Saving is in encoder-store.js, the logic in compound-engine.js.
 * ========================================================================== */
(function () {
  "use strict";
  const E = window.CompoundEngine;
  const { $, esc, plural, hash, toGreek, toast, saveFile, copy, csv, createStore, createTranslations, loadTranslations } = window.EncoderKit;
  const translations = createTranslations($("lines"));
  let D = null, ix = null;
  const CATS = [["n", "noun"], ["a", "adjective"], ["a/n", "adjective or noun"], ["v", "verb"], ["d", "adverb"], ["r", "preposition"], ["m", "numeral"], ["p", "pronoun"], ["u", "uncertain"]];
  const CATLABEL = Object.fromEntries(CATS);
  const SUBS = ["", "thematic", "athematic", "-ā/a", "s-stem", "n-stem", "r-stem", "l-stem", "i-stem", "u-stem", "C-stem"];
  const LOCAL_KEY = "mopsos-encoder-v1";
  const WORK_ORDER = (a) => E.strip(a.lemma);

  /* ---- store ---------------------------------------------------------- */
  const COLLECTIONS = ["ent", "att", "not", "txt"];
  const kit = createStore({
    key: LOCAL_KEY, kinds: COLLECTIONS, url: document.body.dataset.sheetUrl || "",
    ui: () => ({ textId: S.text && S.text.id, onlyTodo: S.onlyTodo, pos: S.pos }),
    onRemote: (kinds) => {
      rebuildDerived();
      if (kinds.has("ent") || kinds.has("att")) classifyAll();
      populateTexts();
      renderReader();
      renderCounts();
      if (panelOpen("panelEntries")) renderEntries();
      if (panelOpen("panelExport")) renderExport();
    },
  });
  const store = kit.rows, put = kit.put, saveLocal = kit.save, SHEET_URL = kit.url;
  const putEntry = (id, v) => put("ent", id, v);
  const putNot = (id, v) => put("not", id, v);

  /* ---- state ---------------------------------------------------------- */
  const S = { text: null, lines: [], flat: [], pos: -1, onlyTodo: false, rendered: null };
  let F = null;
  let EX = { byKey: new Map(), byStem: new Map() };
  let doneKeys = new Set();

  const doneKey = (work, book, line, form) => work + "|" + book + "|" + line + "|" + form;
  function rebuildDerived() {
    const byKey = new Map(), byStem = new Map();
    const add = (k, hit) => { E.citeStems(k).forEach((s) => { if (s.length >= 4 && !byStem.has(s)) byStem.set(s, hit); }); };
    store.ent.forEach((e) => {
      const k = E.strip(e.lemma), hit = { local: e };
      byKey.set(k, hit);
      add(k, hit);
    });
    const derivative = (word, base) => {
      const k = E.strip(word), hit = { ...base, via: "derivative", word };
      if (!k) return;
      if (!byKey.has(k)) byKey.set(k, hit);
      add(k, hit);
    };
    store.ent.forEach((e) => (e.include || []).forEach((w) => derivative(w, { local: e })));
    // A catalogue compound has no entry to hold a derivative, so its attestation does.
    store.att.forEach((a) => {
      const e = store.ent.get(hash(a.lemma)), it = ix.items.get(a.lemma);
      if (a.deriv && (e || it)) derivative(a.deriv, e ? { local: e } : { items: [it] });
    });
    EX = { byKey, byStem };
    refreshDone();
  }
  function refreshDone() {
    doneKeys = new Set();
    store.att.forEach((a) => doneKeys.add(doneKey(a.work, a.book, a.line, a.form)));
  }
  /* ---- texts ---------------------------------------------------------- */
  const pasted = () => [...store.txt.values()];
  const allTexts = () => [...D.texts, ...pasted()];
  function populateTexts() {
    const sel = $("textSel"), cur = S.text ? S.text.id : "";
    const group = (label, list) => '<optgroup label="' + esc(label) + '">' + list.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.title) + "</option>").join("") + "</optgroup>";
    sel.innerHTML = group("Homeric Hymns", D.texts.filter((t) => t.group === "Homeric Hymns")) +
      group("Hesiod", D.texts.filter((t) => t.group === "Hesiod")) +
      (pasted().length ? group("Pasted texts", pasted()) : "") +
      '<option value="__paste">Paste another text…</option>';
    sel.value = cur;
    const works = [...new Set(allTexts().map((t) => t.work).concat(["Homeric Hymns", "Theogony", "Works and Days", "Shield", "Cypria", "Aethiopis", "Little Iliad", "Iliou Persis", "Nostoi", "Telegony", "Thebaid", "Epigoni", "Catalogue of Women"]))];
    $("workList").innerHTML = works.map((w) => '<option value="' + esc(w) + '">').join("");
  }
  function classifyAll() {
    S.lines.forEach((l) => l.toks.forEach((t) => { t.c = E.classify(ix, t.form, EX); }));
  }
  function loadText(id, pos) {
    const t = allTexts().find((x) => x.id === id) || D.texts[1];
    S.text = t;
    S.rendered = null;
    S.lines = t.lines.map(([n, s]) => ({ n, s, toks: E.tokenize(s) }));
    S.flat = [];
    S.lines.forEach((l, li) => l.toks.forEach((tk, ti) => S.flat.push({ li, ti })));
    classifyAll();
    S.pos = -1;
    $("textSel").value = t.id;
    renderReader();
    saveLocal();
    const at = typeof pos === "number" && pos >= 0 && pos < S.flat.length ? pos : -1;
    if (at >= 0) { S.pos = at; }
    const next = at >= 0 && isTodo(tokenAt(at)) ? at : findNext(1);
    if (next >= 0) openPos(next, { scroll: true }); else { S.pos = -1; F = null; renderDesk(); }
    $("lines").scrollTop = next >= 0 ? $("lines").scrollTop : 0;
  }
  const tokenAt = (p) => { const f = S.flat[p]; return f ? { l: S.lines[f.li], t: S.lines[f.li].toks[f.ti] } : null; };
  function stateOf(l, t) {
    if (doneKeys.has(doneKey(S.text.work, S.text.book, l.n, t.form))) return "done";
    if (store.not.has(hash(t.c.k))) return "skip";
    if (t.c.kind === "new" || t.c.kind === "known" || t.c.kind === "check") return t.c.kind;
    return "";
  }
  const isTodo = (x) => { if (!x) return false; const st = stateOf(x.l, x.t); return st === "new" || st === "known" || st === "check"; };
  function findNext(dir) {
    const n = S.flat.length;
    if (!n) return -1;
    let p = S.pos;
    for (let i = 0; i < n; i++) {
      p = (p + dir + n) % n;
      if (isTodo(tokenAt(p))) return p;
    }
    return -1;
  }

  /* ---- reader --------------------------------------------------------- */
  function counts() {
    const c = { new: 0, known: 0, check: 0, done: 0, skip: 0 };
    S.lines.forEach((l) => l.toks.forEach((t) => { const st = stateOf(l, t); if (st) c[st]++; }));
    return c;
  }
  function wordClass(l, t, li, ti) {
    const st = stateOf(l, t);
    const cur = S.flat[S.pos] && S.flat[S.pos].li === li && S.flat[S.pos].ti === ti;
    return "w" + (st ? " " + st : "") + (cur ? " cur" : "");
  }
  function renderTally() {
    const c = counts();
    const bits = [c.new + " new", c.known + " in the catalogue"];
    if (c.check) bits.push(c.check + " to check");
    bits.push(c.done + " logged");
    if (c.skip) bits.push(c.skip + " set aside");
    $("tally").textContent = bits.join(" · ");
    const bulk = $("bulk");
    bulk.hidden = !c.known;
    if (!bulkArmed) bulk.textContent = "Log all " + plural(c.known, "catalogue word");
  }
  function buildLines() {
    const box = $("lines");
    let html = "";
    S.lines.forEach((l, li) => {
      let out = "", p = 0, any = false;
      l.toks.forEach((t, ti) => {
        const cls = wordClass(l, t, li, ti);
        if (/ (new|known|check)/.test(cls)) any = true;
        out += esc(l.s.slice(p, t.start));
        out += '<span class="' + cls + '" data-l="' + li + '" data-t="' + ti + '">' + esc(t.form) + "</span>";
        p = t.end;
      });
      out += esc(l.s.slice(p));
      const onScreen = !(S.onlyTodo && !any);
      if (onScreen) html += '<div class="enc-ln"><span class="enc-no">' + esc(l.n) + '</span><span class="enc-tx">' + out + "</span></div>";
      html += translations.after(S.text.id, S.lines, li, onScreen);
    });
    box.innerHTML = html || '<p class="help">Every flagged word in this text is dealt with. Clear the filter to read the whole text and click anything that was missed.</p>';
    S.lines.forEach((l) => l.toks.forEach((t) => { t.el = null; }));
    box.querySelectorAll(".w").forEach((el) => { S.lines[+el.dataset.l].toks[+el.dataset.t].el = el; });
    S.rendered = S.text.id + "|" + S.onlyTodo;
  }
  // Repainting classes leaves the DOM in place; rebuilding thousands of spans
  // after every save is what makes a long text feel heavy.
  function renderReader(force) {
    renderTally();
    const box = $("lines"), top = box.scrollTop;
    if (force || S.onlyTodo || S.rendered !== S.text.id + "|" + S.onlyTodo) {
      buildLines();
      box.scrollTop = top;
      return;
    }
    S.lines.forEach((l, li) => l.toks.forEach((t, ti) => {
      if (!t.el) return;
      const cls = wordClass(l, t, li, ti);
      if (t.el.className !== cls) t.el.className = cls;
    }));
  }
  function markCurrent(scroll) {
    const box = $("lines");
    box.querySelectorAll(".w.cur").forEach((e) => e.classList.remove("cur"));
    const f = S.flat[S.pos];
    if (!f) return;
    const el = S.lines[f.li].toks[f.ti].el;
    if (el) {
      el.classList.add("cur");
      if (scroll) {
        const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (r.top < b.top + 40 || r.bottom > b.bottom - 40) box.scrollTop += r.top - b.top - b.height / 3;
      }
    }
  }
  function openPos(p, opts) {
    S.pos = p;
    const x = tokenAt(p);
    if (!x) return;
    F = makeForm(x.l, x.t);
    markCurrent(opts && opts.scroll);
    renderDesk({ focusPrimary: !(opts && opts.noFocus) });
    saveLocal();
  }

  /* ---- forms ---------------------------------------------------------- */
  const blankAna = () => ({ seg: "", m1: "", m1c: "", m1s: "", m2: "", m2c: "", m2s: "", unc: false, auto: { seg: true, m1: true, m2: true }, touched: false });
  function fillAna(f, i, p) {
    const r = E.proposalRow(f.headword, p);
    f.ana[i] = { seg: r.segmentation || f.headword, m1: r.member1, m1c: r.member1_category, m1s: r.member1_subcategory,
      m2: r.member2, m2c: r.member2_category, m2s: r.member2_subcategory, unc: false, auto: { seg: true, m1: true, m2: true }, touched: false };
    f.used = p;
    autoExtras(f);
  }
  function anaRow(a) { return { member1: a.m1, member2: a.m2 }; }
  function autoExtras(f) {
    const first = f.ana[0];
    if (!first) return;
    const r = anaRow(first);
    if (!f.touchedMc) f.mc = E.memberIsCompound(ix, r) ? 3 : 2;
    if (!f.touchedLink) f.link = [r.member1, r.member2].filter((m) => m && ix.items.has(m)).join(", ");
  }
  function newForm(word, att, c) {
    const existing = store.ent.get(hash(word));
    if (existing) return entryForm(existing, att, c);
    const f = { mode: "new", headword: word, props: E.decompose(ix, word, { limit: 6 }), ana: [blankAna()], inferred: false, mc: 2, link: "", inc: "", note: "", att, ctx: c || null, used: null };
    f.ana[0].seg = word;
    if (f.props[0]) fillAna(f, 0, f.props[0]);
    return f;
  }
  function entryForm(e, att, c) {
    return { mode: "new", editing: true, headword: e.lemma, props: E.decompose(ix, e.lemma, { limit: 6 }),
      ana: e.analyses.map((a) => ({ seg: a.seg, m1: a.m1, m1c: a.m1c, m1s: a.m1s, m2: a.m2, m2c: a.m2c, m2s: a.m2s, unc: !!a.unc, auto: {}, touched: true })),
      inferred: !!e.inferred, mc: e.member_count || 2, link: e.link_to || "", inc: (e.include || []).join(", "), note: e.note || "", att, ctx: c || null,
      touchedMc: true, touchedLink: true, used: null };
  }
  const itemInferred = (it) => (it.rows ? it.rows.every((r) => String(r.inferred) === "1") : !!(it.entry && it.entry.inferred));
  function catalogueForm(items, att, c) {
    const via = c && c.via;
    const f = { mode: "catalogue", items, pick: 0, att: att ? { ...att, star: via === "derivative" || itemInferred(items[0]) } : null, ctx: c || null };
    if (via === "derivative" && att) f.deriv = { word: c.word || E.citeAccent(att.form), base: items[0].lemma, known: true, back: null, star: false };
    return f;
  }
  function makeForm(l, t) {
    const c = t.c;
    const att = { work: S.text.work, book: S.text.book, line: l.n, form: t.form, star: false, doc: S.text.id };
    if (c.local) return catalogueForm([{ lemma: c.local.lemma, entry: c.local }], att, c);
    if (c.kind === "known" || c.kind === "check") return catalogueForm(c.items, att, c);
    const word = c.kind === "new" ? c.headword : (c.lemma ? c.lemma.lemma : E.citeAccent(t.form));
    return newForm(word, att, c.kind === "new" ? c : null);
  }
  const curItem = () => F.items[F.pick];
  const attId = (lemma, a) => hash([lemma, a.work, a.book, a.line, a.form].join("|"));
  const isLogged = (lemma, a) => !!a && store.att.has(attId(lemma, a));
  function statusHtml() {
    if (newDerivative()) return "";
    if (F.mode === "catalogue") {
      const it = curItem(), logged = isLogged(it.lemma, F.att);
      const place = F.deriv ? 'Derivative of <span class="enc-greek">' + esc(it.lemma) + "</span>" : it.entry ? "Encoded on this page" : "In the catalogue";
      const state = place + (logged ? ", attestation logged." : ".");
      const also = F.ctx && F.ctx.capital ? " Capitalized here, but this headword is lowercase. If it is a name, type the name as the headword."
        : F.ctx && F.ctx.nameStem ? " A name matched by its stem only. If it is a different name, type it as the headword."
        : F.ctx && F.ctx.also && F.ctx.also.length ? " This spelling can also be " + F.ctx.also.slice(0, 3).map((e) => '<span class="enc-greek">' + esc(e.lemma) + "</span>").join(", ") + "." : "";
      const check = F.ctx && F.ctx.kind === "check";
      return '<p class="help enc-note">' + (check ? '<span class="cmp-warn">Check the reading.</span> ' : "") + state + also + "</p>";
    }
    const c = F.ctx;
    let note;
    if (F.typed) note = "Typed by hand. Add a line number below to record where it occurs.";
    else if (F.editing) note = "Editing a saved compound.";
    else if (c && c.inHomer) note = "This word is in Homer, but the catalogue has no entry for it.";
    else if (c && c.sure) note = "New. The headword is the corpus lemma.";
    else if (c) note = 'New. Headword worked out from <span class="enc-greek">' + esc(F.att ? F.att.form : "") + "</span>; check the ending and accent.";
    else note = "Not flagged. Encode it if it is a compound.";
    return '<p class="help enc-note">' + note + "</p>";
  }
  function contextHtml() {
    if (!F.att || F.typed || !S.flat[S.pos] || F.att.doc !== S.text.id) return "";
    const f = S.flat[S.pos], l = S.lines[f.li], t = l.toks[f.ti];
    return '<p class="enc-ctx">' + esc(l.s.slice(0, t.start)) + "<mark>" + esc(t.form) + "</mark>" + esc(l.s.slice(t.end)) + "</p>";
  }
  const catOptions = (v) => '<option value=""></option>' + CATS.map(([k, l]) => '<option value="' + esc(k) + '"' + (k === v ? " selected" : "") + ">" + esc(l) + "</option>").join("");
  const subOptions = (v) => SUBS.map((s) => '<option value="' + esc(s) + '"' + (s === v ? " selected" : "") + ">" + esc(s || "(none)") + "</option>").join("");
  const tagOf = (c, s) => [CATLABEL[c] || c, s].filter(Boolean).join(", ");
  function propsHtml() {
    if (!F.props.length) return '<p class="help enc-note">No suggestion for this word. Fill in the members below.</p>';
    const GRADE = { strong: "both members seen", likely: "one member seen", partial: "half filled", weak: "from the corpus" };
    const side = (m) => (m.member ? esc(m.member) : "?");
    const rows = F.props.map((p, i) => {
      const r = E.proposalRow(F.headword, p);
      const ex = [...new Set([...(p.m1.ex || []), ...(p.m2.ex || [])])].slice(0, 2);
      const why = GRADE[p.grade] + (ex.length ? ", as in " + ex.join(", ") : "");
      return '<tr class="' + (F.used === p ? "on" : "") + '" data-act="use" data-p="' + i + '"><td><kbd>' + (i + 1) + "</kbd></td>" +
        '<td><span class="pdg-form">' + esc(r.segmentation) + "</span></td>" +
        '<td><span class="pdg-form">' + side(p.m1) + " + " + side(p.m2) + '</span><br><span class="pdg-c" style="margin-left:0">' + esc(why) + "</span></td>" +
        '<td><button type="button" class="fig-dl" data-act="add" data-p="' + i + '" title="Keep this as an extra analysis" aria-label="Add as another analysis">+</button></td></tr>';
    }).join("");
    return '<table class="paradigm-table enc-props"><thead><tr><th></th><th>Segmentation</th><th>Members</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>";
  }
  function anaHtml(a, i, n) {
    const auto = (k) => (a.auto[k] && (k !== "seg" ? a[k] : a.seg) ? " auto" : "");
    const mem = (s, label) => '<div class="enc-mem">' +
      '<div class="field"><label for="m' + s + "_" + i + '"><strong>' + label + '</strong></label><div class="combo"><input type="text" id="m' + s + "_" + i + '" class="enc-greek' + auto("m" + s) + '" data-combo="member" data-slot="' + s + '" data-a="' + i + '" data-field="m' + s + '" value="' + esc(a["m" + s]) + '" autocomplete="off" spellcheck="false"></div></div>' +
      '<div class="field"><label for="c' + s + "_" + i + '"><strong>Category</strong></label><select id="c' + s + "_" + i + '" class="' + (auto("m" + s) && a["m" + s + "c"] ? "auto" : "") + '" data-field="m' + s + 'c" data-a="' + i + '">' + catOptions(a["m" + s + "c"]) + "</select></div>" +
      '<div class="field"><label for="s' + s + "_" + i + '"><strong>Subcategory</strong></label><select id="s' + s + "_" + i + '" class="' + (auto("m" + s) && a["m" + s + "s"] ? "auto" : "") + '" data-field="m' + s + 's" data-a="' + i + '">' + subOptions(a["m" + s + "s"]) + "</select></div></div>";
    return '<div class="word-inline"><div class="enc-sub" style="margin-top:0">' + (n > 1 ? "Analysis " + (i + 1) + " of " + n : "Analysis") + "</div>" +
      '<div class="field"><label for="seg_' + i + '"><strong>Segmentation</strong></label><input type="text" id="seg_' + i + '" class="enc-greek' + auto("seg") + '" data-field="seg" data-a="' + i + '" value="' + esc(a.seg) + '" autocomplete="off" spellcheck="false"></div>' +
      mem(1, "First member") + mem(2, "Second member") +
      '<div class="enc-end"><label class="regex-toggle"><input type="checkbox" id="unc_' + i + '" data-field="unc" data-a="' + i + '"' + (a.unc ? " checked" : "") + "> Uncertain analysis</label>" +
      (n > 1 ? '<button type="button" class="btn btn-warn" data-act="rm-ana" data-a="' + i + '">Remove</button>' : "") + "</div></div>";
  }
  function linkChips() {
    const a = F.ana[0]; if (!a) return "";
    const have = F.link.split(",").map((s) => s.trim());
    const list = E.linkSuggestions(ix, anaRow(a), F.headword).filter((l) => !have.includes(l)).slice(0, 6);
    if (!list.length) return "";
    return '<div class="enc-chips"><span class="small-muted">Add a link:</span>' + list.map((l) => '<button type="button" class="fig-dl enc-greek" data-act="link" data-v="' + esc(l) + '">' + esc(l) + "</button>").join("") + "</div>";
  }
  let detailsOpen = false;
  function moreHtml() {
    const open = detailsOpen || F.inferred || F.link || F.inc || F.note || +F.mc !== 2;
    return '<div class="btn-row"><button type="button" class="adv-toggle" id="moreBtn" data-act="more">Headword details ' + (open ? "▴" : "▾") + "</button></div>" +
      '<div class="adv-panel" id="more"' + (open ? "" : " hidden") + ">" +
      '<div class="field"><label class="regex-toggle"><input type="checkbox" id="inferred"' + (F.inferred ? " checked" : "") + "> Headword is inferred, not itself attested (shown with *)</label></div>" +
      '<div class="enc-mem" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr);">' +
      '<div class="field"><label for="mc"><strong>Members</strong></label><input type="text" id="mc" inputmode="numeric" value="' + esc(F.mc) + '"></div>' +
      '<div class="field"><label for="link"><strong>Link to</strong></label><input type="text" id="link" class="enc-greek" value="' + esc(F.link) + '" spellcheck="false" placeholder="comma separated"></div></div>' +
      '<div id="linkChips">' + linkChips() + "</div>" +
      '<div class="field"><label for="inc"><strong>Derivatives counted with it</strong></label><input type="text" id="inc" class="enc-greek" value="' + esc(F.inc) + '" spellcheck="false" placeholder="comma separated"></div>' +
      '<div class="field"><label for="note"><strong>Note for the team</strong> <span class="help">not exported to the site</span></label><input type="text" id="note" value="' + esc(F.note) + '"></div>' +
      "</div>";
  }
  function derivHtml() {
    const d = F.deriv;
    const box = '<label class="regex-toggle" style="white-space:normal"><input type="checkbox" id="derivBox"' + (d ? " checked" : "") + "> This compound is a derivative of another compound</label>";
    if (!d) return '<div class="field">' + box + "</div>";
    const greek = (w) => '<span class="enc-greek">' + esc(w) + "</span>";
    const likely = d.base ? [] : E.baseCandidates(ix, d.word, [...store.ent.values()].map((e) => e.lemma), 5);
    let hint = "";
    if (!d.base) hint = "Choose a listed compound, or type a new one to add its analysis.";
    else if (!d.known) hint = F.mode === "new" ? greek(d.base) + " is not listed yet. Add its analysis below." : greek(d.word) + " will be logged under " + greek(d.base) + " with (*).";
    const own = !d.known && d.base && store.ent.get(hash(d.word)), n = !d.known && d.base ? [...store.att.values()].filter((a) => a.lemma === d.word).length : 0;
    const warn = own || n ? "Saving moves " + plural(n, "attestation") + " of " + greek(d.word) + " to " + greek(d.base) + (own ? " and removes it as a compound of its own" : "") + "." : "";
    return '<div class="word-inline"><div class="field">' + box + "</div>" +
      '<div class="field"><label for="base"><strong>Base compound</strong> <span class="help">Greek or Beta Code</span></label><div class="combo"><input type="text" id="base" data-combo="base" value="' + esc(d.base) + '" autocomplete="off" spellcheck="false"></div></div>' +
      (likely.length ? '<div class="enc-chips"><span class="small-muted">Likely base:</span>' + likely.map((l) => '<button type="button" class="fig-dl enc-greek" data-act="base" data-v="' + esc(l) + '">' + esc(l) + "</button>").join("") + "</div>" : "") +
      (hint ? '<p class="help" style="margin:0">' + hint + "</p>" : "") +
      (warn ? '<p class="cmp-warn" style="margin:.3rem 0 0">' + warn + "</p>" : "") + "</div>";
  }
  function attHtml() {
    const a = F.att;
    if (!a) return "";
    return '<div class="word-inline"><div class="enc-sub" style="margin-top:0">Attestation</div>' +
      '<div class="enc-mem"><div class="field"><label for="attWork"><strong>Work</strong></label><input type="text" id="attWork" list="workList" data-att="work" value="' + esc(a.work) + '"></div>' +
      '<div class="field"><label for="attBook"><strong>Book or hymn</strong></label><input type="text" id="attBook" data-att="book" value="' + esc(a.book) + '"></div>' +
      '<div class="field"><label for="attLine"><strong>Line</strong></label><input type="text" id="attLine" data-att="line" value="' + esc(a.line) + '"></div></div>' +
      '<div class="field"><label for="attForm"><strong>Form in the text</strong></label><input type="text" id="attForm" class="enc-greek" data-att="form" value="' + esc(a.form) + '" spellcheck="false"></div>' +
      (F.mode === "catalogue" && a.star && !F.deriv ? '<p class="help" style="margin:0">The headword is inferred, so this is logged with (*).</p>' : "") + "</div>";
  }
  function hwField(v, label) {
    return '<div class="field"><label for="hw"><strong>' + (label || "Headword") + '</strong> <span class="help">Greek or Beta Code</span></label><div class="combo"><input type="text" id="hw" data-combo="head" value="' + esc(v) + '" autocomplete="off" spellcheck="false"></div></div>';
  }
  function renderDesk(opts) {
    opts = opts || {};
    const body = $("deskBody"), foot = $("deskFoot");
    if (!F) {
      const done = S.flat.length && findNext(1) < 0;
      foot.innerHTML = "";
      body.innerHTML = hwField("") + '<p class="help">' + (done ? "Everything flagged in this text is dealt with. Read through and click anything that was missed, or type a compound above." : "Click a word in the text, or type a compound above.") + "</p>";
      return;
    }
    let html = "";
    const d = F.deriv, pending = d && !d.base, adding = newDerivative();
    html += d ? hwField(d.word, "Derivative") : hwField(F.mode === "catalogue" ? curItem().lemma : F.headword);
    html += statusHtml() + contextHtml() + derivHtml();
    if (pending) html += attHtml();
    else if (F.mode === "catalogue") {
      const it = curItem();
      if (F.items.length > 1) html += '<div class="enc-chips">' + F.items.map((x, i) => '<button type="button" class="' + (i === F.pick ? "btn" : "fig-dl") + ' enc-greek" data-act="pick" data-i="' + i + '">' + esc(x.lemma) + "</button>").join("") + "</div>";
      const rows = it.rows || it.entry.analyses.map((a) => ({ segmentation: a.seg, member1: a.m1, member1_category: a.m1c, member1_subcategory: a.m1s, member2: a.m2, member2_category: a.m2c, member2_subcategory: a.m2s, uncertain: a.unc ? "1" : "0" }));
      html += rows.map((r, i) => '<table class="paradigm-table" style="margin-bottom:.45rem"><tbody>' +
        (rows.length > 1 ? '<tr><th colspan="2">Analysis ' + (i + 1) + " of " + rows.length + "</th></tr>" : "") +
        '<tr><th>Segmentation</th><td><span class="pdg-form">' + esc(r.segmentation) + "</span></td></tr>" +
        '<tr><th>First member</th><td><span class="pdg-form">' + esc(r.member1 || "?") + '</span><span class="pdg-c">' + esc(tagOf(r.member1_category, r.member1_subcategory)) + "</span></td></tr>" +
        '<tr><th>Second member</th><td><span class="pdg-form">' + esc(r.member2 || "?") + '</span><span class="pdg-c">' + esc(tagOf(r.member2_category, r.member2_subcategory)) + "</span></td></tr>" +
        (String(r.uncertain) === "1" ? '<tr><td colspan="2" class="cmp-warn">This analysis is uncertain.</td></tr>' : "") + "</tbody></table>").join("");
      html += attHtml();
    } else {
      html += '<div class="enc-sub">Suggestions</div>' + propsHtml();
      html += F.ana.map((a, i) => anaHtml(a, i, F.ana.length)).join("");
      html += '<div class="btn-row"><button type="button" class="fig-dl" data-act="more-ana">Add another analysis</button></div>';
      html += moreHtml() + attHtml();
    }
    html += '<p class="cmp-warn" id="formErr" hidden></p>';
    body.innerHTML = html;
    const logged = F.mode === "catalogue" && isLogged(curItem().lemma, F.att);
    const label = adding ? "Save derivative" : F.mode === "new" ? (F.editing ? "Save changes" : "Save compound") : (logged || (!hasAtt(F.att) && !F.typed) ? "Next word" : "Log attestation");
    foot.innerHTML = '<div class="btn-row"><button type="button" class="btn" id="primary">' + label + "</button>" +
      (F.att && !F.typed && F.att.doc === (S.text && S.text.id) ? '<button type="button" class="btn btn-warn" id="notBtn">Not a compound</button>' : "") +
      '<button type="button" class="btn btn-warn" id="skipBtn">Skip</button></div>' +
      '<p class="help enc-keys"><kbd>Enter</kbd> ' + esc(label.toLowerCase()) + (F.mode === "new" && !pending && F.props.length ? " · <kbd>1</kbd>–<kbd>" + F.props.length + "</kbd> suggestion" : "") + " · <kbd>X</kbd> not a compound · <kbd>N</kbd> skip · <kbd>B</kbd> back</p>";
    if (opts.focusPrimary && matchMedia("(min-width: 901px)").matches) $("primary").focus({ preventScroll: true });
    if (opts.focusId) {
      const el = $(opts.focusId);
      if (el) { el.focus({ preventScroll: true }); if (el.setSelectionRange && el.value != null) { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* not a text input */ } } }
    }
    body.scrollTop = 0;
  }
  function showErr(msg) {
    const el = $("formErr");
    if (!el) return;
    el.textContent = msg; el.hidden = !msg;
    if (msg) el.scrollIntoView({ block: "nearest" });
  }

  /* ---- saving --------------------------------------------------------- */
  function logAtt(lemma, a) {
    const id = attId(lemma, a);
    const had = store.att.get(id) || null;
    const row = { lemma, work: a.work, book: a.book, line: a.line, form: a.form || lemma, star: a.star ? 1 : 0, doc: a.doc || "misc", at: Date.now() };
    if (a.deriv) row.deriv = a.deriv;
    put("att", id, row);
    return () => put("att", id, had);
  }
  // A word typed by hand may have no citation yet; a line number without a
  // work is the only state that cannot be exported.
  const hasAtt = (a) => !!a && !!String(a.line).trim();
  function validAtt(a) {
    if (hasAtt(a) && !a.work.trim()) return "Give the work for this attestation.";
    return "";
  }
  function after(undos, msg) {
    rebuildDerived(); classifyAll(); renderCounts();
    toast(msg, () => { undos.slice().reverse().forEach((u) => u()); rebuildDerived(); classifyAll(); renderReader(); renderCounts(); if (S.pos >= 0) openPos(S.pos, { noFocus: true }); });
    goNext(1);
  }
  function commitNew() {
    flushFields();
    const head = F.headword.trim();
    if (!head || !E.hasGreek(head)) return showErr("Enter the headword in Greek or Beta Code.");
    const ana = F.ana.filter((a) => a.m1 || a.m2 || (a.seg && a.seg !== head));
    if (!ana.length) return showErr("Give at least one member, or mark the word as not a compound.");
    const d = newDerivative(), derErr = d ? derivErr(d, head) : ""; if (derErr) return showErr(derErr);
    const attErr = validAtt(F.att); if (attErr) return showErr(attErr);
    const id = hash(head), prev = store.ent.get(id) || null;
    const cleaned = ana.map((a) => ({ seg: a.seg.trim(), m1: a.m1.trim(), m1c: a.m1c || (a.m1 ? "u" : ""), m1s: a.m1s, m2: a.m2.trim(), m2c: a.m2c || (a.m2 ? "u" : ""), m2s: a.m2s, unc: a.unc ? 1 : 0 }));
    const include = F.inc.split(",").map((s) => s.trim()).filter(Boolean);
    if (d && !include.includes(d.word)) include.push(d.word);
    const entry = { lemma: head, inferred: F.inferred ? 1 : 0, analyses: cleaned, member_count: parseInt(F.mc, 10) || 2, link_to: F.link.trim(),
      include, note: F.note.trim(), at: Date.now() };
    putEntry(id, entry);
    const undos = [() => putEntry(id, prev)];
    if (F.att) F.att.star = !!(d || F.inferred);
    if (hasAtt(F.att)) undos.push(logAtt(head, F.att));
    if (d) settleDerivative(undos, d.word, head, "");
    after(undos, d ? "Saved " + head + " with its derivative " + d.word : "Saved " + head);
  }
  function commitCatalogue() {
    flushFields();
    const it = curItem(), d = newDerivative();
    if (d) return commitDerivative(it, d);
    if (!hasAtt(F.att)) { if (F.typed) showErr("Give the line for this attestation."); else goNext(1); return; }
    if (isLogged(it.lemma, F.att)) return goNext(1);
    const attErr = validAtt(F.att); if (attErr) return showErr(attErr);
    after([logAtt(it.lemma, F.att)], "Logged " + it.lemma + " at line " + F.att.line);
  }
  function derivErr(d, base) {
    if (!d.word || !E.hasGreek(d.word)) return "Enter the derivative in Greek or Beta Code.";
    if (E.strip(d.word) === E.strip(base)) return "The base has to be a different compound from the derivative.";
    const own = store.ent.get(hash(d.word));
    if (own && (own.include || []).length) return own.lemma + " has derivatives of its own. Move them to the base under Headword details first.";
    return "";
  }
  // Whatever the page held for this word as a compound of its own now belongs to
  // the base, and so does any earlier log of this same token.
  function settleDerivative(undos, word, base, deriv) {
    const a = F.att, token = (r) => hasAtt(a) && r.work === a.work && r.book === a.book && r.line === a.line && r.form === a.form;
    [...store.att.entries()].filter(([, r]) => r.lemma !== base && (r.lemma === word || token(r))).forEach(([id, r]) => {
      put("att", id, null);
      undos.push(() => put("att", id, r));
      if (r.lemma === word) undos.push(logAtt(base, { ...r, star: true, deriv }));
    });
    const id = hash(word), own = store.ent.get(id);
    if (own) { putEntry(id, null); undos.push(() => putEntry(id, own)); }
  }
  function commitDerivative(it, d) {
    const err = derivErr(d, it.lemma) || validAtt(F.att); if (err) return showErr(err);
    const id = hash(it.lemma), e = store.ent.get(id);
    if (!e && !hasAtt(F.att) && ![...store.att.values()].some((a) => a.lemma === d.word)) return showErr("Give the line for this attestation.");
    const undos = [], deriv = e ? "" : d.word;
    if (e && !(e.include || []).includes(d.word)) {
      putEntry(id, { ...e, include: [...(e.include || []), d.word], at: Date.now() });
      undos.push(() => putEntry(id, e));
    }
    if (hasAtt(F.att)) undos.push(logAtt(it.lemma, { ...F.att, star: true, deriv }));
    settleDerivative(undos, d.word, it.lemma, deriv);
    after(undos, "Logged " + d.word + " under " + it.lemma);
  }
  function primary() {
    if (!F) return;
    if (F.deriv && !F.deriv.base) {
      const b = $("base");
      if (b && b.value.trim()) setBase(b.value, "primary"); else showErr("Choose the base compound, or type a new one.");
      return;
    }
    if (F.mode === "new") commitNew(); else commitCatalogue();
  }
  function markNot() {
    const x = tokenAt(S.pos);
    if (!x || (F && F.typed)) return;
    const id = hash(x.t.c.k);
    putNot(id, { k: x.t.c.k, form: x.t.form, at: Date.now() });
    after([() => putNot(id, null)], x.t.form + " will not be flagged again");
  }
  function goNext(dir) {
    renderReader();
    const n = findNext(dir);
    if (n < 0) { F = null; S.pos = -1; markCurrent(false); renderDesk(); return; }
    openPos(n, { scroll: true });
  }
  // Text fields update F as they change; this catches a value not yet blurred.
  function flushFields() {
    if (!F) return;
    document.querySelectorAll('#deskBody input[data-combo="member"], #deskBody input[data-field="seg"]').forEach((el) => {
      const v = toGreek(el.value);
      if (v !== el.value) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    const hw = $("hw");
    if (hw && F.deriv) F.deriv.word = toGreek(hw.value).trim();
    if (F.mode === "new") {
      if (hw && !F.deriv) F.headword = toGreek(hw.value).trim();
      const read = (id) => { const e = $(id); return e ? e.value : null; };
      const mc = read("mc"), link = read("link"), inc = read("inc"), note = read("note");
      if (mc != null) F.mc = mc; if (link != null) F.link = toGreek(link); if (inc != null) F.inc = toGreek(inc); if (note != null) F.note = note;
      const inf = $("inferred"); if (inf) F.inferred = inf.checked;
    }
  }

  /* ---- combo menus ---------------------------------------------------- */
  const Combo = { input: null, items: [], idx: -1 };
  function comboOpen(input) {
    const kind = input.dataset.combo, q = toGreek(input.value);
    let items = [];
    if (kind === "member") {
      items = E.searchMembers(ix, q, +input.dataset.slot, 9).map((m) => {
        const p = E.memberProfile(ix, m.member);
        return { value: m.member, meta: p ? [CATLABEL[p.cat] || p.cat, p.sub].filter(Boolean).join(", ") : "" };
      });
    } else if (E.strip(q).length >= 2) {
      items = E.searchCompounds(ix, q, 9).map((it) => ({ value: it.lemma, meta: "in the catalogue" }));
      [...store.ent.values()].filter((e) => E.strip(e.lemma).startsWith(E.strip(q))).slice(0, 4).forEach((e) => items.push({ value: e.lemma, meta: "encoded here" }));
    }
    Combo.input = input; Combo.items = items; Combo.idx = -1;
    const el = $("menu");
    if (!items.length) { el.hidden = true; return; }
    el.innerHTML = items.map((it, i) => '<div class="combo-item" data-i="' + i + '"><span class="combo-form">' + esc(it.value) + '</span><span class="combo-meta">' + esc(it.meta) + "</span></div>").join("");
    const r = input.getBoundingClientRect();
    el.hidden = false;
    el.style.left = r.left + "px";
    el.style.width = Math.max(r.width, 230) + "px";
    const below = window.innerHeight - r.bottom;
    el.style.top = (below > 170 ? r.bottom + 2 : Math.max(4, r.top - el.offsetHeight - 2)) + "px";
    const over = r.left + el.offsetWidth - window.innerWidth + 6;
    if (over > 0) el.style.left = Math.max(4, r.left - over) + "px";
  }
  function comboClose() { $("menu").hidden = true; Combo.items = []; Combo.input = null; Combo.idx = -1; }
  function comboMove(d) {
    const n = Combo.items.length; if (!n) return;
    Combo.idx = (Combo.idx + d + n) % n;
    [...$("menu").children].forEach((c, i) => { c.classList.toggle("on", i === Combo.idx); if (i === Combo.idx) c.scrollIntoView({ block: "nearest" }); });
  }
  function comboPick(i) {
    const input = Combo.input, it = Combo.items[i];
    comboClose();
    if (!input || !it) return;
    input.value = it.value;
    if (input.dataset.combo === "member") applyMember(+input.dataset.a, +input.dataset.slot, it.value, input);
    else if (input.dataset.combo === "base") setBase(it.value, "primary");
    else openHeadword(it.value);
  }
  function setField(id, value, cls) {
    const el = $(id); if (!el) return;
    el.value = value;
    if (cls !== undefined) el.classList.toggle("auto", cls);
  }
  function applyMember(i, s, member, input) {
    const a = F.ana[i]; if (!a) return;
    a["m" + s] = member; a.auto["m" + s] = false; a.touched = true;
    if (input) input.classList.remove("auto");
    const p = E.memberProfile(ix, member);
    if (p) {
      a["m" + s + "c"] = p.cat; a["m" + s + "s"] = p.sub;
      setField("c" + s + "_" + i, p.cat, true); setField("s" + s + "_" + i, p.sub, !!p.sub);
    }
    autoExtras(F);
    syncExtras();
  }
  function syncExtras() {
    const box = $("linkChips"); if (box) box.innerHTML = linkChips();
    const mc = $("mc"); if (mc) mc.value = F.mc;
    const link = $("link"); if (link) link.value = F.link;
    if ((F.link || +F.mc !== 2) && $("more")) { $("more").hidden = false; const b = $("moreBtn"); if (b) b.textContent = "Headword details ▴"; }
  }
  function sameWord(a, b) {
    const x = E.strip(a), y = E.strip(b);
    if (!x || !y) return false;
    const need = Math.min(4, Math.min(x.length, y.length));
    for (let i = 0; i + need <= x.length; i++) if (y.includes(x.slice(i, i + need))) return true;
    return false;
  }
  function handAtt(att) {
    return { work: att ? att.work : (S.text ? S.text.work : ""), book: att ? att.book : (S.text ? S.text.book : ""), line: "", form: "", star: false, doc: att ? att.doc : (S.text ? S.text.id : "misc") };
  }
  /* ---- derivatives ---------------------------------------------------- */
  // A derivative takes no analysis of its own. The analysis belongs to its base,
  // and the derivative counts under the base with a star. While the box is ticked,
  // F is the form for the base and F.deriv holds the word itself; F.deriv.back is
  // the word's own form, ready for when the box is unticked.
  function newDerivative() { return F.deriv && !F.deriv.known ? F.deriv : null; }
  function listedBase(v) {
    const own = store.ent.get(hash(v)) || [...store.ent.values()].find((e) => E.strip(e.lemma) === E.strip(v));
    if (own) return [{ lemma: own.lemma, entry: own }];
    const exact = ix.items.get(v);
    return exact ? [exact] : ix.byKey.get(E.strip(v)) || null;
  }
  function setDerivative(on) {
    flushFields();
    if (on) {
      F.deriv = { word: F.mode === "catalogue" ? curItem().lemma : F.headword, base: "", known: false, back: F, star: !!(F.att && F.att.star) };
      renderDesk({ focusId: "base" });
      return;
    }
    const d = F.deriv, att = F.att;
    if (att) att.star = d.star;
    F.deriv = null;
    if (!d.back) { F.ctx = null; openHeadword(d.word); return; }
    F = d.back; F.deriv = null; F.att = att;
    if (F.mode === "new" && F.headword !== d.word) { F.headword = d.word; F.props = E.decompose(ix, d.word, { limit: 6 }); }
    renderDesk();
  }
  function setBase(value, focusId) {
    const d = F && F.deriv;
    if (!d) return;
    const v = toGreek(value).trim(), hw = $("hw");
    if (hw) d.word = toGreek(hw.value).trim();
    if (v === d.base) { if (focusId && $(focusId)) $(focusId).focus({ preventScroll: true }); return; }
    const att = F.att, typed = F.typed;
    if (!v) {
      if (d.back) { F = d.back; F.att = att; F.deriv = { ...d, base: "" }; }
      renderDesk({ focusId: "base" });
      return;
    }
    if (E.strip(v) === E.strip(d.word)) { showErr("The base has to be a different compound from the derivative."); return; }
    const items = listedBase(v);
    if (items) { F = catalogueForm(items, null, null); F.att = att; }
    // A new base is known only from its derivative so far, as with most inferred headwords.
    else { F = newForm(v, att, null); F.inferred = true; }
    F.typed = typed;
    F.deriv = { ...d, base: items ? items[0].lemma : v, known: false };
    renderDesk({ focusId: focusId || "primary" });
  }
  function openHeadword(word, focusId) {
    const v = toGreek(word).trim();
    if (!v) return;
    if (F && F.deriv) { F.deriv.word = v; renderDesk({ focusId: focusId || "primary" }); return; }
    const prev = F ? F.att : null;
    const keep = !!(prev && prev.form && sameWord(v, prev.form));
    const att = keep ? prev : handAtt(prev);
    const ctx = keep && F ? F.ctx : null;
    const typed = !keep;
    const show = () => { F.typed = typed; renderDesk({ focusId: focusId || "primary" }); };
    if (store.ent.has(hash(v))) { F = entryForm(store.ent.get(hash(v)), att, ctx); return show(); }
    const exact = ix.items.get(v);
    const near = ix.byKey.get(E.strip(v));
    if (exact || near) { F = catalogueForm(exact ? [exact] : near, att, ctx || { kind: "known", k: E.strip(v) }); return show(); }
    if (keep && F && F.mode === "new" && F.ana.some((a) => a.touched)) {
      F.headword = v;
      F.props = E.decompose(ix, v, { limit: 6 });
      return show();
    }
    F = newForm(v, att, ctx);
    show();
  }
  function commitHeadword(el, focusId) {
    const v = toGreek(el.value).trim();
    const cur = !F ? "" : F.deriv ? F.deriv.word : F.mode === "catalogue" ? curItem().lemma : F.headword;
    if (v && v !== cur) openHeadword(v, focusId);
    else if (focusId && $(focusId)) $(focusId).focus({ preventScroll: true });
  }
  // Moving the + re-reads the members for any side not typed by hand.
  let segTimer = null;
  function resegment(i) {
    clearTimeout(segTimer);
    segTimer = setTimeout(() => {
      const a = F && F.ana && F.ana[i];
      if (!a || !a.seg.includes("+")) return;
      const parts = a.seg.replace(/[()\[\]]/g, "").split("+");
      if (parts.length !== 2) return;
      const opt = E.sideOptions(ix, parts[0], parts[1]);
      [["1", opt.L[0]], ["2", opt.R[0]]].forEach(([s, o]) => {
        if (!a.auto["m" + s] || !o) return;
        a["m" + s] = o.member; a["m" + s + "c"] = o.cat; a["m" + s + "s"] = o.sub;
        setField("m" + s + "_" + i, o.member, true);
        setField("c" + s + "_" + i, o.cat, true);
        setField("s" + s + "_" + i, o.sub, !!o.sub);
      });
      autoExtras(F); syncExtras();
    }, 260);
  }

  /* ---- events --------------------------------------------------------- */
  $("lines").addEventListener("click", (ev) => {
    const w = ev.target.closest(".w"); if (!w) return;
    const li = +w.dataset.l, ti = +w.dataset.t;
    const p = S.flat.findIndex((f) => f.li === li && f.ti === ti);
    if (p >= 0) { openPos(p, { noFocus: false }); }
  });
  $("textSel").addEventListener("change", (ev) => {
    if (ev.target.value === "__paste") { $("pastePanel").hidden = false; ev.target.value = S.text.id; $("pTitle").focus(); return; }
    F = null;
    loadText(ev.target.value);
  });
  $("onlyTodo").addEventListener("change", (ev) => { S.onlyTodo = ev.target.checked; renderReader(); markCurrent(true); saveLocal(); });
  $("pCancel").addEventListener("click", () => { $("pastePanel").hidden = true; });
  $("pGo").addEventListener("click", () => {
    const title = $("pTitle").value.trim(), work = $("pWork").value.trim(), book = $("pBook").value.trim() || "1";
    const err = (m) => { $("pErr").textContent = m; $("pErr").hidden = !m; };
    if (!work) return err("Give the work name, as it should appear in the attestations.");
    let n = parseInt($("pStart").value, 10); if (!isFinite(n)) n = 1;
    const lines = [];
    $("pText").value.split(/\r?\n/).forEach((raw) => {
      const s = raw.trim(); if (!s) return;
      const m = s.match(/^(\d+[a-z]?)[.:)\s]+(.*)$/);
      if (m) { lines.push([m[1], m[2]]); n = parseInt(m[1], 10) + 1; } else { lines.push([String(n), s]); n++; }
    });
    if (!lines.some(([, s]) => E.hasGreek(s))) return err("Paste some Greek text first.");
    const size = new Blob([JSON.stringify(lines)]).size;
    if (size > 200000) return err("That text is too long for one entry. Split it into parts of about 3,000 lines.");
    const id = "p" + hash(title + work + book + Date.now()).slice(0, 10);
    const row = { id, group: "Pasted", title: title || work + " " + book, work, book, lines };
    put("txt", id, row);
    err(""); $("pastePanel").hidden = true; $("pText").value = "";
    populateTexts(); F = null; loadText(id);
  });
  let bulkArmed = false, bulkTimer = null;
  $("bulk").addEventListener("click", () => {
    const list = [];
    S.lines.forEach((l) => l.toks.forEach((t) => { if (stateOf(l, t) === "known") list.push({ l, t }); }));
    if (!list.length) return;
    if (!bulkArmed) {
      bulkArmed = true;
      $("bulk").textContent = "Click again to log " + list.length;
      clearTimeout(bulkTimer);
      bulkTimer = setTimeout(() => { bulkArmed = false; renderReader(); }, 4000);
      return;
    }
    bulkArmed = false; clearTimeout(bulkTimer);
    const undos = list.map(({ l, t }) => {
      const it = t.c.local ? { lemma: t.c.local.lemma, entry: t.c.local } : t.c.items[0];
      return logAtt(it.lemma, { work: S.text.work, book: S.text.book, line: l.n, form: t.form, star: t.c.via === "derivative" || itemInferred(it), doc: S.text.id });
    });
    refreshDone(); renderCounts();
    toast("Logged " + plural(list.length, "attestation"), () => { undos.forEach((u) => u()); refreshDone(); renderReader(); renderCounts(); });
    goNext(1);
  });

  const body = $("deskBody");
  body.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.dataset.combo) comboOpen(el);
    if (el.dataset.att && F && F.att && el.type !== "checkbox") { F.att[el.dataset.att] = toGreek(el.value); return; }
    const i = el.dataset.a;
    if (i == null || !F || !F.ana) return;
    const a = F.ana[+i], field = el.dataset.field;
    if (!a || !field || el.type === "checkbox") return;
    a[field] = el.value;
    a.touched = true;
    if (field === "seg") { a.auto.seg = false; el.classList.remove("auto"); resegment(+i); }
    else if (field === "m1" || field === "m2") { a.auto[field] = false; el.classList.remove("auto"); }
  });
  body.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.id === "hw" || el.id === "base") return;
    if (el.id === "derivBox") { setDerivative(el.checked); return; }
    if (el.id === "mc") { F.touchedMc = true; F.mc = el.value; return; }
    if (el.id === "link") { F.touchedLink = true; F.link = toGreek(el.value); el.value = F.link; syncExtras(); return; }
    if (el.id === "inferred") {
      F.inferred = el.checked;
      if (el.checked && F.att && !F.inc && E.strip(F.att.form) !== E.strip(F.headword)) { F.inc = F.att.form; const inc = $("inc"); if (inc) inc.value = F.inc; }
      return;
    }
    const i = el.dataset.a, field = el.dataset.field;
    if (i == null || !field || !F.ana) return;
    const a = F.ana[+i];
    if (el.type === "checkbox") { a.unc = el.checked; return; }
    if (el.tagName === "SELECT") { a[field] = el.value; a.touched = true; el.classList.remove("auto"); }
  });
  body.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]"); if (!b || !F) return;
    const act = b.dataset.act;
    if (b.tagName === "TR" && ev.target.closest("input, select")) return;
    if (act === "use") { flushFields(); fillAna(F, 0, F.props[+b.dataset.p]); F.ana = F.ana.slice(0, Math.max(1, F.ana.length)); renderDesk(); }
    else if (act === "add") {
      flushFields();
      const p = F.props[+b.dataset.p], slot = F.ana.length, used = F.used;
      F.ana.push(blankAna()); fillAna(F, slot, p); F.used = used; renderDesk();
    }
    else if (act === "rm-ana") { F.ana.splice(+b.dataset.a, 1); renderDesk(); }
    else if (act === "more-ana") { flushFields(); const x = blankAna(); x.seg = F.ana[0] ? F.ana[0].seg : F.headword; F.ana.push(x); renderDesk({ focusId: "m1_" + (F.ana.length - 1) }); }
    else if (act === "more") { const m = $("more"); m.hidden = !m.hidden; detailsOpen = !m.hidden; b.textContent = "Headword details " + (m.hidden ? "▾" : "▴"); }
    else if (act === "link") { F.touchedLink = true; F.link = [F.link, b.dataset.v].filter(Boolean).join(", "); syncExtras(); }
    else if (act === "pick") { F.pick = +b.dataset.i; if (F.deriv) F.deriv.base = curItem().lemma; renderDesk(); }
    else if (act === "base") setBase(b.dataset.v, "primary");
  });
  body.addEventListener("focusin", (ev) => { if (ev.target.dataset.combo && ev.target.dataset.combo === "member") comboOpen(ev.target); });
  body.addEventListener("focusout", (ev) => {
    const el = ev.target;
    setTimeout(() => { if (Combo.input === el) comboClose(); }, 120);
    if (el.dataset.field === "m1" || el.dataset.field === "m2" || el.dataset.field === "seg" || el.id === "inc") {
      const v = toGreek(el.value);
      if (v !== el.value) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }
      if ((el.dataset.field === "m1" || el.dataset.field === "m2") && v && F && F.ana) {
        const a = F.ana[+el.dataset.a], s = el.dataset.field[1];
        if (a && !a[el.dataset.field + "c"]) applyMember(+el.dataset.a, +s, v, el); else if (a) { autoExtras(F); syncExtras(); }
      }
    }
    if (el.id === "hw") commitHeadword(el, ev.relatedTarget && ev.relatedTarget.id ? ev.relatedTarget.id : null);
    if (el.id === "base") {
      const to = ev.relatedTarget;
      if (!to || (to.dataset.act !== "base" && to.id !== "derivBox")) setBase(el.value, to && to.id ? to.id : null);
    }
  });
  body.addEventListener("keydown", (ev) => {
    const el = ev.target;
    if (el.tagName !== "INPUT") return;
    const open = !$("menu").hidden;
    if (ev.key === "ArrowDown" && open) { ev.preventDefault(); comboMove(1); return; }
    if (ev.key === "ArrowUp" && open) { ev.preventDefault(); comboMove(-1); return; }
    if (ev.key === "Escape" && open) { comboClose(); return; }
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (open && Combo.idx >= 0) { comboPick(Combo.idx); return; }
      comboClose();
      if (el.id === "hw") { commitHeadword(el, "primary"); return; }
      if (el.id === "base") { setBase(el.value, "primary"); return; }
      primary();
    }
  });
  $("menu").addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    const d = ev.target.closest("[data-i]");
    if (d) comboPick(+d.dataset.i);
  });
  $("deskFoot").addEventListener("click", (ev) => {
    const id = ev.target.id;
    if (id === "primary") primary();
    else if (id === "notBtn") markNot();
    else if (id === "skipBtn") goNext(1);
  });
  document.addEventListener("keydown", (ev) => {
    if (!panelOpen("panelEncode") || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tag = ev.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (ev.key === "Enter" && ev.target.id !== "primary" && tag !== "BUTTON" && tag !== "SUMMARY" && tag !== "A") { ev.preventDefault(); primary(); return; }
    const k = ev.key.toLowerCase();
    if (k === "x") { ev.preventDefault(); markNot(); }
    else if (k === "n") { ev.preventDefault(); goNext(1); }
    else if (k === "b") { ev.preventDefault(); goNext(-1); }
    else if (/^[1-6]$/.test(ev.key) && F && F.mode === "new" && F.props[+ev.key - 1]) {
      ev.preventDefault(); fillAna(F, 0, F.props[+ev.key - 1]); renderDesk({ focusPrimary: true });
    }
  });
  // mopsos-shared.js opens and closes the panels; this renders one once it is open.
  function panelOpen(id) { return !$(id).querySelector(".panel-body").hidden; }
  function refreshPanel(id) {
    if (!D || !panelOpen(id)) return;
    if (id === "panelEncode") { renderReader(); markCurrent(true); }
    if (id === "panelEntries") renderEntries();
    if (id === "panelExport") renderExport();
  }
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.querySelector(".panel-head").addEventListener("click", () => setTimeout(() => refreshPanel(panel.id), 0));
  });
  function renderCounts() {
    const n = store.ent.size;
    $("nEntries").textContent = n ? " (" + n + ")" : "";
  }

  /* ---- entries -------------------------------------------------------- */
  let entryQuery = "", attText = "", confirmDel = null;
  function incomplete(e) { return e.analyses.some((a) => !a.m1 || !a.m2 || !a.seg.includes("+")); }
  function attCountByLemma() {
    const c = new Map();
    store.att.forEach((a) => c.set(a.lemma, (c.get(a.lemma) || 0) + 1));
    return c;
  }
  function renderEntries() {
    const q = E.strip(toGreek(entryQuery));
    const ents = [...store.ent.entries()].sort((a, b) => WORK_ORDER(a[1]).localeCompare(WORK_ORDER(b[1]), "el"))
      .filter(([, e]) => !q || E.strip(e.lemma).includes(q) || e.analyses.some((a) => E.strip(a.m1).includes(q) || E.strip(a.m2).includes(q)));
    const counts = attCountByLemma();
    const rows = ents.map(([id, e]) => e.analyses.map((a, i) => "<tr>" +
      (i === 0 ? '<td class="enc-greek" rowspan="' + e.analyses.length + '">' + esc(e.lemma) + (e.inferred ? "*" : "") + "</td>" : "") +
      '<td class="enc-greek">' + esc(a.seg) + "</td>" +
      '<td><span class="pdg-form">' + esc(a.m1) + '</span><span class="pdg-c">' + esc(tagOf(a.m1c, a.m1s)) + "</span></td>" +
      '<td><span class="pdg-form">' + esc(a.m2) + '</span><span class="pdg-c">' + esc(tagOf(a.m2c, a.m2s)) + "</span></td>" +
      (i === 0 ? '<td rowspan="' + e.analyses.length + '">' + (counts.get(e.lemma) || 0) + "</td>" +
        '<td rowspan="' + e.analyses.length + '">' + (incomplete(e) ? '<span class="cmp-warn">Incomplete</span> ' : "") + esc(e.note || "") + "</td>" +
        '<td rowspan="' + e.analyses.length + '" style="white-space:nowrap"><button class="fig-dl" data-edit="' + id + '">Edit</button> <button class="fig-dl" data-del="' + id + '">' + (confirmDel === id ? "Delete it?" : "Delete") + "</button></td>" : "") + "</tr>").join("")).join("");
    const atts = [...store.att.entries()].filter(([, a]) => !attText || a.doc === attText)
      .sort((a, b) => (a[1].work + a[1].book).localeCompare(b[1].work + b[1].book) || (parseInt(a[1].line, 10) - parseInt(b[1].line, 10)));
    const docs = [...new Set([...store.att.values()].map((a) => a.doc))];
    const titleOf = (d) => { const t = allTexts().find((x) => x.id === d); return t ? (t.group === "Homeric Hymns" ? "Hymn " : "") + t.title : (d === "misc" ? "Typed by hand" : d); };
    const attRows = atts.slice(0, 400).map(([id, a]) => '<tr><td class="enc-greek">' + esc(a.lemma) + (a.star ? " (*)" : "") + "</td><td>" + esc(a.work) + "</td><td>" + esc(a.book) + "</td><td>" + esc(a.line) + '</td><td class="enc-greek">' + esc(a.form) + '</td><td><button class="fig-dl" data-unatt="' + id + '">Remove</button></td></tr>').join("");
    const nots = [...store.not.entries()].sort((a, b) => a[1].k.localeCompare(b[1].k, "el"));
    $("entriesIn").innerHTML =
      '<div class="card"><h2>1. New compounds</h2><div class="field" style="max-width:340px"><label for="entryQ"><strong>Search</strong> <span class="help">headwords and members</span></label><input type="text" id="entryQ" value="' + esc(entryQuery) + '"></div>' +
      (rows ? '<div class="table-wrap enc-table"><table class="paradigm-table"><thead><tr><th>Headword</th><th>Segmentation</th><th>First member</th><th>Second member</th><th>Attested</th><th>Notes</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<p class="help">' + (store.ent.size ? "Nothing matches that search." : "Compounds saved in the encoder will appear here.") + "</p>") + "</div>" +
      '<div class="card"><h2>2. Attestations</h2><div class="field" style="max-width:340px"><label for="attFilter"><strong>Text</strong></label><select id="attFilter"><option value="">All texts (' + store.att.size + ")</option>" +
      docs.map((d) => '<option value="' + esc(d) + '"' + (d === attText ? " selected" : "") + ">" + esc(titleOf(d)) + "</option>").join("") + "</select></div>" +
      (attRows ? '<div class="table-wrap enc-table"><table class="paradigm-table"><thead><tr><th>Compound</th><th>Work</th><th>Book or hymn</th><th>Line</th><th>Form</th><th></th></tr></thead><tbody>' + attRows + "</tbody></table></div>" +
        (atts.length > 400 ? '<p class="help">Showing the first 400 of ' + atts.length + ". Choose a text to see the rest.</p>" : "")
        : '<p class="help">Logged attestations will appear here.</p>') + "</div>" +
      '<div class="card"><h2>3. Marked as not compounds</h2>' +
      (nots.length ? '<p class="help">Click a word to start flagging it again.</p><div class="enc-chips">' + nots.map(([id, n]) => '<button type="button" class="fig-dl enc-greek" data-unnot="' + id + '">' + esc(n.form) + "</button>").join("") + "</div>" : '<p class="help">None yet.</p>') + "</div>";
    const qEl = $("entryQ");
    qEl.oninput = () => { entryQuery = qEl.value; renderEntries(); const el = $("entryQ"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); };
    $("attFilter").onchange = (ev) => { attText = ev.target.value; renderEntries(); };
  }
  $("entriesIn").addEventListener("click", (ev) => {
    const t = ev.target;
    if (t.dataset.edit) {
      const e = store.ent.get(t.dataset.edit);
      S.pos = -1; F = entryForm(e, null, null);
      if (!panelOpen("panelEncode")) document.querySelector("#panelEncode .panel-head").click();
      markCurrent(false); renderDesk();
      $("deskBody").scrollIntoView({ block: "nearest" });
    } else if (t.dataset.del) {
      if (confirmDel !== t.dataset.del) { confirmDel = t.dataset.del; renderEntries(); return; }
      confirmDel = null;
      const e = store.ent.get(t.dataset.del), id = t.dataset.del;
      putEntry(id, null);
      const gone = [...store.att.entries()].filter(([, a]) => a.lemma === e.lemma);
      gone.forEach(([aid, a]) => put("att", aid, null));
      rebuildDerived(); classifyAll(); renderCounts(); renderEntries();
      toast("Deleted " + e.lemma, () => { putEntry(id, e); gone.forEach(([aid, a]) => put("att", aid, a)); rebuildDerived(); classifyAll(); renderCounts(); renderEntries(); });
    } else if (t.dataset.unatt) {
      put("att", t.dataset.unatt, null); rebuildDerived(); classifyAll(); renderReader(); renderEntries();
    } else if (t.dataset.unnot) {
      putNot(t.dataset.unnot, null); renderEntries();
    }
  });

  /* ---- export --------------------------------------------------------- */
  function analysisRows() {
    const out = [];
    [...store.ent.values()].sort((a, b) => WORK_ORDER(a).localeCompare(WORK_ORDER(b), "el")).forEach((e) => {
      e.analyses.forEach((a) => out.push([e.lemma, e.inferred ? "1" : "0", a.seg, a.m1, a.m1c, a.m1s, a.m2, a.m2c, a.m2s, e.analyses.length, e.member_count || 2, e.link_to || "", a.unc ? "1" : "0"]));
    });
    return out;
  }
  function attestationRows() {
    return [...store.att.values()].sort((a, b) => a.work.localeCompare(b.work) || (parseInt(a.book, 10) - parseInt(b.book, 10)) || (parseInt(a.line, 10) - parseInt(b.line, 10)))
      .map((a) => [a.lemma + (a.star ? " (*)" : ""), a.work, a.book, a.line]);
  }
  function includeRows() {
    const out = new Map(), add = (lemma, w) => out.set(lemma + "|" + w, [lemma, w]);
    store.ent.forEach((e) => (e.include || []).forEach((w) => add(e.lemma, w)));
    store.att.forEach((a) => { if (a.deriv) add(a.lemma, a.deriv); });
    return [...out.values()];
  }
  const FILES = {
    analysis: { name: "ncompounds_analysis.csv", head: () => D.columns, rows: analysisRows, about: "One row per analysis of each new compound." },
    attestations: { name: "ncompounds_attestations.csv", head: () => ["compound", "work", "book", "line_num"], rows: attestationRows, about: "Every logged occurrence, including catalogue compounds." },
    include: { name: "ncompounds_include.csv", head: () => ["lemma", "include"], rows: includeRows, about: "Derivatives to count with a compound." },
  };
  function renderExport() {
    const inc = [...store.ent.values()].filter(incomplete).length;
    const cards = Object.entries(FILES).map(([k, f], i) => {
      const rows = f.rows();
      return '<div class="card"><h2>' + (i + 1) + ". " + esc(f.name) + '</h2><p class="help" style="margin-top:-.35rem;">' + esc(f.about) + " " + plural(rows.length, "new row") + ".</p>" +
        (rows.length ? '<pre class="status enc-pre" id="pre-' + k + '" tabindex="0">' + esc(csv(rows)) + "</pre>" : "") +
        '<div class="btn-row"><button class="btn" data-copy="' + k + '"' + (rows.length ? "" : " disabled") + ">Copy rows</button>" +
        '<button class="btn" data-save="' + k + '"' + (rows.length ? "" : " disabled") + ">Save file with header</button></div></div>";
    }).join("");
    $("exportIn").innerHTML =
      '<div class="panel-info"><p class="help" style="margin:0">' + (SHEET_URL ? "Every decision goes to the team sheet as you make it, so nothing here needs sending." : "Your work is kept in this browser only. Save a backup at the end of each session and send it to the MoPSoS team; it also moves your work to another computer.") + ' To add the rows to the site, append them to the matching files in <code>assets/data/ncompounds/</code>, then run <code>python3 scripts/build_corpus.py</code>.</p>' +
      (inc ? '<p class="cmp-warn" style="margin:.5rem 0 0">' + plural(inc, "compound is", "compounds are") + " missing a member or a + in the segmentation. They export as they stand; check them under Encoded Compounds.</p>" : "") + "</div>" +
      '<div class="card"><h2>1. Backup</h2><p class="help" style="margin-top:-.35rem;">A backup file holds every compound, attestation, note and pasted text. Restoring one adds it to what is here.</p>' +
      '<div class="btn-row"><button class="btn" id="backupBtn">Save backup</button><button class="btn btn-warn" id="restoreBtn">Restore a backup</button></div></div>' +
      cards.replace(/<h2>(\d)\. /g, (m, n) => "<h2>" + (+n + 1) + ". ") +
      '<p class="fig-caption">Catalogue built from ' + ix.items.size.toLocaleString("en-US") + " headwords on " + esc(D.built) + ". Hymns, Theogony, Works and Days and Shield: Evelyn-White's 1914 Loeb text and translation via the Perseus Digital Library (CC BY-SA).</p>";
  }
  function backupData() {
    const o = { format: "mopsos-encoder-backup", version: 1 };
    COLLECTIONS.forEach((k) => { o[k] = [...store[k].entries()]; });
    return JSON.stringify(o);
  }
  $("exportIn").addEventListener("click", (ev) => {
    const t = ev.target;
    if (t.dataset.copy) { const f = FILES[t.dataset.copy]; copy(csv(f.rows()), $("pre-" + t.dataset.copy)); }
    else if (t.dataset.save) { const f = FILES[t.dataset.save]; saveFile(f.name, csv([f.head()].concat(f.rows())) + "\n"); }
    else if (t.id === "backupBtn") {
      saveFile("mopsos-compounds-backup-" + new Date().toISOString().slice(0, 10) + ".json", backupData());
      kit.markBackedUp();
    }
    else if (t.id === "restoreBtn") $("restoreFile").click();
  });
  $("restoreFile").addEventListener("change", async (ev) => {
    const file = ev.target.files[0]; ev.target.value = "";
    if (!file) return;
    try {
      const o = JSON.parse(await file.text());
      if (o.format !== "mopsos-encoder-backup") throw new Error("format");
      let n = 0;
      (o.ent || []).forEach(([id, v]) => { putEntry(id, v); n++; });
      (o.att || []).forEach(([id, v]) => { put("att", id, v); n++; });
      (o.not || []).forEach(([id, v]) => { putNot(id, v); n++; });
      (o.txt || []).forEach(([id, v]) => { put("txt", id, v); n++; });
      rebuildDerived(); classifyAll(); populateTexts(); renderCounts(); renderExport();
      toast("Restored " + plural(n, "item"));
    } catch (e) { toast("That file is not a backup from this page."); }
  });

  /* ---- boot ----------------------------------------------------------- */
  function boot() {
    const saved = kit.load();
    S.onlyTodo = !!saved.onlyTodo;
    $("onlyTodo").checked = S.onlyTodo;
    rebuildDerived();
    populateTexts();
    renderCounts();
    loadText(saved.textId || "hh2", saved.pos);
    kit.start();
    $("encLoad").hidden = true;
  }
  const load = (name) => fetch("assets/data/encoder/" + name + ".json").then((r) => {
    if (!r.ok) throw new Error(name);
    return r.json();
  });
  Promise.all([load("lexicon"), load("texts"), loadTranslations()]).then(([lex, txt, eng]) => {
    translations.set(eng);
    D = { ...lex, texts: txt.texts };
    ix = E.buildIndex(D);
    boot();
  }).catch(() => {
    $("encLoad").outerHTML = '<p class="cmp-warn">The texts and catalogue did not load. Check your connection and reload the page.</p>';
  });
})();
