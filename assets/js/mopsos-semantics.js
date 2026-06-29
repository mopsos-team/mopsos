/* ============================================================================
 * mopsos-semantics.js — optional, self-contained semantic layer.
 *
 * Learns a small distributional model of the corpus (which lemmata are used in
 * similar contexts) so the co-occurrence network can be searched by meaning:
 * type "blue" and the words the poems associate with blue surface.
 *
 * It is deliberately isolated: it reads the corpus only through the existing
 * window.MopsosSQL query API (the same SELECTs every tab already runs) and
 * never touches how the database is built, stored, loaded, or sandboxed. If it
 * fails to build, the rest of the site is unaffected — the caller just falls
 * back to the frequency-based network.
 *
 * Model: presence-based co-occurrence of content lemmata (noun/verb/adjective)
 * within a sentence, weighted by Positive Pointwise Mutual Information, compared
 * by cosine similarity. No external data or network calls.
 * ========================================================================== */
(function () {
  "use strict";

  const CONTENT_POS = ["n", "v", "a"];
  const VOCAB_SIZE = 1600;     // most frequent content lemmata kept in the model
  const MIN_FREQ = 4;          // ignore lemmata rarer than this

  // Ultra-frequent, semantically light lemmata that co-occur with everything and
  // would otherwise swamp every neighbour list. Dropped from the model entirely.
  const STOP = new Set([
    "εἰμί", "ἔχω", "γίγνομαι", "ἔρχομαι", "βαίνω", "ἵημι", "τίθημι", "δίδωμι", "φημί", "εἶμι",
    "αὐτός", "πᾶς", "πολύς", "ἄλλος", "μέγας", "οὗτος", "ὅδε", "ἐκεῖνος", "ὅς", "ἑός",
    "τις", "ἕκαστος", "ἄμφω", "οἷος", "τοῖος", "τόσος", "ὅσος", "ἄν", "πρότερος", "ὕστερος"
  ]);

  let built = false;
  let building = false;
  let vocab = [];              // [lemma]
  let idx = {};                // lemma -> column index
  let vectors = [];            // vectors[i] = Map(j -> ppmi weight)
  let norms = [];              // L2 norm of each vector
  let normIndex = {};          // diacritic-stripped lemma -> canonical lemma

  // English -> Greek bridge, built offline from the LSJ (Liddell-Scott-Jones)
  // short definitions and restricted to corpus lemmata. Lets the user type any
  // English word. Public-domain 1940 LSJ base; structured data CC BY 4.0.
  const BRIDGE_URL = "assets/data/lexicon_en2grc.json";
  let bridge = null;
  let bridgePromise = null;

  function loadBridge() {
    if (bridge) return Promise.resolve(bridge);
    if (bridgePromise) return bridgePromise;
    bridgePromise = fetch(BRIDGE_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { bridge = j || {}; return bridge; })
      .catch(function () { bridge = {}; return bridge; });
    return bridgePromise;
  }

  function stripDia(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  /* A small curated English concept -> Homeric lemma supplement, merged with the
   * dictionary bridge so hand-tuned poetic choices are always available. */
  const SEED = {
    blue: ["κυάνεος", "γλαυκός"], dark: ["κελαινός", "μέλας", "κυάνεος"], black: ["μέλας", "κελαινός"],
    white: ["λευκός", "ἀργός"], red: ["ἐρυθρός", "φοῖνιξ"], purple: ["πορφύρεος"], green: ["χλωρός"],
    yellow: ["ξανθός"], golden: ["χρύσεος"], bright: ["φαεινός", "λαμπρός", "χρύσεος"], pale: ["χλωρός"],
    sea: ["θάλασσα", "πόντος", "ἅλς"], water: ["ὕδωρ"], wave: ["κῦμα"], ship: ["νηῦς", "ναῦς"],
    river: ["ποταμός"], sky: ["οὐρανός"], heaven: ["οὐρανός"], earth: ["γαῖα", "χθών", "αἶα"],
    land: ["γαῖα"], island: ["νῆσος"], wind: ["ἄνεμος"], cloud: ["νέφος", "νεφέλη"], fire: ["πῦρ"],
    sun: ["ἠέλιος"], moon: ["σελήνη"], star: ["ἀστήρ"], light: ["φάος"], dawn: ["ἠώς"],
    night: ["νύξ"], day: ["ἦμαρ"], mountain: ["ὄρος"], rock: ["πέτρη", "λᾶας"], stone: ["λίθος", "λᾶας"],
    cave: ["σπέος", "ἄντρον"], tree: ["δένδρεον", "δρῦς"], forest: ["ὕλη"], flower: ["ἄνθος"],
    war: ["πόλεμος"], battle: ["μάχη", "ὑσμίνη"], fight: ["μάχομαι"], spear: ["ἔγχος", "δόρυ"],
    sword: ["ξίφος", "φάσγανον", "ἄορ"], shield: ["ἀσπίς", "σάκος"], helmet: ["κόρυς", "κυνέη"],
    bow: ["τόξον", "βιός"], arrow: ["ἰός", "ὀϊστός"], armor: ["τεύχεα"], army: ["στρατός", "λαός"],
    enemy: ["δήϊος", "δυσμενής"], kill: ["κτείνω"], death: ["θάνατος"], die: ["θνῄσκω"], blood: ["αἷμα"],
    wound: ["ἕλκος"], victory: ["νίκη"], glory: ["κλέος", "κῦδος"],
    god: ["θεός"], goddess: ["θεά"], divine: ["δῖος", "θεῖος"], immortal: ["ἀθάνατος", "ἄμβροτος"],
    fate: ["μοῖρα", "αἶσα", "πότμος"], prayer: ["εὐχή", "ἀρή"], sacrifice: ["ἑκατόμβη", "ἱερόν"],
    altar: ["βωμός"], temple: ["νηός"], omen: ["οἰωνός", "τέρας"], prophet: ["μάντις"],
    man: ["ἀνήρ", "βροτός", "φώς"], woman: ["γυνή"], people: ["λαός"], father: ["πατήρ"],
    mother: ["μήτηρ"], son: ["υἱός", "παῖς"], daughter: ["θυγάτηρ"], child: ["τέκνον", "παῖς"],
    brother: ["κασίγνητος", "ἀδελφεός"], wife: ["ἄλοχος", "δάμαρ"], husband: ["πόσις", "ἀνήρ"],
    king: ["βασιλεύς", "ἄναξ"], lord: ["ἄναξ"], friend: ["ἑταῖρος", "φίλος"], companion: ["ἑταῖρος"],
    guest: ["ξεῖνος"], stranger: ["ξεῖνος"], elder: ["γέρων"], old: ["γέρων", "παλαιός"],
    young: ["νέος"], hero: ["ἥρως"], name: ["ὄνομα"],
    body: ["σῶμα", "δέμας"], heart: ["κῆρ", "κραδίη", "θυμός", "ἦτορ"], mind: ["νόος", "φρήν", "μῆτις"],
    soul: ["ψυχή"], hand: ["χείρ"], foot: ["πούς"], knee: ["γόνυ"], head: ["κεφαλή", "κάρη"],
    eye: ["ὀφθαλμός", "ὄσσε"], ear: ["οὖς"], mouth: ["στόμα"], tongue: ["γλῶσσα"], hair: ["κόμη", "χαίτη"],
    bone: ["ὀστέον"], voice: ["φωνή", "ὄψ", "αὐδή"],
    horse: ["ἵππος"], ox: ["βοῦς"], cattle: ["βοῦς"], sheep: ["ὄϊς", "μῆλον"], goat: ["αἴξ"],
    pig: ["σῦς"], dog: ["κύων"], lion: ["λέων"], wolf: ["λύκος"], boar: ["κάπρος", "σῦς"],
    bird: ["ὄρνις", "οἰωνός"], eagle: ["αἰετός"], fish: ["ἰχθύς"], snake: ["ὄφις", "δράκων"],
    love: ["φιλότης", "ἔρος"], desire: ["ἵμερος", "πόθος"], anger: ["μῆνις", "χόλος", "κότος"],
    rage: ["μένος", "λύσσα"], fear: ["φόβος", "δέος", "δεῖμα"], courage: ["θάρσος", "μένος"],
    grief: ["ἄχος", "πένθος", "ἄλγος"], pain: ["ἄλγος", "ὀδύνη", "πῆμα"], joy: ["χάρμα", "χαρά"],
    hope: ["ἐλπίς", "ἐλπωρή"], shame: ["αἰδώς"], honor: ["τιμή", "γέρας"],
    strength: ["βίη", "σθένος", "κράτος", "ἴς"], power: ["κράτος"], might: ["μένος", "βίη"],
    beauty: ["κάλλος"], wisdom: ["μῆτις"], word: ["ἔπος", "μῦθος", "λόγος"], speech: ["μῦθος", "ἀγορή"],
    counsel: ["βουλή", "μῆτις"],
    house: ["οἶκος", "δόμος", "δῶμα", "μέγαρον"], home: ["οἶκος", "νόστος"], hall: ["μέγαρον"],
    city: ["πόλις", "ἄστυ"], gate: ["πύλη"], wall: ["τεῖχος"], road: ["ὁδός", "κέλευθος"],
    gift: ["δῶρον"], gold: ["χρυσός"], silver: ["ἄργυρος"], bronze: ["χαλκός"], iron: ["σίδηρος"],
    wine: ["οἶνος"], food: ["σῖτος", "ἐδωδή"], meat: ["κρέας"], cup: ["δέπας", "κύπελλον"],
    bed: ["λέχος", "εὐνή"], chariot: ["ἅρμα", "δίφρος"], clothes: ["εἵματα", "φᾶρος"],
    year: ["ἔτος", "ἐνιαυτός"], time: ["χρόνος"]
  };

  function buildVectors() {
    if (built || building) return;
    building = true;
    const SQL = window.MopsosSQL;
    const posIn = "('" + CONTENT_POS.join("','") + "')";

    // 1. vocabulary: most frequent content lemmata
    const vrows = SQL.objects(
      "SELECT lemma AS l, COUNT(*) AS c FROM " + SQL.quoteId(SQL.table) +
      " WHERE lemma IS NOT NULL AND lemma NOT IN ('','-') AND pos IN " + posIn +
      " GROUP BY lemma HAVING c >= " + MIN_FREQ + " ORDER BY c DESC LIMIT " + VOCAB_SIZE + ";");
    vocab = vrows.map((r) => r.l).filter((l) => !STOP.has(l));
    idx = {}; vocab.forEach((l, i) => { idx[l] = i; });
    normIndex = {};
    vocab.forEach((l) => { const n = stripDia(l); if (!(n in normIndex)) normIndex[n] = l; });

    // 2. presence-based co-occurrence within sentences
    const toks = SQL.objects(
      "SELECT sentence_id AS s, lemma AS l FROM " + SQL.quoteId(SQL.table) +
      " WHERE pos IN " + posIn + " AND lemma NOT IN ('','-') ORDER BY sentence_id;");
    const co = vocab.map(() => new Map());
    const uni = new Float64Array(vocab.length);
    let total = 0, p = 0;
    while (p < toks.length) {
      const sid = toks[p].s; const present = [];
      while (p < toks.length && toks[p].s === sid) {
        const i = idx[toks[p].l];
        if (i != null && present.indexOf(i) < 0) present.push(i);
        p++;
      }
      for (let a = 0; a < present.length; a++) {
        uni[present[a]] += 1; total += 1;
        for (let b = a + 1; b < present.length; b++) {
          const i = present[a], j = present[b];
          co[i].set(j, (co[i].get(j) || 0) + 1);
          co[j].set(i, (co[j].get(i) || 0) + 1);
        }
      }
    }

    // 3. PPMI weighting + vector norms
    vectors = vocab.map(() => new Map());
    norms = new Float64Array(vocab.length);
    for (let i = 0; i < vocab.length; i++) {
      const vi = vectors[i]; let nn = 0;
      co[i].forEach((cij, j) => {
        const pmi = Math.log((cij * total) / (uni[i] * uni[j]));
        if (pmi > 0) { vi.set(j, pmi); nn += pmi * pmi; }
      });
      norms[i] = Math.sqrt(nn);
    }
    built = true; building = false;
  }

  function dot(a, b) {
    let s = 0, small = a, big = b;
    if (a.size > b.size) { small = b; big = a; }
    small.forEach((v, k) => { const w = big.get(k); if (w) s += v * w; });
    return s;
  }
  function cosine(i, j) {
    const n = norms[i] * norms[j];
    return n ? dot(vectors[i], vectors[j]) / n : 0;
  }

  function neighbors(lemma, k) {
    const i = idx[lemma];
    if (i == null || !norms[i]) return [];
    const out = [];
    for (let j = 0; j < vocab.length; j++) {
      if (j === i || !norms[j]) continue;
      const s = cosine(i, j);
      if (s > 0) out.push([j, s]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out.slice(0, k || 12).map((e) => ({ lemma: vocab[e[0]], score: e[1] }));
  }

  function sameCaseClass(a, b) {
    const ua = a[0] !== a[0].toLowerCase();
    const ub = b[0] !== b[0].toLowerCase();
    return ua === ub;
  }
  // Resolve one candidate lemma: exact first, else a diacritic-insensitive match
  // that keeps the same case class (so lowercase "blue"/γλαυκός never resolves to
  // the capitalised hero Γλαῦκος).
  function resolveLemma(l) {
    if (idx[l] != null) return l;
    const cand = normIndex[stripDia(l)];
    return (cand && sameCaseClass(l, cand)) ? cand : null;
  }

  /* Resolve a query (any English word via the LSJ bridge, a curated concept, a
   * Greek lemma, or a prefix) to seed lemmata. */
  function resolve(query) {
    const raw = String(query || "").trim();
    if (!raw) return { seeds: [], source: "none" };
    const lc = raw.toLowerCase();
    const seeds = [];
    const push = (l) => { if (l && seeds.indexOf(l) < 0) seeds.push(l); };

    // 1. dictionary bridge — any English word (try the whole phrase, then its first word)
    if (bridge) {
      let hit = bridge[lc];
      if (!hit) { const fw = lc.split(/[^a-z]+/).filter(Boolean)[0]; if (fw) hit = bridge[fw]; }
      if (hit) hit.forEach((pair) => push(pair[0]));
    }
    // 2. curated Homeric supplement
    if (SEED[lc]) SEED[lc].forEach((l) => push(resolveLemma(l)));
    if (seeds.length) return { seeds: seeds.slice(0, 12), source: "english" };

    // 3. a Greek lemma typed directly, else a prefix match
    const direct = resolveLemma(raw);
    if (direct) return { seeds: [direct], source: "greek" };
    const n = stripDia(raw);
    const fuzzy = vocab.filter((l) => stripDia(l).indexOf(n) === 0).slice(0, 3);
    if (fuzzy.length) return { seeds: fuzzy, source: "fuzzy" };
    return { seeds: [], source: "none" };
  }

  /* Seeds plus their nearest semantic neighbours, ranked, capped at k. */
  function expand(seeds, k) {
    const acc = new Map();
    (seeds || []).forEach((s) => {
      acc.set(s, Math.max(acc.get(s) || 0, 1));
      neighbors(s, k).forEach((nb) => { acc.set(nb.lemma, Math.max(acc.get(nb.lemma) || 0, nb.score)); });
    });
    return Array.from(acc.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, k || 24)
      .map((e) => ({ lemma: e[0], score: e[1] }));
  }

  /* Public async build: load the English bridge, then compute the vectors.
   * A 0ms yield lets the caller paint a "learning…" message before the
   * (synchronous) vector build briefly occupies the main thread. */
  function build() {
    if (built) return Promise.resolve();
    return loadBridge().then(function () {
      return new Promise(function (resolve) {
        setTimeout(function () { try { buildVectors(); } catch (e) { /* leave unbuilt */ } resolve(); }, 0);
      });
    });
  }

  window.MopsosSemantics = {
    build: build,
    loadBridge: loadBridge,
    isBuilt: function () { return built; },
    resolve: resolve,
    neighbors: neighbors,
    expand: expand,
    conceptList: function () { return Object.keys(SEED).sort(); }
  };
})();
