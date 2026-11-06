/* ============================================================================
 *  INFINITIVE ENGINE: pure functions, no DOM. Decides whether a word of a text
 *  is an infinitive and proposes its encoding (lemma, tense, voice, conjugation,
 *  ending, metrical shapes) from the corpus infinitives.
 *  Used by infinitive-encoder.js. Input data: assets/data/encoder/lexicon.json
 *  and assets/data/encoder/infinitives.json.
 *
 *  The ending tags follow INF_ENDING_TAGS in morphology-standalone.js: the
 *  morpheme column stores a number whose meaning depends on the conjugation class,
 *  and the sigmatic and contract classes have their own tags in the future.
 * ========================================================================== */
(function (root) {
  "use strict";
  const C = root.CompoundEngine || require("./compound-engine.js");
  const strip = C.strip;

  const MORE = { "5": "analogical / epic creation", "6": "contracted" };
  const TAGS = {
    t: { name: "thematic", tags: { "1": "‑ειν", "2": "‑έμεν", "3": "‑έμεναι", "4": "‑έειν", ...MORE } },
    a: { name: "athematic", tags: { "1": "‑ναι", "2": "‑μεν", "3": "‑μεναι" } },
    s: { name: "sigmatic", tags: { "1": "‑σαι" } },
    sf: { name: "future thematic", tags: { "1": "‑σειν", "2": "‑σέμεν", "3": "‑σέμεναι" } },
    c: { name: "contract", tags: { "1": "‑ειν", "2": "‑έμεν", "3": "‑έμεναι", "4": "‑έειν", ...MORE } },
    cf: { name: "future contract", tags: { "1": "‑ειν" } },
  };
  const endingClass = (conj, tense) => ((conj === "s" || conj === "c") && tense === "f" ? conj + "f" : conj);
  const endingTag = (conj, tense, m) => { const c = TAGS[endingClass(conj, tense)]; return (c && c.tags[String(m)]) || ""; };
  const endingOptions = (conj, tense) => {
    const c = TAGS[endingClass(conj, tense)];
    return c ? Object.keys(c.tags).map((m) => ({ m, tag: c.tags[m] })) : [];
  };
  // Syllables the ending takes up, which is what separates stem shape from form shape.
  const SYLLABLES = { "‑ειν": 1, "‑ναι": 1, "‑μεν": 1, "‑σαι": 1, "‑σειν": 1, "‑μεναι": 2, "‑έμεν": 2, "‑έειν": 2, "‑σέμεν": 2, "‑έμεναι": 3, "‑σέμεναι": 3 };
  const endingSyllables = (conj, tense, m) => SYLLABLES[endingTag(conj, tense, m)] || 1;

  /* ---- syllables and weight ------------------------------------------- */
  const VOWEL = "αεηιουω";
  const DIPH = new Set(["αι", "ει", "οι", "υι", "αυ", "ευ", "ηυ", "ου"]);
  function letters(word) {
    const out = [];
    [...word.normalize("NFD").toLowerCase().replace(/ς/g, "σ")].forEach((ch) => {
      if (/[α-ω]/.test(ch)) out.push({ ch, marks: "" });
      else if (/[̀-ͯ]/.test(ch) && out.length) out[out.length - 1].marks += ch;
    });
    return out;
  }
  function syllables(word) {
    const L = letters(word), out = [];
    let i = 0;
    while (i < L.length) {
      if (!VOWEL.includes(L[i].ch)) { i++; continue; }
      const a = L[i], b = L[i + 1];
      const two = b && DIPH.has(a.ch + b.ch) && !b.marks.includes("̈");
      const marks = a.marks + (two ? b.marks : "");
      const long = two || a.ch === "η" || a.ch === "ω" || marks.includes("͂") || marks.includes("ͅ");
      i += two ? 2 : 1;
      let cons = 0, j = i;
      while (j < L.length && !VOWEL.includes(L[j].ch)) { cons += "ζξψ".includes(L[j].ch) ? 2 : 1; j++; }
      out.push({ long, cons, final: j >= L.length, accent: /[\u0300\u0301\u0342]/.test(marks) });
      i = j;
    }
    return out;
  }
  const opensWith = (word) => {
    const L = letters(word || "");
    let n = 0;
    for (const l of L) { if (VOWEL.includes(l.ch)) break; n += "ζξψ".includes(l.ch) ? 2 : 1; }
    return n;
  };
  // Heavy or light by rule. The final syllable depends on the next word: a final
  // consonant closes it before a consonant, and a final long is shortened before a
  // vowel. α, ι and υ of unknown length count as light.
  function scan(word, next) {
    const after = next === undefined ? null : opensWith(next);
    return syllables(word).map((s) => {
      if (!s.final) return s.long || s.cons >= 2 ? "H" : "L";
      if (after === null) return "H";
      if (s.cons > 0) return s.long || s.cons + after >= 2 ? "H" : "L";
      if (s.long) return after === 0 ? "L" : "H";
      return after >= 2 ? "H" : "L";
    }).join("");
  }

  /* ---- accent --------------------------------------------------------- */
  // 1 = last syllable, 2 = penult, 3 = antepenult; 0 if unaccented.
  function accentFromEnd(word) {
    const s = syllables(C.citeAccent(word));
    const i = s.findIndex((x) => x.accent);
    return i < 0 ? 0 : s.length - i;
  }
  function finalCircumflex(word) {
    const d = word.normalize("NFD");
    const at = d.lastIndexOf("͂");
    if (at < 0) return false;
    return !/[αεηιουω]/i.test(d.slice(at + 1).replace(/[ιυ]$/i, "").replace(/[^α-ω]/gi, "").replace(/^[ιυ]/, ""));
  }

  /* ---- index ---------------------------------------------------------- */
  // The stem an infinitive shows once its ending is off, and the ending that left it.
  const STEM_CUT = /(?:σεμεναι|ξεμεναι|ψεμεναι|σεμεν|ξεμεν|ψεμεν|εμεναι|εμεν|εειν|ααν|σειν|ξειν|ψειν|ειν|θηναι|ηναι|μεναι|μεν|ναι|σαι|ξαι|ψαι|αν|αι)$/;
  const stemOf = (k) => k.replace(STEM_CUT, "");
  const conjOf = { s: "s", t: "t", a: "a", c: "c" };

  const VERB_END = /(?:οντες|οντας|οντα|οντι|οντων|ουσαν|ουσα|ουσι|ουσιν|ομενος|ομενοι|ομενον|ομενην|ομενη|εσθαι|εσθε|οντο|ομεν|ειεν|οιεν|οιτο|ετε|ητε|ετο|ειν|ων|ον|ες|εν|ε|ω|οι|η)$/;
  function buildIndex(lexicon, inf) {
    const ix = { cix: C.buildIndex(lexicon), known: new Map(), others: new Map(), partial: new Map(), stems: new Map(), shapes: new Map(), verbs: [], formStems: new Map() };
    lexicon.lemmas.forEach(([lemma, pos, , , , , forms]) => {
      if (pos !== "v") return;
      forms.split(" ").forEach((f) => {
        const s = f.replace(VERB_END, "");
        if (s.length < 2 || s === f) return;
        if (!ix.formStems.has(s)) ix.formStems.set(s, new Map());
        const m = ix.formStems.get(s);
        if (!m.has(lemma)) m.set(lemma, new Set());
        m.get(lemma).add(f);
      });
    });
    Object.entries(inf.known).forEach(([k, rows]) => {
      const list = rows.map(([lemma, tense, voice, conj, morph, stem, shape, n]) => ({ lemma, tense, voice, conj, morph, stem, shape, n }))
        .sort((a, b) => b.n - a.n);
      ix.known.set(k, list);
      list.forEach((a) => {
        const s = stemOf(k);
        if (s.length >= 2) {
          if (!ix.stems.has(s)) ix.stems.set(s, []);
          ix.stems.get(s).push({ ...a, from: k });
        }
        const key = a.lemma + "|" + a.tense;
        if (!ix.shapes.has(key)) ix.shapes.set(key, new Map());
        const m = ix.shapes.get(key);
        m.set(a.stem, (m.get(a.stem) || 0) + a.n);
      });
    });
    Object.entries(inf.others).forEach(([k, n]) => ix.others.set(k, n));
    Object.entries(inf.partial).forEach(([k, a]) => ix.partial.set(k, a));
    lexicon.lemmas.forEach(([lemma, pos, , , , n]) => { if (pos === "v") ix.verbs.push({ lemma, key: strip(lemma), n }); });
    ix.verbs.sort((a, b) => b.n - a.n);
    return ix;
  }
  function usualStem(ix, lemma, tense) {
    const m = ix.shapes.get(lemma + "|" + tense);
    return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : "";
  }

  /* ---- reading the ending of an unseen form ---------------------------- */
  // Each row: ending, tense, voice, conjugation, morpheme, weight. Longest first.
  const RULES = [
    [/[σξψ]εμεναι$/, [["f", "a", "s", "3", 5]]],
    [/[σξψ]εμεν$/, [["f", "a", "s", "2", 5]]],
    [/εμεναι$/, [["p", "a", "t", "3", 5], ["a", "a", "t", "3", 3]]],
    [/εμεν$/, [["p", "a", "t", "2", 5], ["a", "a", "t", "2", 3], ["a", "a", "a", "2", 1]]],
    [/θημεναι$/, [["a", "p", "a", "3", 6]]],
    [/ημεναι$/, [["a", "a", "a", "3", 4], ["a", "p", "a", "3", 3], ["p", "a", "c", "3", 3]]],
    [/αμεναι$/, [["r", "a", "a", "3", 3], ["a", "a", "a", "3", 2], ["p", "a", "c", "3", 2]]],
    [/[ιυ]μεναι$/, [["p", "a", "a", "3", 4], ["a", "a", "a", "3", 2], ["r", "a", "a", "3", 2]]],
    [/ωμεναι$/, [["a", "a", "a", "3", 3], ["p", "a", "c", "3", 3]]],
    [/αμεν$/, [["r", "a", "a", "2", 3], ["a", "a", "a", "2", 2]]],
    [/ημεν$/, [["a", "a", "a", "2", 3]]],
    [/[ιυ]μεν$/, [["p", "a", "a", "2", 3], ["r", "a", "a", "2", 2]]],
    [/εειν$/, [["a", "a", "t", "4", 5], ["p", "a", "c", "1", 4], ["f", "a", "c", "1", 2]]],
    [/ααν$/, [["p", "a", "c", "1", 5], ["f", "a", "c", "1", 3]]],
    [/[σξψ]ειν$/, [["f", "a", "s", "1", 5], ["p", "a", "t", "1", 2]]],
    [/ειν$/, [["p", "a", "t", "1", 6], ["a", "a", "t", "1", 3], ["p", "a", "c", "6", 3]]],
    [/αν$/, [["p", "a", "c", "6", 3]]],
    [/θηναι$/, [["a", "p", "a", "1", 7]]],
    [/ηναι$/, [["a", "p", "a", "1", 4], ["a", "a", "a", "1", 3], ["a", "a", "s", "1", 3]]],
    [/ειναι$/, [["a", "a", "s", "1", 5], ["p", "a", "a", "1", 3]]],
    [/εναι$/, [["p", "a", "a", "1", 5], ["r", "a", "a", "1", 3]]],
    [/(?:ου|υ|ω|α)ναι$/, [["a", "a", "a", "1", 4], ["p", "a", "a", "1", 3], ["a", "a", "s", "1", 2]]],
    [/[σξψ]αι$/, [["a", "a", "s", "1", 5]]],
    [/[λρ]αι$/, [["a", "a", "s", "1", 3]]],
  ];
  const PLURAL_VERB = /(?:ομεν|ωμεν|οιμεν|αιμεν|ειμεν|ουμεν|[σξψ]αμεν|ηκειν|εικειν)$/;
  const PARTICIPLE = /(?:ομεναι|[σξψ]αμεναι|ουσαι|ουσαν|εισαι|ασαι|ωσαι|αντι)$/;
  // Shapes that share an infinitive's letters but not its accent: -μέναι is a
  // perfect participle, and φύλαξαι with the accent further back is an imperative.
  function otherWord(form, k) {
    const acc = accentFromEnd(form);
    if (PLURAL_VERB.test(k) || PARTICIPLE.test(k)) return true;
    if (/μεναι$/.test(k) && acc === 2) return true;
    if (/(?:[σξψ]αι|ναι|[λρ]αι)$/.test(k) && acc === 3) return true;
    if (/αν$/.test(k) && !/ααν$/.test(k) && !finalCircumflex(form)) return true;
    return false;
  }

  /* Verbs a stem could belong to. Sigmatic stems lose their final consonant, so
   * those are tried back; ix.cix.verbStem already holds the -η- and -ε- stems. */
  const BACK = { σ: ["", "ζ", "δ", "θ", "τ", "σσ"], ξ: ["κ", "γ", "χ", "σσ", "ζ"], ψ: ["π", "β", "φ", "πτ"] };
  function verbsFor(ix, stem, consonant, exclude, excludeForm) {
    const cix = ix.cix, seen = new Map();
    const take = (e) => { if (e.lemma !== exclude && e.pos === "v") seen.set(e.lemma, e); };
    (consonant ? BACK[consonant] : [""]).forEach((b) => {
      const s = stem + b;
      ["ω", "ομαι", "εω", "αω", "οω", "μι"].forEach((end) => (cix.lemmaByKey.get(s + end) || []).forEach(take));
    });
    if (!seen.size) {
      (consonant ? BACK[consonant] : [""]).forEach((b) => {
        const s = stem + b;
        (cix.verbStem.get(s) || []).forEach(take);
        (cix.stemTo.get(s) || []).forEach(take);
      });
    }
    if (!seen.size) {
      // A strong aorist or suppletive stem shows up in the verb's other forms.
      const m = ix.formStems.get(stem);
      if (m) m.forEach((forms, lemma) => {
        if ([...forms].some((f) => f !== excludeForm)) (cix.lemmaByKey.get(strip(lemma)) || []).forEach(take);
      });
    }
    return [...seen.values()].sort((a, b) => b.n - a.n);
  }
  const PREVERBS = ["απο", "απ", "αφ", "επι", "επ", "εφ", "περι", "προ", "προσ", "κατα", "κατ", "καθ", "μετα", "μετ", "μεθ", "παρα", "παρ", "ανα", "αν", "δια", "δι", "υπο", "υπ", "υφ", "υπερ", "αμφι", "εισ", "εκ", "εξ", "εν", "εμ", "εγ", "συν", "συμ", "συγ", "ξυν", "αντι", "αντ"]
    .sort((a, b) => b.length - a.length);
  const lemmaIs = (ix, key) => (ix.cix.lemmaByKey.get(key) || []).filter((e) => e.pos === "v");

  function guess(ix, form, opts) {
    opts = opts || {};
    const k = strip(form), exclude = opts.excludeForm || null;
    const out = new Map();
    const add = (a, w) => {
      const id = [a.lemma, a.tense, a.voice, a.conj, a.morph].join("|");
      const prev = out.get(id);
      if (!prev || prev.w < w) out.set(id, { ...a, w });
    };
    // Another infinitive with this stem settles most of the fields at once. A
    // compound verb inherits from the simple verb: διελθέμεν from ἐλθεῖν.
    let kin = (ix.stems.get(stemOf(k)) || []).filter((a) => a.from !== exclude);
    if (!kin.length) {
      const st = stemOf(k);
      for (const p of PREVERBS) {
        if (!st.startsWith(p) || st.length - p.length < 2) continue;
        const rest = (ix.stems.get(st.slice(p.length)) || []).filter((a) => a.from !== exclude);
        if (!rest.length) continue;
        kin = rest.map((a) => {
          const full = lemmaIs(ix, p + strip(a.lemma))[0] || lemmaIs(ix, p.slice(0, -1) + strip(a.lemma))[0];
          return { ...a, lemma: full ? full.lemma : "", stem: "" };
        });
        break;
      }
    }
    const rule = RULES.find(([re]) => re.test(k));
    const rows = rule ? rule[1] : [];
    rows.forEach(([tense, voice, conj, morph, w]) => {
      const kinHit = kin.filter((a) => a.tense === tense && a.conj === conj);
      if (kinHit.length) {
        const a = kinHit[0];
        add({ lemma: a.lemma, tense, voice: a.voice, conj, morph, stem: a.stem, kin: a.from }, w + 6);
        return;
      }
      const m = rule[0].exec(k);
      const consonant = /^[σξψ]/.test(m[0]) ? m[0][0] : "";
      const verbs = verbsFor(ix, k.slice(0, m.index), consonant, opts.excludeLemma, exclude);
      add({ lemma: verbs[0] ? verbs[0].lemma : "", tense, voice, conj, morph, stem: "" }, w + (verbs[0] ? 3 : 0));
    });
    // A real present settles what the ending alone cannot: ἀέξειν is not a future.
    const plain = /(ειν|εμεναι|εμεν)$/.exec(k);
    if (plain) {
      const base = k.slice(0, plain.index), morph = { ειν: "1", εμεν: "2", εμεναι: "3" }[plain[1]];
      const present = lemmaIs(ix, base + "ω").concat(lemmaIs(ix, base + "ομαι")).find((e) => e.lemma !== opts.excludeLemma);
      if (present) add({ lemma: present.lemma, tense: "p", voice: "a", conj: "t", morph, stem: "" }, 14);
      else if (/σσ$/.test(base)) add({ lemma: "", tense: "p", voice: "a", conj: "t", morph, stem: "" }, 11);
      if (plain[1] === "ειν" && finalCircumflex(form)) {
        const con = lemmaIs(ix, base + "εω").concat(lemmaIs(ix, base + "αω")).find((e) => e.lemma !== opts.excludeLemma);
        if (con) add({ lemma: con.lemma, tense: "p", voice: "a", conj: "c", morph: "6", stem: "" }, 15);
      }
    }
    if (/^(.)ε\1/.test(k.slice(0, 3)) && /μεν(αι)?$/.test(k)) out.forEach((a) => { if (a.tense === "r") a.w += 4; });
    // A related infinitive with another tense still gives the lemma.
    if (kin.length) out.forEach((a) => { if (!a.lemma) a.lemma = kin[0].lemma; });
    // The circumflex separates -εῖν from -ειν.
    if (finalCircumflex(form) && /ειν$/.test(k)) out.forEach((a) => { if (a.tense === "p" && a.conj === "t" && a.morph === "1") a.w -= 5; });
    const shape = scan(form, opts.next);
    return [...out.values()].sort((a, b) => b.w - a.w).slice(0, 4).map((a) => {
      const stem = a.stem || usualStem(ix, a.lemma, a.tense) || shape.slice(0, Math.max(0, shape.length - endingSyllables(a.conj, a.tense, a.morph)));
      return { ...a, stem, shape, tag: endingTag(a.conj, a.tense, a.morph) };
    });
  }

  const sameAnalysis = (a, b) => a.lemma === b.lemma && a.tense === b.tense && a.voice === b.voice && a.conj === b.conj && a.morph === b.morph;
  function distinct(list) {
    const out = [];
    list.forEach((a) => { if (!out.some((b) => sameAnalysis(a, b))) out.push(a); });
    return out;
  }

  /* kinds:
   *   known   a corpus infinitive with one reading (can be logged in bulk)
   *   check   an infinitive with more than one reading, or a spelling that is
   *           also another word, or an elided form whose ending is hidden
   *   new     not in the corpus as an infinitive; carries proposals
   *   plain   nothing to encode. -σθαι is here because the middle and
   *           mediopassive infinitives are not being encoded yet.            */
  function fitShape(shape, form, next) {
    const here = scan(form, next);
    return shape && shape.length === here.length ? shape.slice(0, -1) + here.slice(-1) : (shape || here);
  }
  function classify(ix, form, opts) {
    opts = opts || {};
    const k = strip(form);
    const plain = { kind: "plain", k };
    if (k.length < 3 || /σθαι$/.test(k) || (opts.elided && /σθ$/.test(k))) return plain;
    if (opts.local && opts.local.has(k)) {
      const a = opts.local.get(k);
      return { kind: opts.elided ? "check" : "known", k, analyses: [{ ...a, shape: fitShape(a.shape, form, opts.next) }], local: true };
    }
    let list = distinct(ix.known.get(k) || []);
    if (opts.elided) list = distinct(list.concat(ix.known.get(k + "αι") || []));
    if (list.length) {
      const tokens = list.reduce((t, a) => t + (a.n || 0), 0), also = ix.others.get(k) || 0;
      if (also > tokens * 5) return plain;
      const analyses = list.map((a) => ({ ...a, shape: fitShape(a.shape, form, opts.next), tag: endingTag(a.conj, a.tense, a.morph) }));
      return { kind: also || list.length > 1 || opts.elided ? "check" : "known", k, analyses, also };
    }
    const partial = ix.partial.get(k);
    if (partial) {
      const props = guess(ix, form, opts).map((p) => ({ ...p, lemma: partial[0], tense: partial[1], voice: partial[2] }));
      if (props.length) return { kind: "new", k, analyses: props, sure: true };
    }
    if (ix.cix.formTo.has(k) && !opts.pretendUnseen) return plain;
    if (otherWord(form, k)) return plain;
    const props = guess(ix, form, opts);
    if (props.length && flags(ix, k, props[0])) return { kind: "new", k, analyses: props };
    return plain;
  }
  // Unseen -ειν and -έμεν are nearly always infinitives; the shorter endings are
  // common on other words, so those need a verb behind them.
  function flags(ix, k, p) {
    if (/(?:ειν|εμεν|εμεναι|εειν|ααν|θηναι|μεναι)$/.test(k)) return k.length >= 4;
    return !!p.lemma && strip(p.lemma).slice(0, 2) === k.slice(0, 2);
  }

  const api = { accentFromEnd, TAGS, endingClass, endingTag, endingOptions, endingSyllables, scan, syllables, buildIndex, guess, classify, usualStem, strip };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.InfinitiveEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
