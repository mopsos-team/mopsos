/* ============================================================================
 *  MOPSOS NL2SQL — modular "ask in plain English" front-end for any read-only
 *  SQL box on the site.
 *
 *  WHAT THIS IS: a small, schema-aware, rule-based (keyword/pattern) English
 *  -> SQL translator, plus a DOM auto-wiring layer. It is NOT a general LLM.
 *  There is no server component on this static Jekyll site to safely hold an
 *  API key, so calling a real LLM from the browser isn't done here by
 *  default. The translator is pluggable (see setBackend below) specifically
 *  so a smarter backend can be dropped in later without touching any page.
 *
 *  It knows the schema by reading it, not by having it hard-coded twice:
 *  part-of-speech / case / number / gender / tense / mood / voice / person /
 *  degree words are all resolved against window.MopsosUI.LABELS (the same
 *  dictionary every results table already renders with), so if that
 *  dictionary changes, the translator's vocabulary changes with it for free.
 *  The one thing LABELS doesn't cover -- which columns exist on which table,
 *  and how "Iliad" maps to the work codes actually stored (IL-01..IL-24) --
 *  is declared just below in SCHEMA.
 *
 *  HOW TO ADD IT TO A NEW SQL BOX (zero JS required):
 *    1. Make sure this script is loaded after mopsos-shared.js.
 *    2. Add  data-nl2sql  to the <textarea> that holds the SQL.
 *    3. Optionally add  data-nl2sql-run="someButtonId"  to also click that
 *       button automatically once a translation lands in the textarea (the
 *       textarea's own "input" event still fires either way, so anything a
 *       page already does on manual edits -- e.g. taking over from a
 *       dropdown-built query -- still happens normally).
 *  That's the entire integration surface. This file never reaches into a
 *  page's own run/query functions by name.
 * ========================================================================== */
