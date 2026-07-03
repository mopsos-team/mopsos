/* ============================================================================
 * mopsos-semantics.js — the English-to-Greek bridge.
 *
 * Maps an English query to Greek corpus lemmata, so any word box on the site
 * can also be searched in English. Two transparent sources, no learned model:
 *   1. assets/data/lexicon_en2grc.json, built offline from the LSJ
 *      (Liddell-Scott-Jones) short definitions and restricted to corpus
 *      lemmata (public-domain 1940 LSJ base; structured data CC BY 4.0);
 *   2. the curated Homeric concept list below (SEED), for poetic vocabulary
 *      the dictionary maps less directly.
 * Greek input (with or without accents) and Beta Code are handled by the
 * caller's adaptive search (MopsosUI.greekCombo / MopsosText); resolve() here
 * simply reports Greek input back as its own seed. Anything distributional
 * (which words actually co-occur with the seeds) is computed live with SQL by
 * the pages themselves, from real sentence co-occurrence counts.
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

  function stripLemmaKey(l) { return stripDia(l); }

  /* Resolve a query to Greek seed lemmata.
   * English -> bridge + curated concepts; Greek (any accents) -> itself. */
  function resolve(query) {
    const raw = String(query || "").trim();
    if (!raw) return { seeds: [], source: "none" };
    const hasGreek = /[\u0370-\u03ff\u1f00-\u1fff]/.test(raw);
    if (hasGreek) return { seeds: [raw], source: "greek" };
    const lc = raw.toLowerCase();
    const seeds = [];
    const push = (l) => { if (l && seeds.indexOf(l) < 0) seeds.push(l); };
    if (bridge) {
      let hit = bridge[lc];
      if (!hit) { const fw = lc.split(/[^a-z]+/).filter(Boolean)[0]; if (fw) hit = bridge[fw]; }
      if (hit) hit.forEach((pair) => push(pair[0]));
    }
    if (SEED[lc]) SEED[lc].forEach(push);
    return { seeds: seeds.slice(0, 12), source: seeds.length ? "english" : "none" };
  }

  window.MopsosSemantics = {
    loadBridge: loadBridge,
    isReady: function () { return bridge != null; },
    resolve: resolve,
    conceptList: function () { return Object.keys(SEED).sort(); }
  };
})();
