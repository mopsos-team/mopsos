/* ============================================================================
 *  VERSE ENGINE: pure functions, no DOM. Divides a hexameter into syllables,
 *  finds its scansion, and measures what the verse encoder records: syllable
 *  structure and coda, overlength, Wernicke's Law, Hermann's bridge, caesurae,
 *  and what happens before each vowel-initial word (for digamma).
 *
 *  Used by verse-encoder.js in the browser and by scripts/build_verse_data.js
 *  under Node, so the page and the build can never disagree.
 *
 *  Everything a person can correct is an option of analyze():
 *    pat    force the foot pattern, e.g. "DDSDD" (feet 1 to 5, D or S)
 *    hints  per word, one letter per vowel nucleus: L long, S short, ? unknown
 *    wau    array of word indexes that begin with digamma
 *    useW   true to count those digammas as consonants
 *    over   corrections keyed by the character position of a vowel:
 *             q   {at: "L" | "S"}        length of the vowel
 *             div {at: "join" | "split"} diphthong or two vowels
 *             syn {at: 1 | 0}            synizesis with the next vowel, or never
 *             wt  {at: "H" | "L"}        weight of the syllable
 * ========================================================================== */
(function (root) {
  "use strict";

  const VOW = "αεηιουω";
  const DIPH = new Set(["αι", "ει", "οι", "υι", "αυ", "ευ", "ηυ", "ου", "ωυ"]);
  const STOPS = "πβφτδθκγχ", VOICED = "βδγ", LIQUIDS = "λρ", NASALS = "μν";
  const DOUBLE = { "ζ": ["σ", "δ"], "ξ": ["κ", "σ"], "ψ": ["π", "σ"] };
  const APOS = "’ʼ'᾽᾿‘";
  const PUNCT = /[,.;:·;!?·;—–()\[\]"«»]/;
  const ACCENT = /[̀́͂]/;
  const INF = 1e9;

  // What each licence costs. The cheapest total wins, so these numbers only
  // rank readings of one line against each other.
  const COST = {
    hint: 1.2, prior: 0.8,
    correption: 0.15, hiatusLongP: 0.5, hiatusLongB: 1.4, hiatusMonoP: 0.25, hiatusMonoB: 0.7, nuDropped: 0.3, innerCorreption: 2.5, innerCorreptionDiph: 1.3,
    hiatusShort: 0.8, lengthenP: 3.5, lengthenB: 7,
    sonorantP: 1.5, sonorantB: 4, brevisP: 2.5, brevisB: 6,
    synE: 1.0, synOther: 2.6, synCross: 1.6, synCrossRare: 5,
    skZ: 4, positionIgnored: 8,
  };
  // Feet 1 to 5 in the Iliad and Odyssey, per thousand lines. Only breaks ties.
  const PATTERN_FREQ = {
    DDDDD: 192, DSDDD: 145, SDDDD: 128, DDDSD: 87, SSDDD: 78, DSDSD: 66, SDDSD: 60, DDSDD: 42,
    SSDSD: 37, DSSDD: 34, SDSDD: 29, DDSSD: 14, SSSDD: 13, DDDDS: 11, SDDDS: 10, SDSSD: 8,
    DSDDS: 8, DSSSD: 8, SSDDS: 5, DDDSS: 4, DSDSS: 3, SSSSD: 3, SDDSS: 3, DDSDS: 3,
    DSSDS: 2, SSDSS: 2, SDSDS: 1.4, SSSDS: 0.6, DDSSS: 0.6, DSSSS: 0.4, SDSSS: 0.25, SSSSS: 0.2,
  };
  const PATTERNS = Object.keys(PATTERN_FREQ);
  const patternPrior = (p) => 0.15 * Math.log10(192 / PATTERN_FREQ[p]);

  /* ---- words and letters ------------------------------------------------ */
  function tokenize(text) {
    const t = String(text == null ? "" : text).normalize("NFC");
    const words = [];
    let cur = null, aph = false;
    const close = (end) => { if (cur) { cur.e = end; words.push(cur); cur = null; } };
    for (let i = 0; i < t.length;) {
      const cp = t.codePointAt(i), c = String.fromCodePoint(cp), d = c.normalize("NFD");
      const low = d[0].toLowerCase();
      if (/[α-ωϝ]/.test(low)) {
        if (!cur) { cur = { s: i, e: i, letters: [], elided: false, aph, punct: "" }; aph = false; }
        cur.letters.push({ ch: low === "ς" ? "σ" : low, marks: d.slice(1), at: i, cap: d[0] !== low });
      } else if (/[̀-ͯ]/.test(c)) {
        if (cur && cur.letters.length) cur.letters[cur.letters.length - 1].marks += c;
      } else if (APOS.includes(c)) {
        if (cur) { cur.elided = true; close(i + c.length); } else aph = true;
      } else {
        close(i);
        aph = false;
        if (PUNCT.test(c) && words.length) words[words.length - 1].punct += c;
      }
      i += c.length;
    }
    close(t.length);
    words.forEach((w, i) => {
      w.i = i;
      const last = w.letters[w.letters.length - 1];
      // A stray smooth breathing on a final consonant is an elision mark.
      if (last && !VOW.includes(last.ch) && last.ch !== "ρ" && last.marks.includes("̓")) w.elided = true;
      w.form = t.slice(w.s, w.e);
    });
    return { text: t, words };
  }

  function nucleiOf(word, over) {
    const L = word.letters, out = [];
    for (let j = 0; j < L.length; j++) {
      const a = L[j];
      if (!VOW.includes(a.ch)) continue;
      const b = L[j + 1], forced = over.div && over.div[a.at];
      let two = !!b && DIPH.has(a.ch + b.ch) && !b.marks.includes("̈") && !/[̀́͂̓̔̈̄̆ͅ]/.test(a.marks);
      if (forced === "split") two = false;
      if (forced === "join") two = !!b && VOW.includes(b.ch);
      const marks = a.marks + (two ? b.marks : "");
      let nat = "?";
      const q = over.q && over.q[a.at];
      if (q === "L" || q === "S") nat = q;
      else if (two || a.ch === "η" || a.ch === "ω") nat = "L";
      else if (a.ch === "ε" || a.ch === "ο") nat = "S";
      else if (/[͂̄ͅ]/.test(marks)) nat = "L";
      else if (marks.includes("̆")) nat = "S";
      out.push({ wi: word.i, j0: j, j1: two ? j + 1 : j, v: a.ch + (two ? b.ch : ""), marks, at: a.at, diph: two, nat, fixed: !!q, hint: "", prior: "" });
      if (two) j++;
    }
    // What the accent says about a final α, ι or υ.
    const n = out.length;
    if (n >= 2 && !word.elided && out[n - 1].nat === "?") {
      const idx = out.findIndex((x) => ACCENT.test(x.marks));
      const second = idx >= 0 && out.slice(idx + 1).some((x) => ACCENT.test(x.marks));
      if (idx >= 0 && !second) {
        const p = n - 1 - idx, acc = out[idx];
        if (p === 1 && acc.marks.includes("͂")) out[n - 1].prior = "S";
        else if (p === 2) out[n - 1].prior = "S";
        else if (p === 1 && acc.nat === "L" && !ENCLITIC_END.test(plain(word))) out[n - 1].prior = "L";
      }
    }
    return out;
  }
  const ENCLITIC_END = /(?:τισ|τι|νυν|περ|πω|πωσ|τοι|μιν|σφι|σφιν|φι|φιν)$/;
  function plain(word) { return word.letters.map((l) => l.ch).join(""); }
  function strip(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[^α-ω]/g, "");
  }

  /* ---- the line as nuclei and the consonants between them ---------------- */
  function layout(text, opts) {
    const tk = tokenize(text), over = opts.over || {};
    const wau = new Set(opts.useW ? (opts.wau || []) : []);
    const N = [], between = [];
    let pending = [];
    tk.words.forEach((w) => {
      const nuc = nucleiOf(w, over), hint = (opts.hints && opts.hints[w.i]) || "";
      nuc.forEach((x, i) => { const h = hint[i]; if (h === "L" || h === "S") x.hint = h; });
      w.nuc0 = N.length; w.nNuc = nuc.length;
      w.vowelInitial = !!w.letters.length && VOW.includes(w.letters[0].ch) && !w.aph;
      if (wau.has(w.i) && w.vowelInitial) pending.push({ c: "ϝ", wi: w.i, at: w.s, w: true });
      let ni = 0;
      for (let j = 0; j < w.letters.length; j++) {
        const l = w.letters[j];
        if (ni < nuc.length && nuc[ni].j0 === j) {
          if (N.length) between.push(pending);
          else w.lead = pending;
          pending = [];
          N.push(nuc[ni]);
          j = nuc[ni].j1; ni++;
        } else if (!VOW.includes(l.ch)) {
          (DOUBLE[l.ch] || [l.ch]).forEach((c, i, arr) => pending.push({ c, wi: w.i, at: l.at, dbl: arr.length > 1, src: l.ch }));
        }
      }
    });
    between.push(pending);      // what follows the last vowel of the line
    return { tk, N, between };
  }

  const isMcl = (s0, s1) => !!s0 && !!s1 && !s0.dbl && !s1.dbl && !s0.w && !s1.w && STOPS.includes(s0.c) && (LIQUIDS + NASALS).includes(s1.c) && s0.wi === s1.wi;
  function mclCost(s0, s1, initial) {
    const voiced = VOICED.includes(s0.c);
    if (s1.c === "ρ") return initial ? 0.7 : 1.1;
    if (s1.c === "λ") return voiced ? 3 : (initial ? 0.9 : 1.4);
    return voiced ? 4 : 2.2;
  }

  // Every way syllable k can count: heavy or light, at what cost, on what licence.
  function options(L, k) {
    const n = L.N[k], I = L.between[k], m = I.length, last = k === L.N.length - 1;
    const next = L.N[k + 1], sameWord = !!next && next.wi === n.wi;
    const a = I.filter((s) => s.wi === n.wi).length, b = m - a;
    const forced = L.over.wt && L.over.wt[n.at];
    const out = [];
    const add = (w, len, cp, cb, lic, base) => {
      if (forced && forced !== w) return;
      out.push({ w, len, cp: (forced ? 0 : cp) + base, cb: (forced ? 0 : cb) + base, lic: forced ? ["set by hand"] : (lic ? [lic] : []) });
    };
    (n.nat === "?" ? ["L", "S"] : [n.nat]).forEach((len) => {
      let base = 0;
      if (n.nat === "?") {
        if (n.hint) base = n.hint === len ? 0 : COST.hint;
        else if (n.prior) base = n.prior === len ? 0 : COST.prior;
      }
      if (last) { add(len === "L" || m > 0 ? "H" : "L", len, 0, 0, "", base); return; }
      if (len === "L") {
        if (m === 0 && sameWord) { add("H", len, 0, 0, "", base); add("L", len, INF, n.diph && "ιυ".includes(n.v[1]) ? COST.innerCorreptionDiph : COST.innerCorreption, "correption inside the word", base); }
        else if (m === 0) {
          // ἤ, δή, μή and other long monosyllables stand in hiatus freely
          const mono = L.tk.words[n.wi].nNuc === 1;
          add("L", len, INF, COST.correption, "correption", base);
          add("H", len, mono ? COST.hiatusMonoP : COST.hiatusLongP, mono ? COST.hiatusMonoB : COST.hiatusLongB, "long vowel in hiatus", base);
        }
        else add("H", len, 0, 0, "", base);
      } else if (m === 0) {
        add("L", len, INF, sameWord ? 0 : COST.hiatusShort, sameWord ? "" : "short vowel in hiatus", base);
        add("H", len, COST.lengthenP, COST.lengthenB, "short vowel lengthened", base);
      } else if (m === 1) {
        add("L", len, INF, 0, "", base);
        if (a === 0 && "λμνρσϝ".includes(I[0].c)) add("H", len, COST.sonorantP, COST.sonorantB, "lengthened before initial " + I[0].c, base);
        else if (a === 1 && !sameWord) add("H", len, COST.brevisP, COST.brevisB, "final syllable lengthened", base);
        else add("H", len, COST.lengthenP, COST.lengthenB, "short vowel lengthened", base);
      } else {
        add("H", len, 0, 0, "", base);
        if (m === 2 && a === 1 && I[0].c === "ν" && I[1].w && MOVABLE_NU.test(plain(L.tk.words[n.wi]))) add("L", len, INF, COST.nuDropped, "movable ν dropped before digamma", base);
        else if (m === 2 && isMcl(I[0], I[1])) add("L", len, INF, mclCost(I[0], I[1], a === 0), "stop and liquid do not make position", base);
        else if (a === 0 && I[0].c === "σ" && (I[0].dbl || (I[1] && I[1].c === "κ"))) add("L", len, INF, COST.skZ, "short before " + (I[0].src || "σκ"), base);
        else add("L", len, INF, COST.positionIgnored, "consonants do not make position", base);
      }
    });
    // Where a vowel of unknown length counts the same either way (a closed
    // syllable, the end of the line), its length stays unknown.
    if (n.nat === "?" && !n.hint && !n.prior) {
      for (let i = 0; i < out.length; i++) {
        const j = out.findIndex((x, xi) => xi > i && x.w === out[i].w && x.cp === out[i].cp && x.cb === out[i].cb && x.len !== out[i].len);
        if (j > 0) { out[i].len = "?"; out.splice(j, 1); }
      }
    }
    if (forced && !out.length) out.push({ w: forced, len: n.nat, cp: 0, cb: 0, lic: ["set by hand"] });
    return out;
  }
  const CROSS_SYN = new Set(["δη", "η", "μη", "επει", "ω", "ειλαπινη"]);
  function synCost(L, k) {
    const n = L.N[k], nx = L.N[k + 1];
    if (!nx || L.between[k].length) return INF;
    const set = L.over.syn && L.over.syn[n.at];
    if (set === 0) return INF;
    if (set === 1) return 0;
    if (nx.wi === n.wi) return n.v === "ε" ? COST.synE : COST.synOther;
    const w = L.tk.words[n.wi];
    if (w.elided) return INF;
    return CROSS_SYN.has(plain(w)) ? COST.synCross : COST.synCrossRare;
  }

  function slotsOf(pat) {
    const s = [];
    for (let f = 0; f < 5; f++) {
      s.push({ w: "H", p: "P", foot: f + 1 });
      if (pat[f] === "D") { s.push({ w: "L", p: "B", foot: f + 1, half: 1 }); s.push({ w: "L", p: "B", foot: f + 1, half: 2 }); }
      else s.push({ w: "H", p: "B", foot: f + 1, half: 0 });
    }
    s.push({ w: "H", p: "P", foot: 6 });
    s.push({ w: "X", p: "B", foot: 6, half: 0 });
    return s;
  }

  // Cheapest way to lay the syllables on one foot pattern, or null if none.
  function fit(L, pat) {
    const slots = slotsOf(pat), n = L.N.length, S = slots.length;
    if (n < S || n > S + L.nSyn) return null;
    const best = [], back = [];
    for (let k = 0; k <= n; k++) { best.push(new Array(S + 1).fill(INF)); back.push(new Array(S + 1).fill(null)); }
    best[0][0] = 0;
    for (let k = 0; k < n; k++) {
      for (let j = Math.max(0, k - L.nSyn); j <= Math.min(k, S - 1); j++) {
        const here = best[k][j];
        if (here >= INF) continue;
        const slot = slots[j];
        const forcedSyn = L.over.syn && L.over.syn[L.N[k].at] === 1;
        if (!forcedSyn) {
          for (const o of L.opt[k]) {
            if (slot.w !== "X" && o.w !== slot.w) continue;
            const c = here + (slot.p === "P" ? o.cp : o.cb);
            if (c < best[k + 1][j + 1]) { best[k + 1][j + 1] = c; back[k + 1][j + 1] = { k, o, merged: false }; }
          }
        }
        if (L.syn[k] < INF && k + 1 < n) {
          // Two vowels run together make a long syllable, which a following vowel
          // in the next word can shorten like any other.
          const open = !L.between[k + 1].length && k + 2 < n && L.N[k + 2].wi !== L.N[k + 1].wi;
          if (slot.w !== "L" || open) {
            const c = here + L.syn[k] + (slot.w === "L" ? COST.correption : 0);
            if (c < best[k + 2][j + 1]) { best[k + 2][j + 1] = c; back[k + 2][j + 1] = { k, merged: true, light: slot.w === "L" }; }
          }
        }
      }
    }
    if (best[n][S] >= INF) return null;
    const steps = [];
    for (let k = n, j = S; j > 0; j--) { const st = back[k][j]; steps.unshift(st); k = st.k; }
    return { pat, cost: best[n][S] + patternPrior(pat), slots, steps };
  }

  /* ---- the finished line ------------------------------------------------- */
  function codaClass(c, nextC) {
    if (!c) return "none";
    if (c === "γ" && nextC && "κγχ".includes(nextC)) return "nasal";
    if (NASALS.includes(c)) return "nasal";
    if (LIQUIDS.includes(c)) return "liquid";
    if (c === "σ") return "sibilant";
    if (c === "ϝ") return "glide";
    return "stop";
  }
  function build(L, f, textLength) {
    const N = L.N, words = L.tk.words, sylls = [], licences = [];
    f.steps.forEach((st, si) => {
      const slot = f.slots[si], k0 = st.k, k1 = st.merged ? st.k + 1 : st.k, n = N[k1];
      const I = L.between[k1], m = I.length, lastSyl = k1 === N.length - 1;
      const a = I.filter((s) => s.wi === n.wi).length, b = m - a;
      const len = st.merged ? "L" : st.o.len;
      const w = st.merged ? (st.light ? "L" : "H") : st.o.w;
      const lic = st.merged ? (st.light ? ["synizesis", "correption"] : ["synizesis"]) : st.o.lic.slice();
      // The consonants that close this syllable. The rest open the next one.
      let coda = [];
      if (lastSyl) coda = I.slice();
      else if (m >= 2 && w === "H") {
        if (a >= 1 && b >= 1) coda = I.slice(0, a);
        else if (m >= 3 && isMcl(I[m - 2], I[m - 1])) coda = I.slice(0, m - 2);
        else coda = I.slice(0, m - 1);
        if (a === 0) coda = I.slice(0, 1);
      }
      const closed = coda.length > 0;
      const heavyBy = w !== "H" ? "" : len === "L" ? "nature" : closed && !lastSyl ? (a >= 1 && b >= 1 ? "position across words" : a === 0 ? "position, cluster of the next word" : "position inside the word") : lastSyl ? "line end" : len === "?" ? "nature" : "lengthening";
      const word = words[n.wi];
      const wordFinal = k1 === word.nuc0 + word.nNuc - 1;
      const rime = (len === "L" ? "VV" : len === "S" ? "V" : "V?") + "C".repeat(Math.min(coda.length, 2));
      // A long vowel before stop and liquid is closed only if the two are split.
      const viaMcl = m === 2 && isMcl(I[0], I[1]) && !lastSyl;
      const s = {
        i: si, k0, k1, wi: N[k0].wi, w, len, lic, foot: slot.foot, part: slot.p, half: slot.half || 0,
        coda: coda.map((c) => c.c).join(""), codaClass: coda.length > 1 ? "cluster" : codaClass(coda[0] && coda[0].c, I[coda.length] && I[coda.length].c),
        firstCoda: codaClass(coda[0] && coda[0].c, I[1] && I[1].c),
        rime, overlong: len === "L" && closed, overlongMaybe: len === "?" && closed, viaMcl, closed, heavyBy, wordFinal, synizesis: !!st.merged,
        nat: N[k1].nat, known: len !== "?" && (N[k1].nat !== "?" || !!N[k1].hint), vowel: N.slice(k0, k1 + 1).map((x) => x.v).join(""),
        at: N[k0].at, crossA: a, crossB: b, between: m,
      };
      lic.forEach((x) => licences.push({ syl: si, what: x }));
      sylls.push(s);
    });
    // The stretch of text each syllable covers, for display: its own vowels and
    // coda, and the consonants that open it.
    const starts = sylls.map((s, i) => {
      if (i === 0) return 0;
      const prev = sylls[i - 1], I = L.between[prev.k1], codaN = prev.coda.length;
      // count coda segments back into letters (a double consonant stays whole)
      let at = N[s.k0].at;
      const onset = I.slice(codaN).filter((x) => !x.w);
      if (onset.length) at = Math.min(at, onset[0].at);
      const w = words[N[s.k0].wi];
      // spaces and punctuation before the onset belong to the syllable before
      return Math.max(at, 0);
    });
    sylls.forEach((s, i) => { s.s = starts[i]; s.e = i + 1 < sylls.length ? starts[i + 1] : textLength; });
    return { sylls, licences };
  }

  const PREPOSITIVE = new Set(["και", "ο", "η", "το", "οι", "αι", "τον", "την", "του", "τησ", "τω", "τη", "των", "τουσ", "τασ", "τα", "εν", "ενι", "ειν", "εισ", "εσ", "εκ", "εξ", "συν", "ξυν", "προσ", "προ", "ανα", "κατα", "δια", "μετα", "παρα", "περι", "υπο", "υπερ", "επι", "απο", "αμφι", "αντι", "ωσ", "ει", "αι", "ου", "ουκ", "ουχ", "μη", "αλλα", "η", "ηδε", "ιδε", "ουδε", "μηδε", "ατ", "αταρ", "αυταρ", "οτε", "επει", "οφρα", "ινα", "οσ", "ον", "ην"]);
  const POSTPOSITIVE = new Set(["τε", "δε", "μεν", "γε", "γαρ", "κε", "κεν", "αν", "ρα", "αρ", "αρα", "δη", "περ", "τοι", "νυ", "νυν", "μιν", "οι", "σφι", "σφιν", "σφεασ", "σφισι", "σφισιν", "με", "μοι", "μευ", "σε", "τοι", "σευ", "εο", "ε", "που", "πω", "πωσ", "ποτε", "ποθι", "τισ", "τι", "τινα", "θην", "αυ"]);

  function measures(L, R) {
    const words = L.tk.words, sy = R.sylls, out = { overlong: [], wernicke: null, hermann: null, caesura: [], mcl: [], hiatus: [], correption: [], synizesis: [] };
    const at = (foot, part, half) => sy.find((s) => s.foot === foot && s.part === part && (half == null || s.half === half));
    sy.forEach((s) => {
      if (s.overlong) out.overlong.push({ syl: s.i, foot: s.foot, part: s.part, final: s.wordFinal, zone: (s.foot === 5 || s.foot === 6) && s.part === "P" });
      s.lic.forEach((x) => {
        if (x === "synizesis") out.synizesis.push({ syl: s.i });
        else if (x === "correption" || x === "correption inside the word") out.correption.push({ syl: s.i });
        else if (/hiatus/.test(x)) out.hiatus.push({ syl: s.i, long: /long/.test(x) });
      });
      const I = L.between[s.k1];
      if (I.length === 2 && isMcl(I[0], I[1])) out.mcl.push({ syl: s.i, heavy: s.w === "H", initial: s.crossA === 0, cluster: I[0].c + I[1].c, byNature: s.len === "L" });
    });
    // Wernicke's Law: a spondaic fourth foot whose second syllable ends a word and
    // is heavy only because consonants close it.
    const b4 = at(4, "B", 0);
    if (b4 && b4.wordFinal && b4.w === "H") {
      const position = b4.len !== "L" && b4.closed;
      const word = words[b4.wi], form = plain(word);
      out.wernicke = {
        syl: b4.i, breach: position, sure: b4.len === "S",
        // a proclitic or a monosyllable leans on its neighbour and is not what the law is about
        appositive: PREPOSITIVE.has(form) || POSTPOSITIVE.has(form) || word.nNuc === 1 || word.elided,
        shape: b4.len === "L" ? "long by nature" : b4.crossA >= 1 && b4.crossB >= 1 ? "V̆C#C" : b4.crossA === 0 ? "V̆#CC" : "other",
      };
    }
    // Hermann's bridge: no word end after the first short of a dactylic fourth foot.
    const h4 = at(4, "B", 1);
    if (h4 && h4.wordFinal) {
      const here = plain(words[h4.wi]), next = words[h4.wi + 1] ? plain(words[h4.wi + 1]) : "";
      // a word that leans on its neighbour, or has lost its end by elision, does not break the bridge
      out.hermann = { syl: h4.i, softened: PREPOSITIVE.has(here) || POSTPOSITIVE.has(next) || words[h4.wi].elided || words[h4.wi].nNuc === 1, elided: words[h4.wi].elided };
    }
    const end = (s) => s && s.wordFinal;
    if (end(at(3, "P"))) out.caesura.push("penthemimeral");
    if (end(at(3, "B", 1))) out.caesura.push("trochaic");
    if (end(at(4, "P"))) out.caesura.push("hephthemimeral");
    const f4 = sy.filter((s) => s.foot === 4).pop();
    if (end(f4)) out.caesura.push("bucolic");
    return out;
  }

  /* What stands before each vowel-initial word. The same record is made for every
   * such word, so words that once began with digamma can be set against the rest. */
  const MOVABLE_NU = /(?:σιν|ξιν|ψιν|εν)$/;
  function sites(L, R) {
    const words = L.tk.words, out = [];
    words.forEach((w) => {
      if (!w.vowelInitial || !w.nNuc || w.nuc0 === 0) return;
      const syl = R.sylls.find((s) => s.k1 === w.nuc0 - 1 || (s.k0 <= w.nuc0 - 1 && s.k1 >= w.nuc0 - 1));
      if (!syl) return;
      const n = L.N[w.nuc0 - 1], prev = words[n.wi], I = L.between[w.nuc0 - 1].filter((s) => !s.w);
      const gap = words.slice(n.wi + 1, w.i);            // vowelless elided words in between, e.g. δ’
      let ctx;
      if (syl.k1 >= w.nuc0) ctx = "synizesis";
      else if (gap.length || prev.elided) ctx = "elision";
      else if (!I.length) ctx = syl.len === "S" ? "short vowel, hiatus" : syl.w === "L" ? "long vowel, shortened" : "long vowel, kept long";
      else ctx = syl.len === "L" ? "long vowel and consonant" : syl.w === "H" ? "short vowel and consonant, heavy" : "short vowel and consonant, light";
      const pf = plain(prev);
      out.push({
        wi: w.i, form: w.form, syl: syl.i, foot: syl.foot, part: syl.part, ctx,
        elided: gap.length ? gap.map((g) => g.form).join(" ") : prev.elided ? prev.form : "",
        nu: !gap.length && !prev.elided && I.length === 1 && I[0].c === "ν" && MOVABLE_NU.test(pf),
        sure: syl.known, pause: !!prev.punct,
      });
    });
    return out;
  }
  // What a context says about a digamma at the start of the word.
  function wauVerdict(site) {
    switch (site.ctx) {
      case "elision": case "long vowel, shortened": case "short vowel and consonant, light": case "synizesis": return "neglected";
      case "short vowel, hiatus": case "short vowel and consonant, heavy": return "observed";
      case "long vowel, kept long": return site.part === "B" ? "observed" : "no evidence";
      default: return "no evidence";
    }
  }

  function prepare(text, opts) {
    const L = layout(text, opts);
    L.over = opts.over || {};
    L.opt = L.N.map((_, k) => options(L, k));
    L.syn = L.N.map((_, k) => synCost(L, k));
    L.nSyn = L.syn.filter((c) => c < INF).length;
    return L;
  }

  function analyze(text, options_) {
    const opts = options_ || {};
    const L = prepare(text, opts);
    const fits = (opts.pat ? [opts.pat] : PATTERNS).map((p) => fit(L, p)).filter(Boolean).sort((x, y) => x.cost - y.cost);
    const res = { text: L.tk.text, words: L.tk.words, nuclei: L.N, ok: fits.length > 0, pat: "", cost: INF, margin: 0, ranked: fits.map((f) => ({ pat: f.pat, cost: Math.round(f.cost * 100) / 100 })) };
    if (!fits.length) { res.sylls = []; res.licences = []; res.measures = null; res.sites = []; return res; }
    const top = fits[0];
    Object.assign(res, build(L, top, L.tk.text.length));
    res.pat = top.pat;
    res.cost = Math.round(top.cost * 100) / 100;
    res.margin = fits[1] ? Math.round((fits[1].cost - top.cost) * 100) / 100 : INF;
    res.measures = measures(L, res);
    res.sites = sites(L, res);
    // What the line settles about each vowel of unknown length.
    res.lengths = L.tk.words.map((w) => {
      let s = "";
      for (let k = w.nuc0; k < w.nuc0 + w.nNuc; k++) {
        const n = L.N[k], syl = res.sylls.find((x) => x.k0 <= k && x.k1 >= k);
        if (n.nat !== "?") { s += n.nat; continue; }
        if (!syl || syl.synizesis || syl.lic.length) { s += "?"; continue; }
        if (syl.w === "L") s += "S";
        else if (!syl.closed && k !== L.N.length - 1) s += "L";
        else s += "?";
      }
      return s;
    });
    return res;
  }

  /* ---- infinitives: what else could have stood here ----------------------- */
  const THEMATIC_ENDS = [["εμεναι", "έμεναι"], ["εμεν", "έμεν"], ["εειν", "έειν"], ["ειν", "ειν"]];
  // Athematic families: the tail a form shows, how many letters to cut, and the
  // tails that could replace it.
  const ATHEMATIC = [
    [/ομεναι$/, 6, ["όμεν", "οῦναι"]], [/εμεναι$/, 6, ["έμεν", "εῖναι"]], [/ημεναι$/, 5, ["ναι"]], [/ωμεναι$/, 5, ["ναι"]],
    [/υμεναι$/, 5, ["μεν", "ναι"]], [/αμεναι$/, 5, ["μεν", "ναι"]],
    [/ομεν$/, 4, ["όμεναι", "οῦναι"]], [/εμεν$/, 4, ["έμεναι", "εῖναι"]], [/υμεν$/, 3, ["μεναι", "ναι"]], [/αμεν$/, 3, ["μεναι", "ναι"]],
    [/ουναι$/, 5, ["όμεναι", "όμεν"]], [/ειναι$/, 5, ["έμεναι", "έμεν"]], [/ηναι$/, 3, ["μεναι"]], [/ωναι$/, 3, ["μεναι"]],
    [/υναι$/, 3, ["μεναι", "μεν"]], [/αναι$/, 3, ["μεναι", "μεν"]], [/οναι$/, 4, ["όμεναι", "όμεν"]], [/εναι$/, 4, ["έμεναι", "έμεν"]],
  ];
  const SET_BE = ["εἶναι", "ἔμεν", "ἔμμεν", "ἔμεναι", "ἔμμεναι"], SET_GO = ["ἰέναι", "ἴμεν", "ἴμεναι"], SET_KNOW = ["εἰδέναι", "ἴδμεν", "ἴδμεναι"];
  const WHOLE = [[/(?:ειναι|εμμεναι|εμεναι|εμμεν|εμεν)$/, SET_BE, "ειμι"], [/(?:ιεναι|ιμεναι|ιμεν)$/, SET_GO, "ειμι"], [/(?:ειδεναι|ιδμεναι|ιδμεν)$/, SET_KNOW, "οιδα"]];
  function cutBefore(form, lettersOff) {
    const L = tokenize(form).words[0].letters;
    return lettersOff >= L.length ? "" : form.normalize("NFC").slice(0, L[L.length - lettersOff].at);
  }
  function endingOf(k, conj) {
    if (conj === "a") return /μεναι$/.test(k) ? "μεναι" : /μεν$/.test(k) ? "μεν" : /ναι$/.test(k) ? "ναι" : "";
    if (/εμεναι$/.test(k)) return "έμεναι";
    if (/εμεν$/.test(k)) return "έμεν";
    if (/ημεναι$/.test(k)) return "ήμεναι";
    if (/εειν$/.test(k)) return "έειν";
    if (/ειν$/.test(k)) return "ειν";
    return "";
  }
  // The dialect each ending points to. stemSyllables matters for athematic -μεναι.
  function signature(ending, conj, stemSyllables) {
    if (conj === "a") {
      if (ending === "ναι") return "Ionic";
      if (ending === "μεν") return "Continental Aeolic";
      if (ending === "μεναι") return stemSyllables === 1 ? "pan-Aeolic" : stemSyllables > 1 ? "Aeolic, longer stem" : "Aeolic";
      return "";
    }
    if (conj === "c") return ending === "ήμεναι" ? "Aeolic" : ending ? "Ionic" : "";
    if (ending === "ειν") return "Ionic";
    if (ending === "έμεν") return "Continental Aeolic";
    if (ending === "έμεναι" || ending === "έειν") return "artificial";
    return "";
  }
  /* The other endings this infinitive could have taken. info: conj (t, a, s, c),
   * tense, lemma, stemSyllables. Returns [{form, ending, signature, stem}], stem
   * being the text the new form shares with the old one. */
  function infinitiveAlternatives(form, info) {
    const f = String(form || "").normalize("NFC"), k = strip(f), conj = info.conj, out = [];
    if (!k || /[’ʼ'᾽]$/.test(f)) return out;
    const lem = strip(info.lemma || "");
    const push = (stem, tail, c) => { const e = endingOf(strip(tail), c || conj); out.push({ form: stem + tail, ending: e, signature: signature(e, c || conj, info.stemSyllables), stem }); };
    if (conj === "a") {
      for (const [re, set, lemEnd] of WHOLE) {
        const m = re.exec(k);
        if (!m || !lem.endsWith(lemEnd)) continue;
        const stem = cutBefore(f, m[0].length);
        // after a prefix the verb carries no breathing
        set.filter((x) => strip(x) !== m[0]).forEach((x) => push(stem, stem ? x.normalize("NFD").replace(/[̓̔]/g, "").normalize("NFC") : x));
        return out;
      }
      for (const [re, off, tails] of ATHEMATIC) {
        if (!re.test(k)) continue;
        const stem = cutBefore(f, off);
        tails.forEach((t) => push(stem, t));
        return out;
      }
      return out;
    }
    if (conj === "c") {
      if (/ημεναι$/.test(k)) { const stem = cutBefore(f, 6); push(stem, "έειν"); push(stem, "εῖν"); }
      else if (/εειν$/.test(k)) { const stem = cutBefore(f, 4); push(stem, "εῖν"); push(stem, "ήμεναι"); }
      else if (/ειν$/.test(k)) { const stem = cutBefore(f, 3); push(stem, "έειν"); push(stem, "ήμεναι"); }
      return out;
    }
    const own = THEMATIC_ENDS.find(([e]) => k.endsWith(e));
    if (!own) return out;                       // -σαι and the like have no rival
    const stem = cutBefore(f, own[0].length), aorist = info.tense === "a";
    THEMATIC_ENDS.forEach(([e, tail]) => {
      if (e === own[0] || (e === "εειν" && !aorist)) return;
      push(stem, e === "ειν" && aorist ? "εῖν" : tail, "t");
    });
    return out;
  }
  /* Put each alternative in the line and scan again. yes: it scans as well as the
   * line does now. licence: it needs something the line does not. no: it will not go. */
  function necessity(text, wi, alts, options_) {
    const opts = options_ || {}, base = analyze(text, opts);
    const w = base.words[wi];
    if (!w || !base.ok) return { base, results: [] };
    const own = base.lengths[wi] || "";
    const results = alts.map((alt) => {
      const stemEnd = w.s + alt.stem.length;
      const stemNuclei = base.nuclei.filter((n) => n.wi === wi && n.at + n.v.length <= stemEnd).length;
      const hints = Object.assign({}, opts.hints || {});
      hints[wi] = own.slice(0, stemNuclei);
      const delta = alt.form.length - (w.e - w.s), over = {};
      Object.entries(opts.over || {}).forEach(([key, map]) => {
        over[key] = {};
        Object.entries(map || {}).forEach(([at, v]) => { const a = +at; if (a < w.s) over[key][a] = v; else if (a >= w.e) over[key][a + delta] = v; });
      });
      const newText = base.text.slice(0, w.s) + alt.form + base.text.slice(w.e);
      const r = analyze(newText, Object.assign({}, opts, { hints, over, pat: undefined }));
      const extra = r.ok ? r.cost - base.cost : INF;
      return {
        form: alt.form, ending: alt.ending, signature: alt.signature, text: newText,
        verdict: !r.ok || extra > 2.2 ? "no" : extra > 0.6 ? "licence" : "yes",
        pat: r.pat, scansion: r.ok ? scansionString(r) : "", licences: r.ok ? r.licences.map((x) => x.what) : [],
      };
    });
    return { base, results };
  }

  const WEIGHT_MARK = { H: "–", L: "⏑" };
  function scansionString(res) {
    let out = "", foot = 0;
    res.sylls.forEach((s) => { if (s.foot !== foot) { out += foot ? " | " : ""; foot = s.foot; } out += WEIGHT_MARK[s.w]; });
    return out;
  }
  function weights(res) { return res.sylls.map((s) => s.w).join(""); }

  const api = { analyze, tokenize, strip, plain, PATTERNS, wauVerdict, scansionString, weights, COST, infinitiveAlternatives, necessity, signature, endingOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VerseEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
