/* ============================================================================
 *  ENCODER KIT: what the compound and infinitive encoder pages share. The site is
 *  static, so a decision is first kept in this browser and then sent to the team's
 *  Google Sheet (scripts/encoder_sheet.gs), whose web app address is in the page's
 *  data-sheet-url. The outbox holds what the sheet has not confirmed; it survives
 *  a reload, so a dropped connection loses nothing. Sending is safe to repeat,
 *  because the sheet replaces a record by its id.
 * ========================================================================== */
window.EncoderKit = (function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, one, many) => n + " " + (n === 1 ? one : (many || one + "s"));

  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  function toGreek(v) {
    const s = String(v == null ? "" : v);
    if (!s || /[Ͱ-Ͽἀ-῿]/.test(s) || !/[a-z*]/i.test(s) || !window.BetaCode) return s;
    try { return window.BetaCode.betaCodeToGreek(s).normalize("NFC"); } catch (e) { return s; }
  }

  let toastTimer = null;
  function toast(msg, undo) {
    const el = $("toast");
    el.innerHTML = "<span>" + esc(msg) + "</span>" + (undo ? '<button type="button" id="undoBtn">Undo</button>' : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 7000 : 3200);
    if (undo) $("undoBtn").onclick = () => { el.hidden = true; undo(); };
  }
  function saveFile(filename, data) {
    const url = URL.createObjectURL(new Blob([data], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Saved " + filename);
  }
  async function copy(text, el) {
    try { await navigator.clipboard.writeText(text); toast("Copied"); }
    catch (e) {
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      toast("Press Ctrl+C to copy the selected rows.");
    }
  }
  /* Translation rows for the reader. A passage covers the Greek lines from its own
   * start up to the next passage's start. Some editions print lines out of numerical
   * order, so each row goes by where the passage's last line sits on the page rather
   * than by its number. Open rows stay open when the reader is rebuilt. */
  function createTranslations(box) {
    const open = new Set();
    let texts = {}, plan = null;
    const at = (list, n) => {
      let hit = -1;
      for (let i = 0; i < list.length && list[i][0] <= n; i++) hit = i;
      return hit;
    };
    function planFor(textId, lines) {
      if (plan && plan.lines === lines) return plan;
      const list = texts[textId] || [], of = [], span = new Map();
      lines.forEach((l, i) => {
        const n = parseInt(l.n, 10), p = at(list, n);
        of[i] = p;
        if (p < 0) return;
        const e = span.get(p) || { last: i, lo: n, hi: n };
        e.last = i; e.lo = Math.min(e.lo, n); e.hi = Math.max(e.hi, n);
        span.set(p, e);
      });
      plan = { lines, list, of, span, seen: new Set() };
      return plan;
    }
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest(".enc-tr-btn");
      if (!b) return;
      const row = b.parentNode, p = row.querySelector(".enc-tr-text"), opening = p.hidden;
      p.hidden = !opening;
      b.setAttribute("aria-expanded", String(opening));
      b.firstChild.textContent = opening ? "Hide translation" : "Show translation";
      if (opening) open.add(row.dataset.tr); else open.delete(row.dataset.tr);
    });
    return {
      set(o) { texts = (o && o.texts) || {}; plan = null; },
      // The row to place after line li, if that line ends a passage. onScreen says
      // whether the line is showing, so a filtered-out passage gets no row.
      after(textId, lines, li, onScreen) {
        const p = planFor(textId, lines);
        if (li === 0) p.seen.clear();
        const here = p.of[li];
        if (here === undefined || here < 0) return "";
        if (onScreen) p.seen.add(here);
        const s = p.span.get(here);
        if (s.last !== li || !p.seen.has(here)) return "";
        const key = textId + "|" + here, isOpen = open.has(key);
        const range = s.hi > s.lo ? "lines " + s.lo + "–" + s.hi : "line " + s.lo;
        return '<div class="enc-tr" data-tr="' + esc(key) + '"><button type="button" class="enc-tr-btn" aria-expanded="' + isOpen + '">' +
          (isOpen ? "Hide translation" : "Show translation") + '<span class="enc-tr-range"> · ' + range + "</span></button>" +
          '<p class="enc-tr-text"' + (isOpen ? "" : " hidden") + ">" + esc(p.list[here][1]) + "</p></div>";
      },
    };
  }
  const loadTranslations = () => fetch("assets/data/encoder/translations.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

  /* cfg: key (browser storage), kinds (record types this page keeps), url (sheet
   * web app, or ""), ui() (page state to remember), onRemote(kinds) (records
   * arrived from the sheet). */
  function createStore(cfg) {
    const url = cfg.url || "", rows = {};
    cfg.kinds.forEach((k) => { rows[k] = new Map(); });
    let outbox = {}, sheetState = url ? "connecting" : "off";
    let sendTimer = null, sending = false, retryDelay = 5000, lastPull = 0, sheetJoined = false;
    let unbacked = 0, storageOk = true, saveTimer = null;

    function saveNow() {
      clearTimeout(saveTimer);
      try {
        const o = { unbacked, outbox, sheetJoined, ...cfg.ui() };
        cfg.kinds.forEach((k) => { o[k] = [...rows[k].entries()]; });
        localStorage.setItem(cfg.key, JSON.stringify(o));
        storageOk = true;
      } catch (e) { storageOk = false; }
      refresh();
    }
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 200);
    }
    function load() {
      try {
        const raw = localStorage.getItem(cfg.key);
        if (!raw) return {};
        const o = JSON.parse(raw);
        cfg.kinds.forEach((k) => { (o[k] || []).forEach(([id, v]) => rows[k].set(id, v)); });
        unbacked = o.unbacked || 0;
        outbox = o.outbox || {};
        sheetJoined = !!o.sheetJoined;
        return o;
      } catch (e) { return {}; }
    }
    function put(kind, id, value) {
      if (value == null) rows[kind].delete(id); else rows[kind].set(id, value);
      unbacked++;
      if (url) { outbox[kind + "|" + id] = { kind, id, value: value == null ? null : value }; queueSend(400); }
      save();
    }
    function refresh() {
      const el = $("sync"), waiting = Object.keys(outbox).length;
      el.className = !storageOk || sheetState === "waiting" ? "small-muted cmp-warn" : "small-muted";
      if (!storageOk && sheetState !== "saved") el.textContent = "This browser is not keeping your work. Save a backup under Export before you close this page.";
      else if (sheetState === "off") el.textContent = unbacked ? "Saved in this browser · " + plural(unbacked, "change") + " since your last backup" : "Saved in this browser";
      else if (sheetState === "waiting") el.textContent = "Saved in this browser · " + plural(waiting, "change") + " waiting to reach the team sheet. Keep working; they will send on their own.";
      else if (sheetState === "sending") el.textContent = "Saving to the team sheet…";
      else if (sheetState === "connecting") el.textContent = "Connecting to the team sheet…";
      else el.textContent = "Saved to the team sheet";
    }
    function setSheet(state) { sheetState = state; refresh(); }
    function queueSend(ms) {
      if (!url) return;
      clearTimeout(sendTimer);
      sendTimer = setTimeout(send, ms);
    }
    async function send() {
      if (!url || sending) return;
      const keys = Object.keys(outbox).slice(0, 250);
      if (!keys.length) { setSheet("saved"); return; }
      const batch = keys.map((k) => outbox[k]);
      sending = true;
      setSheet("sending");
      try {
        // text/plain keeps this a simple request, which Apps Script can answer.
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ changes: batch }) });
        const o = await r.json();
        // The sheet drops kinds it does not know and still says ok, so a save
        // only counts once every record is accepted.
        if (!o.ok || o.saved !== batch.length) throw new Error(o.error || "not accepted");
        // A record changed again while this was in flight goes out in the next batch.
        keys.forEach((k, i) => { if (outbox[k] === batch[i]) delete outbox[k]; });
        retryDelay = 5000;
        sending = false;
        save();
        if (Object.keys(outbox).length) queueSend(50); else setSheet("saved");
      } catch (e) {
        sending = false;
        setSheet("waiting");
        queueSend(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 120000);
      }
    }
    // Bring in what others have saved. Records with unsent changes here are left alone.
    async function pull() {
      if (!url) return;
      lastPull = Date.now();
      try {
        const r = await fetch(url);
        const o = await r.json();
        if (!o.ok) throw new Error(o.error || "refused");
        const changed = new Set();
        cfg.kinds.forEach((kind) => (o[kind] || []).forEach(([id, v]) => {
          if (outbox[kind + "|" + id] || JSON.stringify(rows[kind].get(id)) === JSON.stringify(v)) return;
          rows[kind].set(id, v);
          changed.add(kind);
        }));
        (o.deleted || []).forEach(([kind, id]) => {
          if (!rows[kind] || outbox[kind + "|" + id] || !rows[kind].delete(id)) return;
          changed.add(kind);
        });
        if (changed.size) { save(); cfg.onRemote(changed); }
        // The first time a browser connects, send anything saved here before the
        // sheet existed. Only once, so a row removed from the sheet stays removed.
        if (!sheetJoined) {
          sheetJoined = true;
          const there = new Set();
          cfg.kinds.forEach((kind) => (o[kind] || []).forEach(([id]) => there.add(kind + "|" + id)));
          cfg.kinds.forEach((kind) => rows[kind].forEach((value, id) => {
            const k = kind + "|" + id;
            if (!there.has(k) && !outbox[k]) outbox[k] = { kind, id, value };
          }));
          save();
          queueSend(100);
        }
        if (sheetState === "connecting") setSheet(Object.keys(outbox).length ? "sending" : "saved");
      } catch (e) {
        if (sheetState === "connecting") setSheet("waiting");
      }
    }
    function start() {
      refresh();
      addEventListener("pagehide", saveNow);
      if (!url) return;
      addEventListener("online", () => queueSend(0));
      addEventListener("pagehide", () => {
        const list = Object.values(outbox).slice(0, 250);
        if (list.length && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([JSON.stringify({ changes: list })], { type: "text/plain;charset=utf-8" }));
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastPull > 60000) pull(); });
      pull();
      queueSend(300);
      setInterval(() => { if (!document.hidden) pull(); }, 120000);
    }
    function markBackedUp() { unbacked = 0; saveNow(); }
    return { rows, url, put, save, saveNow, load, start, refresh, markBackedUp };
  }

  return { $, esc, plural, hash, toGreek, toast, saveFile, copy, csv, createStore, createTranslations, loadTranslations };
})();
