/* ============================================================================
 *  INFINITIVE ENCODER: the unlisted page for encoding infinitives in texts outside
 *  the corpus. One record per token, in morphology.csv's own columns. Saving is in
 *  encoder-store.js, the logic in infinitive-engine.js.
 * ========================================================================== */
(function () {
  "use strict";
  const I = window.InfinitiveEngine, C = window.CompoundEngine;
  const { $, esc, plural, hash, toGreek, toast, saveFile, copy, csv, createStore } = window.EncoderKit;
  const strip = I.strip;
  const TENSES = [["p", "present"], ["a", "aorist"], ["f", "future"], ["r", "perfect"], ["t", "future perfect"]];
  const VOICES = [["a", "active"], ["p", "passive"], ["m", "middle"], ["e", "mediopassive"]];
  const CONJ = [["t", "thematic"], ["a", "athematic"], ["s", "sigmatic"], ["c", "contract"]];
  const label = (list, v) => (list.find(([k]) => k === v) || ["", v])[1];
  const COLUMNS = ["work", "book", "verse", "form", "lemma", "tense", "voice", "conjugation", "morpheme", "metrical_shape", "metrical_stem_shape", "uncertain", "note"];

  /* ---- store ---------------------------------------------------------- */
  const S = { text: null, lines: [], flat: [], pos: -1, onlyTodo: false, rendered: null };
  let F = null, ix = null, TEXTS = [], D = null;
  let LOCAL = new Map();
  const kit = createStore({
    key: "mopsos-infinitives-v1", kinds: ["inf", "nin", "txt"], url: document.body.dataset.sheetUrl || "",
    ui: () => ({ textId: S.text && S.text.id, onlyTodo: S.onlyTodo, pos: S.pos }),
    onRemote: () => {
      learn(); classifyAll(); populateTexts(); renderReader(); renderCounts();
      if (panelOpen("panelEntries")) renderEntries();
      if (panelOpen("panelExport")) renderExport();
    },
  });
  const store = kit.rows, put = kit.put, SHEET_URL = kit.url;

  // A form encoded here is recognized wherever it occurs again.
  function learn() {
    LOCAL = new Map();
    store.inf.forEach((r) => LOCAL.set(strip(r.form), { lemma: r.lemma, tense: r.tense, voice: r.voice, conj: r.conj, morph: r.morph, stem: r.stem, shape: r.shape, tag: r.tag, n: 1 }));
  }

  /* ---- texts ---------------------------------------------------------- */
  const pasted = () => [...store.txt.values()];
  const allTexts = () => [...TEXTS, ...pasted()];
  function populateTexts() {
    const sel = $("textSel"), cur = S.text ? S.text.id : "";
    const group = (name, list) => '<optgroup label="' + esc(name) + '">' + list.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.title) + "</option>").join("") + "</optgroup>";
    sel.innerHTML = group("Homeric Hymns", TEXTS.filter((t) => t.group === "Homeric Hymns")) +
      group("Hesiod", TEXTS.filter((t) => t.group === "Hesiod")) +
      (pasted().length ? group("Pasted texts", pasted()) : "") +
      '<option value="__paste">Paste another text…</option>';
    sel.value = cur;
    const works = [...new Set(allTexts().map((t) => t.work).concat(["Cypria", "Aethiopis", "Little Iliad", "Iliou Persis", "Nostoi", "Telegony", "Thebaid", "Epigoni", "Catalogue of Women"]))];
    $("workList").innerHTML = works.map((w) => '<option value="' + esc(w) + '">').join("");
  }
  // The corpus already encodes the active and passive forms of these two.
  const MEDIAL_ONLY = new Set(["theog", "wd"]);
  function classifyAll() {
    S.lines.forEach((l) => l.toks.forEach((t, ti) => {
      const nx = l.toks[ti + 1];
      t.next = nx ? nx.form : undefined;
      t.elided = /^[ʼ’'᾽]/.test(l.s.slice(t.end));
      t.c = I.classify(ix, t.form, { elided: t.elided, next: t.next, local: LOCAL });
      if (MEDIAL_ONLY.has(S.text.id) && !t.c.fromCorpus && !/(?:σθ|σθαι|[χφρ]θαι)$/.test(t.c.k)) t.c = { kind: "plain", k: t.c.k };
    }));
  }
  function loadText(id, pos) {
    const t = allTexts().find((x) => x.id === id) || TEXTS[1];
    S.text = t;
    S.rendered = null;
    S.lines = t.lines.map(([n, s]) => ({ n, s, toks: C.tokenize(s) }));
    S.flat = [];
    S.lines.forEach((l, li) => l.toks.forEach((tk, ti) => S.flat.push({ li, ti })));
    classifyAll();
    S.pos = -1;
    $("textSel").value = t.id;
    renderReader();
    kit.save();
    const at = typeof pos === "number" && pos >= 0 && pos < S.flat.length ? pos : -1;
    if (at >= 0) S.pos = at;
    const next = at >= 0 && isTodo(at) ? at : findNext(1);
    if (next >= 0) openPos(next, { scroll: true }); else { S.pos = -1; F = null; renderDesk(); }
  }
  const tokenAt = (p) => { const f = S.flat[p]; return f ? { l: S.lines[f.li], t: S.lines[f.li].toks[f.ti], ti: f.ti } : null; };
  const tokenId = (l, t, ti) => hash([S.text.id, l.n, ti, t.form].join("|"));
  function stateOf(l, t, ti) {
    if (store.inf.has(tokenId(l, t, ti))) return "done";
    if (store.nin.has(hash(t.c.k))) return "skip";
    return t.c.kind === "plain" ? "" : t.c.kind;
  }
  function isTodo(p) { const x = tokenAt(p); if (!x) return false; const st = stateOf(x.l, x.t, x.ti); return st === "new" || st === "known" || st === "check"; }
  function findNext(dir) {
    const n = S.flat.length;
    if (!n) return -1;
    let p = S.pos;
    for (let i = 0; i < n; i++) {
      p = (p + dir + n) % n;
      if (isTodo(p)) return p;
    }
    return -1;
  }

  /* ---- reader --------------------------------------------------------- */
  function counts() {
    const c = { new: 0, known: 0, check: 0, done: 0, skip: 0 };
    S.lines.forEach((l) => l.toks.forEach((t, ti) => { const st = stateOf(l, t, ti); if (st) c[st]++; }));
    return c;
  }
  function wordClass(l, t, li, ti) {
    const st = stateOf(l, t, ti);
    const cur = S.flat[S.pos] && S.flat[S.pos].li === li && S.flat[S.pos].ti === ti;
    return "w" + (st ? " " + st : "") + (cur ? " cur" : "");
  }
  let bulkArmed = false, bulkTimer = null;
  function renderTally() {
    const c = counts();
    const bits = [c.new + " new", c.known + " known from the corpus"];
    if (c.check) bits.push(c.check + " to check");
    bits.push(c.done + " logged");
    if (c.skip) bits.push(c.skip + " set aside");
    $("tally").textContent = bits.join(" · ");
    $("bulk").hidden = !c.known;
    if (!bulkArmed) $("bulk").textContent = "Log all " + plural(c.known, "known infinitive");
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
      if (S.onlyTodo && !any) return;
      html += '<div class="enc-ln"><span class="enc-no">' + esc(l.n) + '</span><span class="enc-tx">' + out + "</span></div>";
    });
    box.innerHTML = html || '<p class="help">Every flagged word in this text is dealt with. Clear the filter to read the whole text and click anything that was missed.</p>';
    S.lines.forEach((l) => l.toks.forEach((t) => { t.el = null; }));
    box.querySelectorAll(".w").forEach((el) => { S.lines[+el.dataset.l].toks[+el.dataset.t].el = el; });
    S.rendered = S.text.id + "|" + S.onlyTodo;
  }
  function renderReader(force) {
    renderTally();
    const box = $("lines"), top = box.scrollTop;
    if (force || S.onlyTodo || S.rendered !== S.text.id + "|" + S.onlyTodo) { buildLines(); box.scrollTop = top; return; }
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
    if (!el) return;
    el.classList.add("cur");
    if (scroll) {
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (r.top < b.top + 40 || r.bottom > b.bottom - 40) box.scrollTop += r.top - b.top - b.height / 3;
    }
  }
  function openPos(p, opts) {
    S.pos = p;
    const x = tokenAt(p);
    if (!x) return;
    F = formForToken(x.l, x.t, x.ti);
    markCurrent(opts && opts.scroll);
    renderDesk({ focusPrimary: !(opts && opts.noFocus) });
    kit.save();
  }

  /* ---- forms ---------------------------------------------------------- */
  function fill(f, a) {
    Object.assign(f, { lemma: a.lemma || "", tense: a.tense || "", voice: a.voice || "", conj: a.conj || "", morph: a.morph || "", shape: a.shape || f.shape || "", stem: a.stem || "", auto: true, autoStem: true });
    f.used = a;
  }
  function fromRecord(r, ctx, id) {
    return { id, editing: true, form: r.form, lemma: r.lemma, tense: r.tense, voice: r.voice, conj: r.conj, morph: r.morph, shape: r.shape, stem: r.stem, unc: !!r.unc, note: r.note || "",
      work: r.work, book: r.book, line: r.line, doc: r.doc, ti: r.ti, props: [], ctx, auto: false, autoStem: false };
  }
  function formForToken(l, t, ti) {
    const id = tokenId(l, t, ti), rec = store.inf.get(id), c = t.c;
    if (rec) return fromRecord(rec, c, id);
    const props = c.analyses || I.guess(ix, t.form, { next: t.next });
    const f = { id, form: t.form, props, shape: I.scan(t.form, t.next), unc: false, note: "", work: S.text.work, book: S.text.book, line: l.n, doc: S.text.id, ti, ctx: c, used: null };
    if (props[0]) fill(f, props[0]);
    else {
      const hit = (ix.cix.formTo.get(c.k) || [])[0];
      Object.assign(f, { lemma: hit ? hit.lemma : "", tense: "", voice: "", conj: "", morph: "", stem: "", auto: false, autoStem: true });
    }
    return f;
  }
  function typedForm(value) {
    const form = toGreek(value).trim(), c = I.classify(ix, form, { local: LOCAL });
    const props = c.analyses || I.guess(ix, form, {});
    const f = { id: null, typed: true, form, props, shape: I.scan(form), unc: false, note: "", work: S.text ? S.text.work : "", book: S.text ? S.text.book : "", line: "", doc: S.text ? S.text.id : "misc", ti: -1, ctx: c, used: null };
    if (props[0]) fill(f, props[0]);
    else Object.assign(f, { lemma: "", tense: "", voice: "", conj: "", morph: "", stem: "", auto: false, autoStem: true });
    return f;
  }
  function stemFromShape() {
    if (!F.autoStem) return;
    // An elided -σθ’ has lost the syllable the ending would take.
    const cut = /σθ$/.test(strip(F.form)) ? 0 : F.conj && F.morph ? I.endingSyllables(F.conj, F.tense, F.morph, F.voice) : 1;
    F.stem = F.shape.slice(0, Math.max(0, F.shape.length - cut));
    const el = $("fStem"); if (el) el.value = F.stem;
  }
  const options = (list, v) => '<option value=""></option>' + list.map(([k, t]) => '<option value="' + esc(k) + '"' + (k === v ? " selected" : "") + ">" + esc(t) + "</option>").join("");
  const endingList = (f) => I.endingOptions(f.conj, f.tense, f.voice).map((o) => [o.m, o.tag]);
  // -σθαι is the one ending of the medial and mediopassive forms.
  const endingHtml = (f) => (I.isMiddle(f.voice) ? '<option value="' + I.MIDDLE_NUM + '">' + esc(I.MIDDLE_TAG) + "</option>" : options(endingList(f), f.morph));
  function fillEnding() {
    const el = $("fEnd"), list = endingList(F);
    if (!list.some(([k]) => k === F.morph)) F.morph = list.length === 1 ? list[0][0] : "";
    el.innerHTML = endingHtml(F);
    el.disabled = I.isMiddle(F.voice);
  }
  function statusHtml() {
    const c = F.ctx || {};
    let note;
    if (F.typed) note = "Typed by hand. Add the line number below to record where it occurs.";
    else if (F.editing) note = "Already logged. Change anything and save.";
    else if (c.local) note = "Encoded earlier on this page.";
    else if (c.fromCorpus) note = (c.kind === "check" ? '<span class="cmp-warn">Check the reading.</span> ' : "") + "Lemma, tense and voice are from the corpus. The conjugation is worked out by rule, so check it." + (t0(F) ? " The ending is elided, so this could be an imperative." : "");
    else if (c.kind === "known") note = "Known from the corpus, so this is filled in from there.";
    else if (c.kind === "check") {
      const why = c.also ? "This spelling is also another word in the corpus." : F.props.length > 1 ? "The corpus has more than one reading of this form." : "";
      note = '<span class="cmp-warn">Check the reading.</span> ' + (t0(F) ? "The ending is elided, so -μεν could be -μεναι. " : "") + why;
    } else if (c.kind === "new") note = c.sure ? "In the corpus but not yet encoded. Check the suggestion." : "Not in the corpus. Suggested from the ending and related forms.";
    else note = "Not flagged. Encode it if it is an infinitive.";
    return '<p class="help enc-note">' + note + "</p>";
  }
  const t0 = (f) => { const x = tokenAt(S.pos); return !f.typed && x && x.t.elided; };
  function contextHtml() {
    if (F.typed || !S.flat[S.pos]) return "";
    const f = S.flat[S.pos], l = S.lines[f.li], t = l.toks[f.ti];
    return '<p class="enc-ctx">' + esc(l.s.slice(0, t.start)) + "<mark>" + esc(t.form) + "</mark>" + esc(l.s.slice(t.end)) + "</p>";
  }
  function propsHtml() {
    if (!F.props.length) return "";
    const rows = F.props.map((p, i) => {
      const end = p.tag || I.endingTag(p.conj, p.tense, p.morph, p.voice);
      return '<tr class="' + (F.used === p ? "on" : "") + '" data-act="use" data-p="' + i + '"><td><kbd>' + (i + 1) + "</kbd></td>" +
        "<td>" + esc(label(TENSES, p.tense)) + " " + esc(label(VOICES, p.voice)) + '<br><span class="pdg-c" style="margin-left:0">' + esc(label(CONJ, p.conj)) + "</span></td>" +
        '<td><span class="pdg-form">' + esc(end) + "</span></td>" +
        '<td><span class="pdg-form">' + esc(p.lemma || "?") + "</span>" + (p.kin ? '<br><span class="pdg-c" style="margin-left:0">as ' + esc(p.kin) + "</span>" : "") + "</td></tr>";
    }).join("");
    return '<div class="enc-sub">Suggestions</div><table class="paradigm-table enc-props enc-props-wide"><thead><tr><th></th><th>Tense and voice</th><th>Ending</th><th>Lemma</th></tr></thead><tbody>' + rows + "</tbody></table>";
  }
  function formField(v) {
    return '<div class="field"><label for="hw"><strong>Form</strong> <span class="help">Greek or Beta Code</span></label><input type="text" id="hw" value="' + esc(v) + '" autocomplete="off" spellcheck="false"></div>';
  }
  function renderDesk(opts) {
    opts = opts || {};
    const body = $("deskBody"), foot = $("deskFoot");
    if (!F) {
      const done = S.flat.length && findNext(1) < 0;
      foot.innerHTML = "";
      body.innerHTML = formField("") + '<p class="help">' + (done ? "Everything flagged in this text is dealt with. Read through and click anything that was missed, or type a form above." : "Click a word in the text, or type a form above.") + "</p>";
      return;
    }
    const a = F.auto ? " auto" : "";
    const cls = (v) => (F.auto && v ? "auto" : "");
    body.innerHTML = formField(F.form) + statusHtml() + contextHtml() + propsHtml() +
      '<div class="word-inline"><div class="enc-sub" style="margin-top:0">Encoding</div>' +
      '<div class="field"><label for="fLemma"><strong>Lemma</strong></label><div class="combo"><input type="text" id="fLemma" class="enc-greek' + (F.auto && F.lemma ? " auto" : "") + '" value="' + esc(F.lemma) + '" autocomplete="off" spellcheck="false"></div></div>' +
      '<div class="enc-mem">' +
      '<div class="field"><label for="fTense"><strong>Tense</strong></label><select id="fTense" class="' + cls(F.tense) + '">' + options(TENSES, F.tense) + "</select></div>" +
      '<div class="field"><label for="fVoice"><strong>Voice</strong></label><select id="fVoice" class="' + cls(F.voice) + '">' + options(VOICES, F.voice) + "</select></div>" +
      '<div class="field"><label for="fConj"><strong>Conjugation</strong></label><select id="fConj" class="' + cls(F.conj) + '">' + options(CONJ, F.conj) + "</select></div></div>" +
      '<div class="enc-mem">' +
      '<div class="field"><label for="fEnd"><strong>Ending</strong></label><select id="fEnd" class="' + cls(F.morph) + '"' + (I.isMiddle(F.voice) ? " disabled" : "") + ">" + endingHtml(F) + "</select></div>" +
      '<div class="field"><label for="fShape"><strong>Metrical shape</strong></label><input type="text" id="fShape" class="' + (F.shape && (F.auto || F.typed) ? "auto" : "") + '" value="' + esc(F.shape) + '" autocomplete="off" spellcheck="false"></div>' +
      '<div class="field"><label for="fStem"><strong>Stem shape</strong></label><input type="text" id="fStem" class="' + (F.stem && F.auto ? "auto" : "") + '" value="' + esc(F.stem) + '" autocomplete="off" spellcheck="false"></div></div>' +
      '<div class="enc-end"><label class="regex-toggle"><input type="checkbox" id="fUnc"' + (F.unc ? " checked" : "") + '> Uncertain</label></div></div>' +
      '<div class="word-inline"><div class="enc-sub" style="margin-top:0">Attestation</div><div class="enc-mem">' +
      '<div class="field"><label for="attWork"><strong>Work</strong></label><input type="text" id="attWork" list="workList" value="' + esc(F.work) + '"></div>' +
      '<div class="field"><label for="attBook"><strong>Book or hymn</strong></label><input type="text" id="attBook" value="' + esc(F.book) + '"></div>' +
      '<div class="field"><label for="attLine"><strong>Line</strong></label><input type="text" id="attLine" value="' + esc(F.line) + '"></div></div>' +
      '<div class="field"><label for="fNote"><strong>Note for the team</strong> <span class="help">not exported to the site</span></label><input type="text" id="fNote" value="' + esc(F.note) + '"></div></div>' +
      '<p class="cmp-warn" id="formErr" hidden></p>';
    const main = F.editing ? "Save changes" : "Save infinitive";
    foot.innerHTML = '<div class="btn-row"><button type="button" class="btn" id="primary">' + main + "</button>" +
      (F.typed || F.editing ? "" : '<button type="button" class="btn btn-warn" id="notBtn">Not an infinitive</button>') +
      '<button type="button" class="btn btn-warn" id="skipBtn">Skip</button></div>' +
      '<p class="help enc-keys"><kbd>Enter</kbd> ' + esc(main.toLowerCase()) + (F.props.length ? " · <kbd>1</kbd>–<kbd>" + F.props.length + "</kbd> suggestion" : "") + " · <kbd>X</kbd> not an infinitive · <kbd>N</kbd> skip · <kbd>B</kbd> back</p>";
    if (opts.focusPrimary && matchMedia("(min-width: 901px)").matches) $("primary").focus({ preventScroll: true });
    body.scrollTop = 0;
  }
  function showErr(msg) { const el = $("formErr"); if (el) { el.textContent = msg; el.hidden = !msg; if (msg) el.scrollIntoView({ block: "nearest" }); } }
  const cleanShape = (v) => String(v || "").replace(/Η/g, "H").toUpperCase().trim();

  /* ---- saving --------------------------------------------------------- */
  function record(f, at) {
    return { work: f.work.trim(), book: String(f.book).trim(), line: String(f.line).trim(), form: f.form, lemma: f.lemma.trim(), tense: f.tense, voice: f.voice, conj: f.conj, morph: f.morph,
      tag: I.endingTag(f.conj, f.tense, f.morph, f.voice), shape: f.shape, stem: f.stem, unc: f.unc ? 1 : 0, note: f.note.trim(), doc: f.doc, ti: f.ti, at };
  }
  function after(undo, msg) {
    learn(); classifyAll(); renderCounts();
    toast(msg, () => { undo(); learn(); classifyAll(); renderReader(); renderCounts(); if (S.pos >= 0) openPos(S.pos, { noFocus: true }); });
    goNext(1);
  }
  function commit() {
    if (!F) return;
    readFields();
    if (!F.form || !/[Ͱ-Ͽἀ-῿]/.test(F.form)) return showErr("Enter the form in Greek or Beta Code.");
    if (!F.lemma.trim()) return showErr("Give the lemma.");
    if (!F.tense || !F.voice) return showErr("Give the tense and voice.");
    if (!F.conj) return showErr("Give the conjugation.");
    if (!F.morph) return showErr("Give the ending.");
    if (F.shape && !/^[HL]+$/.test(F.shape)) return showErr("Metrical shapes use H and L only.");
    if (F.stem && !/^[HL]+$/.test(F.stem)) return showErr("Metrical shapes use H and L only.");
    if (!F.work.trim() || !String(F.line).trim()) return showErr("Give the work and line.");
    const id = F.id || hash([F.work, F.book, F.line, F.form].join("|")), prev = store.inf.get(id) || null;
    put("inf", id, record(F, Date.now()));
    after(() => put("inf", id, prev), "Saved " + F.form);
  }
  function readFields() {
    const v = (id) => { const e = $(id); return e ? e.value : ""; };
    F.lemma = toGreek(v("fLemma")); F.shape = cleanShape(v("fShape")); F.stem = cleanShape(v("fStem"));
    F.work = v("attWork"); F.book = v("attBook"); F.line = v("attLine"); F.note = v("fNote");
    const u = $("fUnc"); F.unc = !!(u && u.checked);
  }
  function markNot() {
    const x = tokenAt(S.pos);
    if (!x || !F || F.typed) return;
    const id = hash(x.t.c.k);
    put("nin", id, { k: x.t.c.k, form: x.t.form, at: Date.now() });
    after(() => put("nin", id, null), x.t.form + " will not be flagged again");
  }
  function goNext(dir) {
    renderReader();
    const n = findNext(dir);
    if (n < 0) { F = null; S.pos = -1; markCurrent(false); renderDesk(); return; }
    openPos(n, { scroll: true });
  }

  /* ---- events --------------------------------------------------------- */
  $("lines").addEventListener("click", (ev) => {
    const w = ev.target.closest(".w"); if (!w) return;
    const li = +w.dataset.l, ti = +w.dataset.t;
    const p = S.flat.findIndex((f) => f.li === li && f.ti === ti);
    if (p >= 0) openPos(p);
  });
  $("textSel").addEventListener("change", (ev) => {
    if (ev.target.value === "__paste") { $("pastePanel").hidden = false; ev.target.value = S.text.id; $("pTitle").focus(); return; }
    F = null;
    loadText(ev.target.value);
  });
  $("onlyTodo").addEventListener("change", (ev) => { S.onlyTodo = ev.target.checked; renderReader(); markCurrent(true); kit.save(); });
  $("pCancel").addEventListener("click", () => { $("pastePanel").hidden = true; });
  $("pGo").addEventListener("click", () => {
    const title = $("pTitle").value.trim(), work = $("pWork").value.trim(), book = $("pBook").value.trim() || "1";
    const err = (m) => { $("pErr").textContent = m; $("pErr").hidden = !m; };
    if (!work) return err("Give the work name, as it should appear in the citations.");
    let n = parseInt($("pStart").value, 10); if (!isFinite(n)) n = 1;
    const lines = [];
    $("pText").value.split(/\r?\n/).forEach((raw) => {
      const s = raw.trim(); if (!s) return;
      const m = s.match(/^(\d+[a-z]?)[.:)\s]+(.*)$/);
      if (m) { lines.push([m[1], m[2]]); n = parseInt(m[1], 10) + 1; } else { lines.push([String(n), s]); n++; }
    });
    if (!lines.some(([, s]) => /[Ͱ-Ͽἀ-῿]/.test(s))) return err("Paste some Greek text first.");
    const id = "p" + hash(title + work + book + Date.now()).slice(0, 10);
    put("txt", id, { id, group: "Pasted", title: title || work + " " + book, work, book, lines });
    err(""); $("pastePanel").hidden = true; $("pText").value = "";
    populateTexts(); F = null; loadText(id);
  });
  $("bulk").addEventListener("click", () => {
    const list = [];
    S.lines.forEach((l) => l.toks.forEach((t, ti) => { if (stateOf(l, t, ti) === "known") list.push({ l, t, ti }); }));
    if (!list.length) return;
    if (!bulkArmed) {
      bulkArmed = true;
      $("bulk").textContent = "Click again to log " + list.length;
      clearTimeout(bulkTimer);
      bulkTimer = setTimeout(() => { bulkArmed = false; renderReader(); }, 4000);
      return;
    }
    bulkArmed = false; clearTimeout(bulkTimer);
    const ids = list.map(({ l, t, ti }) => {
      const a = t.c.analyses[0], id = tokenId(l, t, ti);
      const f = { work: S.text.work, book: S.text.book, line: l.n, form: t.form, lemma: a.lemma, tense: a.tense, voice: a.voice, conj: a.conj, morph: a.morph, shape: a.shape, stem: a.stem, unc: false, note: "", doc: S.text.id, ti };
      put("inf", id, record(f, Date.now()));
      return id;
    });
    learn(); classifyAll(); renderCounts();
    toast("Logged " + plural(ids.length, "infinitive"), () => { ids.forEach((id) => put("inf", id, null)); learn(); classifyAll(); renderReader(); renderCounts(); });
    goNext(1);
  });

  const body = $("deskBody");
  body.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.id === "fLemma") { lemmaMenu(el); el.classList.remove("auto"); }
    else if (el.id === "fShape") { F.shape = cleanShape(el.value); el.classList.remove("auto"); stemFromShape(); }
    else if (el.id === "fStem") { F.autoStem = false; el.classList.remove("auto"); }
  });
  body.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.id === "fTense" || el.id === "fConj") {
      F[el.id === "fTense" ? "tense" : "conj"] = el.value;
      el.classList.remove("auto");
      fillEnding(); stemFromShape();
    } else if (el.id === "fVoice") { F.voice = el.value; el.classList.remove("auto"); fillEnding(); stemFromShape(); }
    else if (el.id === "fEnd") { F.morph = el.value; el.classList.remove("auto"); stemFromShape(); }
  });
  body.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]"); if (!b || !F) return;
    if (b.dataset.act === "use") { readFields(); fill(F, F.props[+b.dataset.p]); renderDesk(); }
  });
  body.addEventListener("keydown", (ev) => {
    const el = ev.target;
    if (el.tagName !== "INPUT") return;
    const open = !$("menu").hidden;
    if (ev.key === "ArrowDown" && open) { ev.preventDefault(); menuMove(1); return; }
    if (ev.key === "ArrowUp" && open) { ev.preventDefault(); menuMove(-1); return; }
    if (ev.key === "Escape" && open) { closeMenu(); return; }
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (open && Menu.idx >= 0) { pickMenu(Menu.idx); return; }
      closeMenu();
      if (el.id === "hw") { commitTyped(el); return; }
      commit();
    }
  });
  function commitTyped(el) {
    const v = toGreek(el.value).trim();
    if (v && (!F || v !== F.form)) { F = typedForm(v); renderDesk({ focusPrimary: true }); }
  }
  body.addEventListener("focusout", (ev) => {
    if (ev.target.id === "fLemma") { setTimeout(closeMenu, 120); ev.target.value = toGreek(ev.target.value); }
    if (ev.target.id === "hw") commitTyped(ev.target);
  });
  const Menu = { input: null, items: [], idx: -1 };
  function lemmaMenu(input) {
    const k = strip(toGreek(input.value));
    Menu.input = input; Menu.idx = -1;
    Menu.items = k ? ix.verbs.filter((v) => v.key.startsWith(k)).slice(0, 9) : [];
    const el = $("menu");
    if (!Menu.items.length) { el.hidden = true; return; }
    el.innerHTML = Menu.items.map((v, i) => '<div class="combo-item" data-i="' + i + '"><span class="combo-form">' + esc(v.lemma) + "</span></div>").join("");
    const r = input.getBoundingClientRect();
    el.hidden = false;
    el.style.left = r.left + "px"; el.style.width = Math.max(r.width, 230) + "px"; el.style.top = r.bottom + 2 + "px";
  }
  function closeMenu() { $("menu").hidden = true; Menu.items = []; Menu.idx = -1; }
  function menuMove(d) {
    const n = Menu.items.length; if (!n) return;
    Menu.idx = (Menu.idx + d + n) % n;
    [...$("menu").children].forEach((c, i) => { c.classList.toggle("on", i === Menu.idx); });
  }
  function pickMenu(i) { const it = Menu.items[i]; if (it && Menu.input) Menu.input.value = it.lemma; closeMenu(); }
  $("menu").addEventListener("mousedown", (ev) => { ev.preventDefault(); const d = ev.target.closest("[data-i]"); if (d) pickMenu(+d.dataset.i); });
  $("deskFoot").addEventListener("click", (ev) => {
    if (ev.target.id === "primary") commit();
    else if (ev.target.id === "notBtn") markNot();
    else if (ev.target.id === "skipBtn") goNext(1);
  });
  document.addEventListener("keydown", (ev) => {
    if (!panelOpen("panelEncode") || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tag = ev.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (ev.key === "Enter" && ev.target.id !== "primary" && tag !== "BUTTON" && tag !== "A") { ev.preventDefault(); commit(); return; }
    const k = ev.key.toLowerCase();
    if (k === "x") { ev.preventDefault(); markNot(); }
    else if (k === "n") { ev.preventDefault(); goNext(1); }
    else if (k === "b") { ev.preventDefault(); goNext(-1); }
    else if (/^[1-6]$/.test(ev.key) && F && F.props[+ev.key - 1]) { ev.preventDefault(); readFields(); fill(F, F.props[+ev.key - 1]); renderDesk({ focusPrimary: true }); }
  });
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
  function renderCounts() { $("nEntries").textContent = store.inf.size ? " (" + store.inf.size + ")" : ""; }

  /* ---- encoded infinitives panel --------------------------------------- */
  let filterDoc = "", confirmDel = null;
  function sorted() {
    return [...store.inf.entries()].filter(([, r]) => !filterDoc || r.doc === filterDoc)
      .sort((a, b) => (a[1].work + a[1].book).localeCompare(b[1].work + b[1].book) || (parseInt(a[1].line, 10) - parseInt(b[1].line, 10)));
  }
  function renderEntries() {
    const list = sorted(), docs = [...new Set([...store.inf.values()].map((r) => r.doc))];
    const titleOf = (d) => { const t = allTexts().find((x) => x.id === d); return t ? (t.group === "Homeric Hymns" ? "Hymn " : "") + t.title : "Typed by hand"; };
    const rows = list.slice(0, 400).map(([id, r]) => '<tr><td class="enc-greek">' + esc(r.form) + '</td><td class="enc-greek">' + esc(r.lemma) + "</td><td>" + esc(label(TENSES, r.tense)) + " " + esc(label(VOICES, r.voice)) +
      '</td><td>' + esc(label(CONJ, r.conj)) + '</td><td><span class="pdg-form">' + esc(r.tag) + "</span></td><td>" + esc(r.shape) + "</td><td>" + esc(r.stem) + "</td><td>" + esc(r.work) + " " + esc(r.book) + "." + esc(r.line) + "</td><td>" +
      (r.unc ? '<span class="cmp-warn">Uncertain</span> ' : "") + esc(r.note || "") + '</td><td style="white-space:nowrap"><button class="fig-dl" data-edit="' + id + '">Edit</button> <button class="fig-dl" data-del="' + id + '">' + (confirmDel === id ? "Remove it?" : "Remove") + "</button></td></tr>").join("");
    const nots = [...store.nin.entries()].sort((a, b) => a[1].k.localeCompare(b[1].k, "el"));
    $("entriesIn").innerHTML =
      '<div class="card"><h2>1. Encoded infinitives</h2><div class="field" style="max-width:340px"><label for="infFilter"><strong>Text</strong></label><select id="infFilter"><option value="">All texts (' + store.inf.size + ")</option>" +
      docs.map((d) => '<option value="' + esc(d) + '"' + (d === filterDoc ? " selected" : "") + ">" + esc(titleOf(d)) + "</option>").join("") + "</select></div>" +
      (rows ? '<div class="table-wrap enc-table"><table class="paradigm-table"><thead><tr><th>Form</th><th>Lemma</th><th>Tense and voice</th><th>Conjugation</th><th>Ending</th><th>Shape</th><th>Stem</th><th>Citation</th><th>Notes</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        (list.length > 400 ? '<p class="help">Showing the first 400 of ' + list.length + ". Choose a text to see the rest.</p>" : "")
        : '<p class="help">Saved infinitives will appear here.</p>') + "</div>" +
      '<div class="card"><h2>2. Marked as not infinitives</h2>' +
      (nots.length ? '<p class="help">Click a word to start flagging it again.</p><div class="enc-chips">' + nots.map(([id, n]) => '<button type="button" class="fig-dl enc-greek" data-unnot="' + id + '">' + esc(n.form) + "</button>").join("") + "</div>" : '<p class="help">None yet.</p>') + "</div>";
    $("infFilter").onchange = (ev) => { filterDoc = ev.target.value; renderEntries(); };
  }
  $("entriesIn").addEventListener("click", (ev) => {
    const t = ev.target;
    if (t.dataset.edit) {
      S.pos = -1;
      F = fromRecord(store.inf.get(t.dataset.edit), null, t.dataset.edit);
      F.typed = false;
      if (!panelOpen("panelEncode")) document.querySelector("#panelEncode .panel-head").click();
      markCurrent(false); renderDesk();
      $("deskBody").scrollIntoView({ block: "nearest" });
    } else if (t.dataset.del) {
      if (confirmDel !== t.dataset.del) { confirmDel = t.dataset.del; renderEntries(); return; }
      confirmDel = null;
      const id = t.dataset.del, r = store.inf.get(id);
      put("inf", id, null);
      learn(); classifyAll(); renderCounts(); renderEntries();
      toast("Removed " + r.form, () => { put("inf", id, r); learn(); classifyAll(); renderCounts(); renderEntries(); });
    } else if (t.dataset.unnot) { put("nin", t.dataset.unnot, null); renderEntries(); }
  });

  /* ---- export panel ---------------------------------------------------- */
  function rowsForExport() {
    return [...store.inf.values()].sort((a, b) => a.work.localeCompare(b.work) || (parseInt(a.book, 10) - parseInt(b.book, 10)) || (parseInt(a.line, 10) - parseInt(b.line, 10)))
      .map((r) => [r.work, r.book, r.line, r.form, r.lemma, r.tense, r.voice, r.conj, r.morph, r.shape, r.stem, r.unc ? "1" : "0", r.note || ""]);
  }
  function renderExport() {
    const rows = rowsForExport();
    $("exportIn").innerHTML =
      '<div class="panel-info"><p class="help" style="margin:0">' + (SHEET_URL ? "Every decision goes to the team sheet as you make it, so nothing here needs sending." : "Your work is kept in this browser only. Save a backup at the end of each session and send it to the MoPSoS team.") + " The columns use the same names and codes as <code>morphology.csv</code>.</p></div>" +
      '<div class="card"><h2>1. Backup</h2><p class="help" style="margin-top:-.35rem;">A backup file holds every infinitive, note and pasted text. Restoring one adds it to what is here.</p>' +
      '<div class="btn-row"><button class="btn" id="backupBtn">Save backup</button><button class="btn btn-warn" id="restoreBtn">Restore a backup</button></div></div>' +
      '<div class="card"><h2>2. infinitives_encoded.csv</h2><p class="help" style="margin-top:-.35rem;">One row per occurrence. ' + plural(rows.length, "row") + ".</p>" +
      (rows.length ? '<pre class="status enc-pre" id="preRows" tabindex="0">' + esc(csv(rows)) + "</pre>" : "") +
      '<div class="btn-row"><button class="btn" id="copyRows"' + (rows.length ? "" : " disabled") + '>Copy rows</button><button class="btn" id="saveRows"' + (rows.length ? "" : " disabled") + ">Save file with header</button></div></div>" +
      '<p class="fig-caption">Corpus infinitives from ' + esc(D.built) + ". Hymns and Hesiod: Evelyn-White's 1914 Loeb text via the Perseus Digital Library (CC BY-SA).</p>";
  }
  function backupData() {
    const o = { format: "mopsos-infinitives-backup", version: 1 };
    ["inf", "nin", "txt"].forEach((k) => { o[k] = [...store[k].entries()]; });
    return JSON.stringify(o);
  }
  $("exportIn").addEventListener("click", (ev) => {
    const id = ev.target.id;
    if (id === "copyRows") copy(csv(rowsForExport()), $("preRows"));
    else if (id === "saveRows") saveFile("infinitives_encoded.csv", csv([COLUMNS].concat(rowsForExport())) + "\n");
    else if (id === "backupBtn") { saveFile("mopsos-infinitives-backup-" + new Date().toISOString().slice(0, 10) + ".json", backupData()); kit.markBackedUp(); }
    else if (id === "restoreBtn") $("restoreFile").click();
  });
  $("restoreFile").addEventListener("change", async (ev) => {
    const file = ev.target.files[0]; ev.target.value = "";
    if (!file) return;
    try {
      const o = JSON.parse(await file.text());
      if (o.format !== "mopsos-infinitives-backup") throw new Error("format");
      let n = 0;
      ["inf", "nin", "txt"].forEach((k) => (o[k] || []).forEach(([id, v]) => { put(k, id, v); n++; }));
      learn(); classifyAll(); populateTexts(); renderCounts(); renderExport();
      toast("Restored " + plural(n, "item"));
    } catch (e) { toast("That file is not a backup from this page."); }
  });

  /* ---- boot ----------------------------------------------------------- */
  function boot() {
    const saved = kit.load();
    S.onlyTodo = !!saved.onlyTodo;
    $("onlyTodo").checked = S.onlyTodo;
    learn();
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
  Promise.all([load("lexicon"), load("infinitives"), load("texts")]).then(([lex, inf, txt]) => {
    D = inf;
    TEXTS = txt.texts;
    ix = I.buildIndex(lex, inf);
    boot();
  }).catch(() => {
    $("encLoad").outerHTML = '<p class="cmp-warn">The texts and corpus data did not load. Check your connection and reload the page.</p>';
  });
})();
