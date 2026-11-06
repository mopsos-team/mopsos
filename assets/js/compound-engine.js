/* ============================================================================
 *  COMPOUND ENGINE: pure functions, no DOM. Splits a Greek word into compound
 *  members using the catalogue and the corpus lemmas, and decides what each word
 *  of a text is (catalogue compound, probable new compound, or neither).
 *  Used by compound-encoder.js. Input data: assets/data/encoder/lexicon.json.
 * ========================================================================== */
(function (root) {
  "use strict";

  const COMBINING = /[̀-ͯ]/g;
  function strip(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(COMBINING, "")
      .toLowerCase().replace(/ς/g, "σ").replace(/[^α-ω]/g, "");
  }
  const hasGreek = (s) => /[Ͱ-Ͽἀ-῿]/.test(s);

  /* ---- stems --------------------------------------------------------- */
  // Citation ending -> stems it can stand for. Keys are stripped, so every
  // sigma is medial. Third-declension entries list the oblique stems too, so
  // an inflected form with short o finds a headword with long omega.
  const CITE = [
    ["ευσ", ["ε", "η", "ευ"]], ["ουσ", ["οδ", "οντ", "ουντ", "ουν"]], ["ωρ", ["ορ", "ωρ"]], ["ηρ", ["ερ", "ηρ"]], ["αρ", ["αρ", "ατ"]],
    ["ωψ", ["ωπ", "οπ"]], ["οψ", ["οπ"]], ["ιψ", ["ιπ", "ιβ"]], ["υψ", ["υπ"]], ["αψ", ["απ"]], ["ειψ", ["ειπ"]],
    ["ωσ", ["ω", "ωτ", "ο"]], ["ων", ["", "ον", "ωντ", "οντ", "ων", "ωνοντ"]], ["ην", ["", "εν", "ην"]],
    ["ησ", ["", "ε", "ητ", "ηντ"]], ["ασ", ["", "αντ", "αδ", "ατ", "αν"]], ["ισ", ["", "ιδ", "ιτ", "ιν", "ιθ"]],
    ["υσ", ["", "υ", "υδ", "υθ", "υν"]], ["οσ", [""]], ["ον", [""]], ["α", [""]], ["η", [""]],
    ["ξ", ["κ", "γ", "χ"]], ["ψ", ["π", "β", "φ"]], ["ομαι", [""]], ["μαι", [""]], ["σ", ["", "τ", "δ", "θ", "ντ"]],
    ["μι", [""]], ["ω", [""]], ["ι", ["ι", "ιτ"]], ["υ", ["υ"]],
  ];
  function citeStems(k) {
    const out = new Set();
    for (const [end, stems] of CITE) {
      if (k.length > end.length && k.endsWith(end)) {
        const base = k.slice(0, -end.length);
        for (const s of stems) out.add(base + s);
        break;
      }
    }
    out.add(k);
    return out;
  }

  // Inflectional endings a token can carry (longest first).
  const INFL = ["οισιν", "ηισιν", "αισιν", "εσσιν", "οισι", "ηισι", "αισι", "ησιν", "εσσι", "ουσι", "ασιν", "αων", "εων", "ηφι", "οφι",
    "αισ", "ησι",
    "οιο", "οισ", "ουσ", "ησι", "ασι", "εσι", "εσιν", "σιν", "εοσ", "ευσ", "ησ", "ασ", "ην", "αν", "εσ", "ιν", "υν",
    "ον", "ου", "ων", "οι", "ει", "εα", "αι", "οσ", "υσ", "ισ", "σι", "α", "ε", "η", "ι", "ω", "υ"];
  function tokenStems(k) {
    const out = new Map();     // stem -> ending
    out.set(k, "");
    for (const e of INFL) {
      if (k.length - e.length >= 3 && k.endsWith(e) && !out.has(k.slice(0, -e.length))) out.set(k.slice(0, -e.length), e);
    }
    return out;
  }

  // Shapes that are verbs or participles, not compounds, whatever they split into.
  const VERBAL_END = new RegExp("(" + [
    "ντο", "νται", "σθαι", "σθε", "σθω", "μεθα", "μεθ", "μεναι", "ουσι", "ουσιν", "ησω", "ωσι", "ωσιν", "ειν", "οιεν", "ειεν", "οιτο",
    "αιτο", "ετο", "ατο", "ησαν", "ουσαν", "εσκε", "εσκον", "εσκεν", "σαιμι", "αιμι", "αιμην", "ειασ", "ειε", "ησε", "ησεν", "ασε", "ασεν",
    "ωμαι", "ηται", "εται", "αται", "ομεν", "ομαι", "ονται", "ανται", "ωνται", "υμεν", "ηκε", "ηκεν", "σθην", "θησαν", "ουσα", "ουσαν", "ουσησ",
    "ουσαι", "ουσασ", "ουσηι", "ουσων", "εισα", "εισαν", "εισαι", "ασα", "ασαν", "ασαι", "ωσα", "ωσαν", "ωσαι", "ευσε", "ευσεν", "ευσαν", "ησα", "ετε", "ειτε",
  ].join("|") + ")$");
  const PARTICIPLE = /(ο|α|ω|η|ου|ει|υ|σ|θ|γ)μεν(οσ|ου|οιο|ον|ω|οι|ων|οισι|οισιν|οισ|ουσ|η|ησ|ην|ησι|ησιν|ηισι|αι|ασ|α|ε|αισ|αισι)$|(ο|α|ου|ω|ε|ει|υ|ση|σα)ντ(εσ|α|ων|ι|ασ|οσ|ε|εσσι|εσσιν)$|(ησ|ασ|ξ|ψ|ισ|υσ)α(σ|ν|ι)$|(ησ|ασ|ξ|ψ)αι$|ηκ(ωσ|οτα|οτεσ|οτοσ|οτι|υια)$/;
  // Comparatives and superlatives: not compounds even when they split.
  const DEGREE = /(τερ|τατ|ιστ)(οσ|ου|οιο|ον|ω|οι|ων|ουσ|οισι|οισιν|ασ|α|η|ησ|ην|ε|αι)?$/;
  function verbalShape(k) { return VERBAL_END.test(k) || PARTICIPLE.test(k) || DEGREE.test(k); }
  const PATRONYMIC = /(ιδ|αδ|ειδ|ιαδ)(ησ|ου|ην|η|εω|αο|αι|ων|ασ)$/;

  // Stems a verb shows outside the present, for verbal adjectives and agent
  // nouns: a-privative + -tos forms such as adamastos, akeletos, adepsetos.
  const VERB = [
    [/(.+)εω$/, (b) => [b + "ε", b + "η"]], [/(.+)αω$/, (b) => [b + "α", b + "η"]], [/(.+)οω$/, (b) => [b + "ο", b + "ω"]],
    [/(.+)ιζω$/, (b) => [b + "ισ", b + "ι", b + "ιδ"]], [/(.+)αζω$/, (b) => [b + "ασ", b + "α", b + "αγ"]],
    [/(.+)σσω$/, (b) => [b + "κ", b + "χ", b + "γ", b + "σ"]], [/(.+)πτω$/, (b) => [b + "π", b + "φ", b + "β"]],
    [/(.+)αινω$/, (b) => [b + "α", b + "αν", b + "ασ"]], [/(.+)ειρω$/, (b) => [b + "ερ", b + "αρ", b + "ειρ"]],
    [/(.+)εινω$/, (b) => [b + "εν", b + "ον", b + "α", b + "ειν"]], [/(.+)ννυμι$/, (b) => [b + "ε", b + "η", b + "α", b + "σ"]],
    [/(.+)νυμι$/, (b) => [b + "", b + "υ"]], [/(.+)ιω$/, (b) => [b + "ι", b + "ισ"]], [/(.+)αιω$/, (b) => [b + "αι", b + "αυ"]],
    [/(.+)ευω$/, (b) => [b + "ευ"]], [/(.+)[θδτ]ω$/, (b) => [b + "σ"]], [/(.+)ζω$/, (b) => [b + "σ", b + "γ"]],
    [/(.+)ομαι$/, (b) => [b]], [/(.+)μι$/, (b) => [b]], [/(.+)ω$/, (b) => [b, b + "σ"]],
  ];
  function verbStems(k) {
    const out = new Set();
    for (const [re, fn] of VERB) { const m = k.match(re); if (m) fn(m[1]).forEach((x) => out.add(x)); }
    return out;
  }
  const VERBAL_NOUN = /(σ?τοσ|σ?τον|σ?τησ|σ?τωρ|σ?τηρ|σ?τειρα|σ?τρια)$/;

  /* ---- index --------------------------------------------------------- */
  const isVowel = (c) => "αεηιουω".includes(c);
  function cleanSide(s) { return s.replace(/[()\[\]†?]/g, "").trim(); }

  function buildIndex(D) {
    const C = {}; D.columns.forEach((c, i) => { C[c] = i; });
    const ix = {
      items: new Map(), byKey: new Map(), catStem: new Map(), s1: new Map(), s2: new Map(), s2Stem: new Map(),
      m1Stem: new Map(), m2Stem: new Map(), memberInfo: new Map(), lemmaByKey: new Map(), formTo: new Map(),
      stemTo: new Map(), verbStem: new Map(), include: new Map(), pairs: new Map(), members1: [], members2: [],
    };

    function addMember(map, key, m) {
      let e = map.get(key); if (!e) map.set(key, e = new Map());
      const id = m.member + "\u0000" + m.cat + "\u0000" + m.sub;
      let x = e.get(id); if (!x) e.set(id, x = { member: m.member, cat: m.cat, sub: m.sub, lemmas: new Set(), surf: new Map() });
      x.lemmas.add(m.lemma);
      if (m.surf) x.surf.set(m.surf, (x.surf.get(m.surf) || 0) + 1);
    }

    D.compounds.forEach((row) => {
      const r = {}; D.columns.forEach((c, i) => { r[c] = row[i]; });
      const key = strip(r.lemma);
      let it = ix.items.get(r.lemma);
      if (!it) {
        it = { lemma: r.lemma, key, rows: [], include: [] };
        ix.items.set(r.lemma, it);
        if (!ix.byKey.has(key)) ix.byKey.set(key, []);
        ix.byKey.get(key).push(it);
        citeStems(key).forEach((s) => {
          if (s.length < 4) return;
          if (!ix.catStem.has(s)) ix.catStem.set(s, new Set());
          ix.catStem.get(s).add(it);
        });
      }
      it.rows.push(r);
      const pk = r.member1 + "\u0000" + r.member2;
      if (!ix.pairs.has(pk)) ix.pairs.set(pk, new Set());
      ix.pairs.get(pk).add(r.lemma);

      const m1 = { member: r.member1, cat: r.member1_category, sub: r.member1_subcategory, lemma: r.lemma };
      const m2 = { member: r.member2, cat: r.member2_category, sub: r.member2_subcategory, lemma: r.lemma };
      const parts = r.segmentation.split("+");
      if (parts.length === 2) {
        const l = cleanSide(parts[0]), rr = cleanSide(parts[1]);
        const lk = strip(l), rk = strip(rr);
        if (lk && r.member1) addMember(ix.s1, lk, { ...m1, surf: l });
        if (rk && r.member2) {
          addMember(ix.s2, rk, { ...m2, surf: rr });
          citeStems(rk).forEach((s) => {
            if (s.length < 2) return;
            if (!ix.s2Stem.has(s)) ix.s2Stem.set(s, new Set());
            ix.s2Stem.get(s).add(rk);
          });
        }
      }
      [[r.member1, r.member1_category, r.member1_subcategory, ix.m1Stem], [r.member2, r.member2_category, r.member2_subcategory, ix.m2Stem]]
        .forEach(([mem, cat, sub, stemMap]) => {
          if (!mem) return;
          let info = ix.memberInfo.get(mem); if (!info) ix.memberInfo.set(mem, info = new Map());
          const id = cat + "\u0000" + sub;
          info.set(id, (info.get(id) || 0) + 1);
          citeStems(strip(mem)).forEach((s) => { if (s.length >= 2) addMember(stemMap, s, { member: mem, cat, sub, lemma: r.lemma }); });
        });
    });

    D.include.forEach(([lemma, inc]) => {
      const k = strip(inc); if (!k) return;
      const it = ix.items.get(lemma); if (!it) return;
      it.include.push(inc);
      if (!ix.include.has(k)) ix.include.set(k, new Set());
      ix.include.get(k).add(it);
    });

    D.lemmas.forEach(([lemma, pos, gender, conj, homer, n, forms]) => {
      const e = { lemma, key: strip(lemma), pos, gender, conj, homer: !!homer, n };
      if (!ix.lemmaByKey.has(e.key)) ix.lemmaByKey.set(e.key, []);
      ix.lemmaByKey.get(e.key).push(e);
      forms.split(" ").forEach((f) => {
        if (!f) return;
        if (!ix.formTo.has(f)) ix.formTo.set(f, []);
        ix.formTo.get(f).push(e);
      });
      citeStems(e.key).forEach((s) => {
        if (s.length < 2) return;
        if (!ix.stemTo.has(s)) ix.stemTo.set(s, []);
        ix.stemTo.get(s).push(e);
      });
      if (pos === "v") verbStems(e.key).forEach((s) => {
        if (s.length < 2) return;
        if (!ix.verbStem.has(s)) ix.verbStem.set(s, []);
        ix.verbStem.get(s).push(e);
      });
    });

    // Autocomplete lists: most-used members first.
    const tally = (i) => {
      const c = new Map();
      D.compounds.forEach((row) => { if (row[C[i]]) c.set(row[C[i]], (c.get(row[C[i]]) || 0) + 1); });
      return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => ({ member: m, key: strip(m), n }));
    };
    ix.members1 = tally("member1");
    ix.members2 = tally("member2");
    return ix;
  }

  /* ---- member categories --------------------------------------------- */
  const POSCAT = { n: "n", a: "a", v: "v", d: "d", r: "r", m: "m", p: "p" };
  function guessSub(lemma, cat, gender) {
    const k = strip(lemma);
    if (cat === "v") return /μι$/.test(k) ? "athematic" : "thematic";
    if (cat !== "n" && cat !== "a") return "";
    if (/ευσ$/.test(k) || /υσ$/.test(k) || /υ$/.test(k)) return "u-stem";
    if (/ον$/.test(k)) return "thematic";
    if (/οσ$/.test(k)) return gender === "n" ? "s-stem" : "thematic";
    if (/μα$/.test(k) || /ων$/.test(k) || /ην$/.test(k)) return "n-stem";
    if (/ασ$/.test(k) && cat === "a") return "n-stem";
    if (/(ρ)$/.test(k)) return "r-stem";
    if (/(ξ|ψ)$/.test(k)) return "C-stem";
    if (/λσ$/.test(k) || /λ$/.test(k)) return "l-stem";
    if (/ισ$/.test(k)) return "i-stem";
    if (/ησ$/.test(k)) return cat === "a" ? "s-stem" : "-ā/a";
    if (/[ηα]$/.test(k) || /ασ$/.test(k)) return "-ā/a";
    return "";
  }

  // Everything known about a member lemma: its category and subcategory.
  function memberProfile(ix, member) {
    const info = ix.memberInfo.get(member);
    if (info) {
      const [id] = [...info.entries()].sort((a, b) => b[1] - a[1])[0];
      const [cat, sub] = id.split("\u0000");
      return { cat, sub, from: "catalogue" };
    }
    const hit = (ix.lemmaByKey.get(strip(member)) || []).slice().sort((a, b) => b.n - a.n)[0];
    if (hit) {
      const cat = POSCAT[hit.pos] || "u";
      return { cat, sub: guessSub(hit.lemma, cat, hit.gender), from: "corpus" };
    }
    return null;
  }

  /* ---- decomposition -------------------------------------------------- */
  const liveN = (x, ex) => x.lemmas.size - (ex && x.lemmas.has(ex) ? 1 : 0);
  const score = (base, n, w) => base + w * Math.log2(1 + n);

  function leftOptions(ix, left, ex, out) {
    const push = (m, src, s, n) => out.push({ member: m.member, cat: m.cat, sub: m.sub, src, s, n, ex: m.lemmas ? [...m.lemmas].filter((l) => l !== ex).slice(0, 3) : [] });
    const exact = ix.s1.get(left);
    if (exact) exact.forEach((x) => { const n = liveN(x, ex); if (n > 0) push(x, "bank", score(6, n, 0.7), n); });
    if (out.length) return out;
    const linked = isVowel(left[left.length - 1]) ? left.slice(0, -1) : left;
    [left, linked].forEach((k, i) => {
      const hit = ix.m1Stem.get(k) ;
      if (hit && k.length >= 2) hit.forEach((x) => { const n = liveN(x, ex); if (n > 0) push(x, "stem", score(3.5 - i * 0.5, n, 0.4), n); });
    });
    if (out.length) return out;
    [left, linked].forEach((k) => {
      if (k.length < 3) return;
      (ix.stemTo.get(k) || []).forEach((e) => {
        if (ex && strip(ex) === e.key) return;
        if (!POSCAT[e.pos] || e.pos === "p") return;
        const cat = POSCAT[e.pos];
        out.push({ member: e.lemma, cat, sub: guessSub(e.lemma, cat, e.gender), src: "corpus", s: score(1.5, e.n, 0.25) });
      });
    });
    return out;
  }

  function rightOptions(ix, rightFull, rightStem, ex, out) {
    const seen = new Set();
    const push = (m, src, s, surf) => {
      const id = m.member + "\u0000" + m.cat + "\u0000" + m.sub;
      if (seen.has(id)) return; seen.add(id);
      out.push({ member: m.member, cat: m.cat, sub: m.sub, src, s, surf, ex: m.lemmas ? [...m.lemmas].filter((l) => l !== ex).slice(0, 3) : [] });
    };
    const topSurf = (x) => [...x.surf.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const exact = ix.s2.get(rightFull);
    if (exact) exact.forEach((x) => { const n = liveN(x, ex); if (n > 0) push(x, "bank", score(6.5, n, 0.7), topSurf(x)); });
    const via = ix.s2Stem.get(rightStem);
    if (via) via.forEach((rk) => {
      ix.s2.get(rk).forEach((x) => { const n = liveN(x, ex); if (n > 0) push(x, "stem", score(5, n, 0.6), topSurf(x)); });
    });
    const memb = ix.m2Stem.get(rightStem);
    if (memb) memb.forEach((x) => { const n = liveN(x, ex); if (n > 0) push(x, "member", score(3.5, n, 0.4), null); });
    if (!out.length && rightStem.length >= 3) {
      (ix.stemTo.get(rightStem) || []).forEach((e) => {
        if (ex && strip(ex) === e.key) return;
        if (!POSCAT[e.pos] || e.pos === "p") return;
        const cat = POSCAT[e.pos];
        push({ member: e.lemma, cat, sub: guessSub(e.lemma, cat, e.gender) }, "corpus", score(2, e.n, 0.25), e.pos === "v" ? null : e.lemma);
      });
    }
    if (!out.length) {
      const m = rightFull.match(VERBAL_NOUN);
      if (m) {
        const v = rightFull.slice(0, -m[0].length) + (m[0][0] === "σ" ? "σ" : "");
        [v, rightFull.slice(0, -m[0].length)].forEach((vs) => {
          if (vs.length < 2) return;
          (ix.verbStem.get(vs) || []).forEach((e) => {
            if (ex && strip(ex) === e.key) return;
            push({ member: e.lemma, cat: "v", sub: guessSub(e.lemma, "v", "") }, "verbal", score(4, e.n, 0.3), null);
          });
        });
      }
    }
    return out;
  }

  // Contraction across the seam, which the catalogue writes like X(o+o)Y.
  const CONTRACT = { "ω": [["ο", "ο"], ["ο", "ω"], ["ο", "α"]], "η": [["ε", "ε"], ["α", "ε"], ["η", "ε"], ["ο", "η"]], "ου": [["ο", "ο"], ["ο", "ε"]] };

  const NONE = { member: "", cat: "", sub: "", src: "none", s: 0 };

  /* word: accented headword or token. Returns ranked proposals. */
  function decompose(ix, word, opts) {
    opts = opts || {};
    const k = strip(word), ex = opts.exclude || null;
    const results = new Map();
    if (k.length < 4) return [];

    const consider = (i, left, rightFull, rightStem, seam) => {
      if (left.length < 1 || rightStem.length < 2) return;
      const L = leftOptions(ix, left, ex, []);
      const R = rightOptions(ix, rightFull, rightStem, ex, []);
      const keep = (a, b, s) => {
        const id = [a.member, a.cat, a.sub, b.member, b.cat, b.sub].join("\u0000");
        const prev = results.get(id);
        if (!prev || prev.score < s) results.set(id, { i, seam, left, rightFull, rightStem, m1: a, m2: b, score: s });
      };
      if (L.length && R.length) {
        L.forEach((a) => R.forEach((b) => {
          let s = a.s + b.s;
          if (left.length === 1 && !(a.cat === "d" || a.cat === "r")) s -= 4;
          if (rightStem.length <= 2) s -= 4;
          else if (rightStem.length === 3) s -= 1;
          if (a.src === "corpus" && b.src === "corpus") s += left.length >= 3 && rightStem.length >= 4 ? 1 : -2;
          if (seam) s -= 0.5;
          keep(a, b, s);
        }));
      } else if (R.length && !seam && rightStem.length >= 3 && left.length >= 2) {
        R.forEach((b) => { if (b.src !== "corpus") keep(NONE, b, b.s - 2 + Math.min(rightStem.length, 6) * 0.2); });
      } else if (L.length && !seam && rightStem.length >= 3 && L[0].src === "bank") {
        const verbal = VERBAL_NOUN.test(rightFull);
        if (left.length >= 2 || verbal) L.forEach((a) => keep(a, NONE, a.s - (verbal ? 1 : 3)));
      }
    };

    const stems = tokenStems(k);
    stems.forEach((ending, stem) => {
      for (let i = 1; i <= stem.length - 2; i++) {
        const left = stem.slice(0, i), rs = stem.slice(i);
        consider(i, left, k.slice(i), rs, null);
        const c1 = stem[i];
        if (CONTRACT[c1]) CONTRACT[c1].forEach(([x, y]) => consider(i, left + x, y + k.slice(i + 1), y + stem.slice(i + 1), c1));
      }
    });

    const out = [...results.values()].sort((a, b) => b.score - a.score).slice(0, opts.limit || 8);
    out.forEach((p) => {
      p.grade = (p.m1.src === "none" || p.m2.src === "none") ? "partial"
        : p.m1.src === "bank" && (p.m2.src === "bank" || p.m2.src === "stem") ? "strong"
        : (p.m1.src === "corpus" && p.m2.src === "corpus") ? "weak" : "likely";
    });
    return out;
  }

  // What the catalogue knows about the two sides of a typed segmentation.
  function sideOptions(ix, left, right) {
    const lk = strip(left), rk = strip(right);
    const rs = tokenStems(rk);
    let R = [];
    rs.forEach((e, stem) => { if (!R.length) R = rightOptions(ix, rk, stem, null, []); });
    return { L: lk ? leftOptions(ix, lk, null, []).sort((a, b) => b.s - a.s) : [], R: R.sort((a, b) => b.s - a.s) };
  }

  /* ---- accents -------------------------------------------------------- */
  // Cut an accented word after its nth Greek letter, keeping the marks.
  function cutAt(word, n) {
    const d = word.normalize("NFD");
    let seen = 0, j = 0;
    for (; j < d.length; j++) {
      const ch = d[j];
      if (/[α-ωςΑ-Ω]/.test(ch)) {
        if (seen === n) break;
        seen++;
      }
    }
    return [d.slice(0, j).normalize("NFC"), d.slice(j).normalize("NFC")];
  }
  // One accent per word, acute not grave: a second accent from a following
  // enclitic and a grave from running text are both artefacts of position.
  function citeAccent(w) {
    const d = w.normalize("NFD");
    const idx = [];
    for (let i = 0; i < d.length; i++) if (/[\u0300\u0301\u0342]/.test(d[i])) idx.push(i);
    let chars = [...d];
    if (idx.length > 1) idx.slice(1).reverse().forEach((i) => chars.splice(i, 1));
    return chars.join("").replace(/\u0300/g, "\u0301").normalize("NFC");
  }
  const lowerBare = (s) => s.normalize("NFD").replace(/[\u0313\u0314]/g, "").toLowerCase().normalize("NFC");
  const dropAccent = (s) => s.normalize("NFD").replace(/[̀́͂]/g, "").normalize("NFC");
  const hasAccent = (s) => /[̀́͂]/.test(s.normalize("NFD"));
  function accentLastVowel(s) {
    const d = s.normalize("NFD");
    const chars = [...d];
    let idx = -1;
    for (let i = chars.length - 1; i >= 0; i--) {
      if (/[αεηιουω]/i.test(chars[i])) { idx = i; break; }
    }
    if (idx < 0) return s;
    // A diphthong takes the accent on its second vowel, which is where we
    // already are when we walk back from the end of the word.
    let j = idx + 1;
    while (j < chars.length && /[̓̔̈]/.test(chars[j])) j++;
    chars.splice(j, 0, "́");
    return chars.join("").normalize("NFC");
  }
  function segmentation(word, i) {
    const [a, b] = cutAt(word, i);
    return a + "+" + b;
  }

  // The headword an inflected token probably belongs to: the token's first
  // part, joined to the citation ending of a second member seen elsewhere.
  function headwordFor(token, p) {
    const k = strip(token);
    token = citeAccent(token);
    if (!p.m2.surf) return null;
    let surf = lowerBare(p.m2.surf);
    if (strip(surf) === k.slice(p.i)) return token;
    if (p.seam) {
      if (strip(surf) === p.rightFull) return token;
      const [head] = cutAt(token, p.i + p.seam.length);
      const tailOfSurf = cutAt(surf, 1)[1];
      return (head + tailOfSurf).normalize("NFC");
    }
    // An o-stem ending on the token rules out a surface in -?, -?, -??.
    const tail = k.slice(p.i + p.rightStem.length);
    const sk = strip(surf);
    if (/^(ου|οιο|οισ|οισι|οισιν|ουσ|οι|ον|οσ)$/.test(tail) && !/(οσ|ον)$/.test(sk)) {
      const [, right] = cutAt(token, p.i);
      const bareRight = cutAt(right, p.rightStem.length)[0];
      surf = bareRight + "\u03bf\u03c2";
    }
    const [left] = cutAt(token, p.i);
    const bare = dropAccent(left);
    if (hasAccent(surf)) return (bare + surf).normalize("NFC");
    return (accentLastVowel(bare) + surf).normalize("NFC");
  }

  /* Is this proposal good enough to flag a word in running text? The bar is
   * higher than for showing it to someone who already clicked the word. */
  const PRIV = "\u1f00/\u1f00\u03bd";
  const stray = (m) => m.cat === "u" || (m.member.endsWith("-") && strip(m.member).length <= 2);
  function flags(p, k) {
    const rs = p.rightStem.length, rf = p.rightFull.length, ls = p.left.length;
    if (p.grade === "weak") return false;
    if (p.grade === "partial") {
      if (p.m1.src === "none") {
        if (stray(p.m2)) return false;
        return (p.m2.src === "bank" && rf >= 5) || (p.m2.src === "stem" && rs >= 4 && ls >= 3);
      }
      if (p.m1.cat === "r" || stray(p.m1)) return false;
      if (p.m1.member === PRIV) return VERBAL_NOUN.test(p.rightFull) && rf >= 6;
      return (p.m1.n || 0) >= 8 && (ls >= 3 || p.left === "\u03b5\u03c5");
    }
    if (stray(p.m1) || stray(p.m2)) return false;
    if (ls === 1 && p.m1.member !== PRIV) return false;
    if (p.m1.member === PRIV && !(p.m2.src === "bank" || rf >= 6)) return false;
    // A preposition on an unseen verb form is a prefixed verb.
    if (p.m1.cat === "r" && p.m2.cat === "v" && p.m2.src !== "bank" && /(ε|εν|ων|εαι|ει|ησ|ην|ασ|αν)$/.test(k)) return false;
    if (p.m2.src === "member") return rs >= 4 && p.m1.src !== "corpus";
    if (p.m2.src === "corpus") return rs >= 4 && p.m1.src === "bank";
    if (p.m1.src === "corpus") return ls >= 4 && (p.m2.src === "bank" || (p.m2.src === "stem" && rs >= 4));
    if (p.m2.src === "verbal") return p.m1.src === "bank" && (rs >= 4 || p.m1.cat === "d");
    return rs >= 3 || (rs === 2 && rf >= 4 && p.m1.src === "bank" && p.m2.src === "bank");
  }
  // Best proposal that clears the bar, or null. opts.exclude as in decompose.
  function flagged(ix, form, opts) {
    const k = strip(form);
    if (verbalShape(k)) return null;
    if (/^[\u0391-\u03a9\u1f08-\u1f0f\u1f18-\u1f1f\u1f28-\u1f2f\u1f38-\u1f3f\u1f48-\u1f4f\u1f59-\u1f5f\u1f68-\u1f6f]/.test(form.normalize("NFC")) && PATRONYMIC.test(k)) return null;
    const props = decompose(ix, form, opts);
    const best = props.find((p) => flags(p, k));
    if (!best) return null;
    return { best, props: [best, ...props.filter((p) => p !== best)] };
  }

  /* ---- catalogue match for a token ------------------------------------ */
  function catalogueHit(ix, k) {
    const direct = ix.byKey.get(k);
    if (direct) return { items: direct, via: "headword" };
    const inc = ix.include.get(k);
    if (inc) return { items: [...inc], via: "derivative" };
    const seen = new Set();
    tokenStems(k).forEach((e, s) => {
      if (s.length < 4) return;
      (ix.catStem.get(s) || []).forEach((it) => seen.add(it));
    });
    if (seen.size) return { items: [...seen], via: "stem" };
    return null;
  }

  // The catalogue's citation form and the corpus lemma sometimes differ by an
  // ending only. Long stems only: a short one is a coincidence, like a noun
  // that happens to look like the oblique stem of a name.
  function lemmaVariant(ix, key) {
    const seen = new Set();
    tokenStems(key).forEach((e, s) => {
      if (s.length < 5 || !e) return;
      (ix.catStem.get(s) || []).forEach((it) => seen.add(it));
    });
    return seen.size ? [...seen] : null;
  }

  /* Decide what a token is. kinds:
   *   known     in the catalogue (attestation only)
   *   check     in the catalogue, but this spelling also belongs to another word
   *   new       probably a compound the catalogue lacks; carries proposals
   *   plain     nothing to encode                                           */
  const isCap = (w) => { const c = String(w).normalize("NFC")[0] || ""; return c !== c.toLowerCase(); };
  // A capitalized word matched to a lowercase headword is often a name that
  // only looks like the adjective, so it goes to a person, not to bulk logging.
  function classify(ix, form, extra) {
    const c = classifyWord(ix, form, extra);
    if (c.kind === "known" && c.items && isCap(form) && c.items.every((it) => !isCap(it.lemma))) {
      c.kind = "check"; c.capital = true;
    } else if (c.kind === "known" && c.items && c.via === "stem" && isCap(form)) {
      c.kind = "check"; c.nameStem = true;
    }
    return c;
  }
  function classifyWord(ix, form, extra) {
    const k = strip(form);
    if (k.length < 3) return { kind: "plain", k };
    if (extra) {
      const hit = extra.byKey.get(k) || [...tokenStems(k).keys()].filter((s) => s.length >= 4).map((s) => extra.byStem.get(s)).find(Boolean);
      if (hit) return { kind: "known", k, local: hit };
    }

    const lemmas = ix.formTo.get(k);
    if (lemmas) {
      const compounds = [], others = [];
      lemmas.forEach((e) => {
        const direct = ix.byKey.get(e.key);
        const hit = direct || (ix.include.has(e.key) ? [...ix.include.get(e.key)] : null);
        if (hit) hit.forEach((it) => compounds.push({ it, e, deriv: !direct })); else others.push(e);
      });
      if (compounds.length) {
        const items = [...new Set(compounds.map((c) => c.it))];
        const n1 = compounds.reduce((t, c) => t + c.e.n, 0), n2 = others.reduce((t, e) => t + e.n, 0);
        // A form that mostly belongs to another lemma is that lemma.
        if (others.length && n1 * 5 < n2) return { kind: "plain", k, lemma: others.slice().sort((a, b) => b.n - a.n)[0] };
        const via = compounds.every((c) => c.deriv) ? "derivative" : "headword";
        return { kind: others.length || items.length > 1 ? "check" : "known", k, items, also: others, via };
      }
      const top = lemmas.slice().sort((a, b) => b.n - a.n)[0];
      const viaStem = lemmaVariant(ix, top.key);
      if (viaStem) return { kind: viaStem.length > 1 ? "check" : "known", k, items: viaStem, via: "stem" };
      if (top.pos !== "n" && top.pos !== "a" && top.pos !== "-") return { kind: "plain", k, lemma: top };
      if (lemmas.some((e) => e.homer)) {
        const f = flagged(ix, top.lemma);
        if (f && f.best.grade === "strong" && f.best.left.length >= 3 && f.best.rightStem.length >= 3) {
          return { kind: "new", k, headword: top.lemma, sure: true, props: f.props, lemma: top, inHomer: true };
        }
        return { kind: "plain", k, lemma: top };
      }
      const f = flagged(ix, top.lemma);
      if (f) return { kind: "new", k, headword: top.lemma, sure: true, props: f.props, lemma: top };
      return { kind: "plain", k, lemma: top };
    }

    const hit = catalogueHit(ix, k);
    if (hit) return { kind: hit.items.length > 1 ? "check" : "known", k, items: hit.items, via: hit.via };
    for (const [s] of tokenStems(k)) {
      if (s.length < 4) continue;
      const others = ix.stemTo.get(s);
      if (others && others.some((e) => e.homer || e.pos === "v")) return { kind: "plain", k, lemma: others[0] };
    }
    const f = flagged(ix, form);
    if (f) return { kind: "new", k, headword: headwordFor(form, f.best) || form, sure: false, props: f.props };
    return { kind: "plain", k };
  }

  /* ---- tokens --------------------------------------------------------- */
  const WORD = /[Ͱ-Ͽἀ-῿̀-ͯ]+/g;
  function tokenize(line) {
    const out = []; let m; WORD.lastIndex = 0;
    while ((m = WORD.exec(line))) out.push({ form: m[0], start: m.index, end: m.index + m[0].length });
    return out;
  }

  function seamSegmentation(word, p) {
    const [pre, rest] = cutAt(word, p.i);
    const [, post] = cutAt(rest, p.seam.length);
    const x = p.left[p.left.length - 1], y = strip(p.rightFull)[0];
    const accented = (x + "\u0301").normalize("NFC");
    return pre + "(" + accented + "+" + y + ")" + post;
  }
  // Compounds worth linking to from this analysis: a member that is itself a
  // headword, and other headwords built from the same two members.
  function linkSuggestions(ix, row, self) {
    const out = new Set();
    [row.member1, row.member2].forEach((m) => { if (m && ix.items.has(m) && m !== self) out.add(m); });
    (ix.pairs.get(row.member1 + "\u0000" + row.member2) || []).forEach((l) => { if (l !== self) out.add(l); });
    return [...out];
  }
  function memberIsCompound(ix, row) { return ix.items.has(row.member1) || ix.items.has(row.member2); }

  // Member lookup for the combo boxes: prefix matches first, catalogue
  // members before corpus lemmas, most-used first.
  function searchMembers(ix, q, slot, limit) {
    const k = strip(q);
    if (!k) return (slot === 1 ? ix.members1 : ix.members2).slice(0, limit).map((m) => ({ member: m.member, n: m.n, from: "catalogue" }));
    const out = [], seen = new Set();
    const add = (m, n, from) => { if (!seen.has(m)) { seen.add(m); out.push({ member: m, n, from }); } };
    const pri = slot === 1 ? ix.members1 : ix.members2, sec = slot === 1 ? ix.members2 : ix.members1;
    pri.forEach((m) => { if (m.key.startsWith(k)) add(m.member, m.n, "catalogue"); });
    sec.forEach((m) => { if (m.key.startsWith(k)) add(m.member, m.n, "catalogue"); });
    if (out.length < limit) {
      const hits = [];
      ix.lemmaByKey.forEach((arr, key) => { if (key.startsWith(k)) arr.forEach((e) => hits.push(e)); });
      hits.sort((a, b) => b.n - a.n).forEach((e) => add(e.lemma, e.n, "corpus"));
    }
    return out.slice(0, limit);
  }
  function searchCompounds(ix, q, limit) {
    const k = strip(q);
    if (!k) return [];
    const out = [];
    ix.items.forEach((it) => { if (it.key.startsWith(k)) out.push(it); });
    return out.sort((a, b) => a.key.length - b.key.length).slice(0, limit);
  }

  function proposalRow(word, p) {
    const seg = p.seam ? seamSegmentation(word, p) : segmentation(word, p.i);
    return { segmentation: seg, member1: p.m1.member, member1_category: p.m1.cat, member1_subcategory: p.m1.sub,
      member2: p.m2.member, member2_category: p.m2.cat, member2_subcategory: p.m2.sub };
  }

  const api = { strip, hasGreek, citeAccent, sideOptions, linkSuggestions, memberIsCompound, searchMembers, searchCompounds, buildIndex, decompose, flagged, flags, classify, tokenize, segmentation, headwordFor, proposalRow,
    memberProfile, guessSub, catalogueHit, citeStems, tokenStems, cutAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CompoundEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