(function () {
  "use strict";

  /* ----------------------------------------------------------------------
   * SCHEMA — the facts LABELS can't tell us: table/column shape, and the
   * corpus-specific "work name -> code prefix" mapping (IL-01..IL-24 etc.,
   * confirmed against assets/data/default.csv). Extend this object, not the
   * parsing logic below, when the corpus grows (new works, new tables).
   * ------------------------------------------------------------------- */
  var SCHEMA = {
    table: "morphology",
    // feature columns resolved against MopsosUI.LABELS[field]
    featureFields: ["pos", "case", "number", "gender", "tense", "mood", "voice", "person", "degree"],
    textFields: ["lemma", "form"],               // free-text / Greek-word targets
    searchKeyOf: { lemma: "lemma_search", form: null },  // accent-insensitive companion column, where one exists
    // work name (lowercased) -> SQL prefix used with `work LIKE 'PREFIX%'`
    works: {
      "iliad": "IL-", "the iliad": "IL-",
      "odyssey": "OD-", "the odyssey": "OD-",
      "theogony": "TH-",
      "works and days": "WD-", "works & days": "WD-"
    }
  };

  function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
  function quoteId(name) {
    if (window.MopsosSQL && window.MopsosSQL.quoteId) return window.MopsosSQL.quoteId(name);
    return '"' + String(name).replace(/"/g, '""') + '"';
  }

  /* ----------------------------------------------------------------------
   * Build an English-word -> {field, code} lookup from MopsosUI.LABELS, plus
   * a short list of synonyms LABELS doesn't spell out (e.g. "1st person").
   * Rebuilt lazily so it always reflects the live LABELS dictionary.
   * ------------------------------------------------------------------- */
  function buildFeatureVocab() {
    var vocab = {};   // english phrase -> [{field, code}, ...] (longest phrases win at match time)
    var UI = window.MopsosUI;
    if (UI && UI.LABELS) {
      SCHEMA.featureFields.forEach(function (field) {
        var dict = UI.LABELS[field];
        if (!dict) return;
        for (var code in dict) {
          var phrase = String(dict[code]).toLowerCase();
          (vocab[phrase] = vocab[phrase] || []).push({ field: field, code: code });
        }
      });
    }
    // synonyms / shorter forms LABELS doesn't already provide as a value
    var extra = {
      "numeral": [{ field: "pos", code: "m" }], "numerals": [{ field: "pos", code: "m" }],
      "particles": [{ field: "pos", code: "g" }],
      "adjectives": [{ field: "pos", code: "a" }], "nouns": [{ field: "pos", code: "n" }],
      "verbs": [{ field: "pos", code: "v" }], "pronouns": [{ field: "pos", code: "p" }],
      "adverbs": [{ field: "pos", code: "d" }], "prepositions": [{ field: "pos", code: "r" }],
      "conjunctions": [{ field: "pos", code: "c" }], "articles": [{ field: "pos", code: "l" }],
      "mediopassive": [{ field: "voice", code: "e" }], "middle-passive": [{ field: "voice", code: "e" }],
      "1st person": [{ field: "person", code: "1" }], "first person": [{ field: "person", code: "1" }],
      "2nd person": [{ field: "person", code: "2" }], "second person": [{ field: "person", code: "2" }],
      "3rd person": [{ field: "person", code: "3" }], "third person": [{ field: "person", code: "3" }],
      "future perfect": [{ field: "tense", code: "t" }]
    };
    for (var k in extra) { vocab[k] = (vocab[k] || []).concat(extra[k]); }
    return vocab;
  }

  /* ----------------------------------------------------------------------
   * translate(english) -> { sql, notes:[...], matched:[...] } | null
   * Longest-phrase-first keyword matching over a lowercased copy of the
   * query; each matched phrase contributes one AND'd condition. A run of
   * Greek characters not otherwise consumed is treated as a lemma search.
   * "how many" / "count" switches SELECT * to SELECT COUNT(*).
   * ------------------------------------------------------------------- */
  function localTranslate(english) {
    var raw = String(english || "").trim();
    if (!raw) return null;
    var vocab = buildFeatureVocab();
    var phrases = Object.keys(vocab).sort(function (a, b) { return b.length - a.length; });

    var lower = " " + raw.toLowerCase() + " ";
    var conds = [];       // SQL fragments
    var notes = [];        // human-readable "what I understood"
    var seenFields = {};   // last match per field wins (so "feminine ... not feminine" style edits still degrade sanely)

    phrases.forEach(function (phrase) {
      var needle = " " + phrase + " ";
      var idx = lower.indexOf(needle);
      if (idx === -1) return;
      // consume it so a shorter overlapping phrase can't also match the same span
      lower = lower.slice(0, idx + 1) + lower.slice(idx + needle.length - 1);
      vocab[phrase].forEach(function (m) {
        seenFields[m.field] = m.code;
      });
    });
    for (var field in seenFields) {
      conds.push(quoteId(field) + " = " + sqlStr(seenFields[field]));
      notes.push(field + " = " + seenFields[field]);
    }

    // work name, e.g. "in the Iliad" / "Odyssey book 9"
    var workKeys = Object.keys(SCHEMA.works).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < workKeys.length; i++) {
      var wk = workKeys[i];
      if (lower.indexOf(" " + wk + " ") !== -1 || lower.indexOf(" " + wk + ",") !== -1) {
        conds.push(quoteId("work") + " LIKE " + sqlStr(SCHEMA.works[wk] + "%"));
        notes.push("work in " + wk);
        lower = lower.split(wk).join(" ");
        break;
      }
    }

    // a run of Greek letters not already consumed -> lemma search, via the
    // accent-insensitive companion column so spelling-without-accents matches
    // (this is the workaround for SQLite having no built-in accent folding).
    var greekMatch = raw.match(/[\u0370-\u03ff\u1f00-\u1fff]+/);
    if (greekMatch && window.MopsosText) {
      var key = window.MopsosText.stripDiacritics(greekMatch[0]);
      var searchCol = null;
      for (var tf = 0; tf < SCHEMA.textFields.length && !searchCol; tf++) {
        searchCol = SCHEMA.searchKeyOf[SCHEMA.textFields[tf]];
      }
      if (key && searchCol) {
        conds.push(quoteId(searchCol) + " LIKE " + sqlStr("%" + key + "%"));
        notes.push("lemma resembling " + greekMatch[0]);
      }
    }

    var wantsCount = /\b(how many|count|number of)\b/.test(lower);
    var select = wantsCount ? "SELECT COUNT(*) AS n" : "SELECT *";
    var sql = select + "\nFROM " + quoteId(SCHEMA.table);
    if (conds.length) sql += "\nWHERE " + conds.join("\n  AND ");
    if (!wantsCount) sql += "\nLIMIT 200";
    sql += ";";

    if (!conds.length) {
      notes.push("no recognised filters, so showing an unfiltered preview");
    }
    return { sql: sql, notes: notes };
  }

  /* ----------------------------------------------------------------------
   * Pluggable backend. Default is the local rule-based translator above.
   * A smarter one (e.g. calling an LLM through a developer-run proxy that
   * keeps the API key server-side) can replace it without touching any
   * page's markup or JS:
   *   window.MopsosNL2SQL.setBackend(async function (english, schema) {
   *     const res = await fetch("/your-proxy-endpoint", {
   *       method: "POST", headers: {"Content-Type":"application/json"},
   *       body: JSON.stringify({ query: english, schema: schema })
   *     });
   *     const data = await res.json();
   *     return { sql: data.sql, notes: [data.explanation] };
   *   });
   * The backend receives the raw English text and the SCHEMA object above,
   * and must resolve to { sql, notes } or reject/throw.
   * ------------------------------------------------------------------- */
  var backend = function (english) { return Promise.resolve(localTranslate(english)); };

  function setBackend(fn) { if (typeof fn === "function") backend = fn; }

  function translate(english) { return backend(english); }

  /* ----------------------------------------------------------------------
   * DOM wiring: find every textarea[data-nl2sql], insert an "Ask in English"
   * bar directly above it, wire it up. Idempotent (safe if called twice).
   * Reuses existing site CSS classes only — no new stylesheet needed.
   * ------------------------------------------------------------------- */
  function attachTo(textarea) {
    if (!textarea || textarea.dataset.nl2sqlWired) return;
    textarea.dataset.nl2sqlWired = "1";

    var runBtnId = textarea.getAttribute("data-nl2sql-run");
    var wrap = document.createElement("div");
    wrap.className = "nl2sql-bar";
    wrap.style.margin = "0 0 .5rem";
    wrap.innerHTML =
      '<label style="display:block;margin-bottom:.3rem;"><strong>Ask in plain English</strong> ' +
      '<span class="help">(translated to the SQL below, read-only; nothing is run automatically beyond what the query itself selects)</span></label>' +
      '<div class="inline-group">' +
      '<input type="text" class="nl2sql-input" autocomplete="off" spellcheck="false" ' +
      'placeholder="e.g. show me every noun whose gender is feminine in the Iliad" style="flex:1;min-width:240px;">' +
      '<button type="button" class="btn nl2sql-go">Translate to SQL</button>' +
      "</div>" +
      '<p class="small-muted nl2sql-status" style="margin:.35rem 0 0;"></p>';
    textarea.parentNode.insertBefore(wrap, textarea);

    var input = wrap.querySelector(".nl2sql-input");
    var status = wrap.querySelector(".nl2sql-status");
    var go = wrap.querySelector(".nl2sql-go");

    function run() {
      var q = input.value.trim();
      if (!q) { status.textContent = "Type a question first."; return; }
      status.textContent = "Translating…";
      Promise.resolve(translate(q)).then(function (result) {
        if (!result || !result.sql) {
          status.textContent = "Couldn't turn that into a query. Try naming a part of speech, a grammatical feature, or a work (e.g. Iliad).";
          return;
        }
        textarea.value = result.sql;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        status.textContent = result.notes && result.notes.length
          ? "Understood: " + result.notes.join(", ") + "."
          : "Translated.";
        if (runBtnId) {
          var btn = document.getElementById(runBtnId);
          if (btn) btn.click();
        }
      }).catch(function (e) {
        status.textContent = "Translation error: " + (e && e.message ? e.message : e);
      });
    }

    go.addEventListener("click", run);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); run(); }
    });
  }

  function scan(root) {
    (root || document).querySelectorAll("textarea[data-nl2sql]").forEach(attachTo);
  }

  window.MopsosNL2SQL = { translate: translate, setBackend: setBackend, scan: scan, SCHEMA: SCHEMA };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { scan(); });
  else scan();
})();
