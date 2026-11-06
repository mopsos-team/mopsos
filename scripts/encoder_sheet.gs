/* MoPSoS encoders: receives each save from the compound and infinitive encoder
 * pages and keeps it in this spreadsheet. Lives in the spreadsheet under Extensions > Apps Script,
 * deployed as a web app (Execute as: Me; Who has access: Anyone).
 *
 * One tab per kind of record, in the same columns as the site's CSV files, so the
 * rows can be read and copied directly. The hidden id and json columns are what
 * the page reads back: json holds the record exactly as the page saved it, split
 * across rows when it is too long for one cell. Change records in the page, not
 * here; edits to the visible cells are not read back.
 */

const TABS = {
  ent: {
    title: "Compounds",
    head: ["lemma", "inferred", "segmentation", "member1", "member1_category", "member1_subcategory",
      "member2", "member2_category", "member2_subcategory", "analysis_count", "member_count",
      "link_to", "uncertain", "include", "note"],
    rows: (v) => v.analyses.map((a) => [v.lemma, v.inferred ? "1" : "0", a.seg, a.m1, a.m1c, a.m1s,
      a.m2, a.m2c, a.m2s, v.analyses.length, v.member_count || 2, v.link_to || "", a.unc ? "1" : "0",
      (v.include || []).join(", "), v.note || ""]),
  },
  att: {
    title: "Attestations",
    head: ["compound", "work", "book", "line_num", "form"],
    rows: (v) => [[v.lemma + (v.star ? " (*)" : ""), v.work, v.book, v.line, v.form]],
  },
  not: { title: "Not compounds", head: ["form"], rows: (v) => [[v.form]] },
  inf: {
    title: "Infinitives",
    head: ["work", "book", "verse", "form", "lemma", "tense", "voice", "conjugation", "morpheme", "ending",
      "metrical_shape", "metrical_stem_shape", "uncertain", "note"],
    rows: (v) => [[v.work, v.book, v.line, v.form, v.lemma, v.tense, v.voice, v.conj, v.morph, v.tag || "",
      v.shape, v.stem, v.unc ? "1" : "0", v.note || ""]],
  },
  nin: { title: "Not infinitives", head: ["form"], rows: (v) => [[v.form]] },
  txt: { title: "Pasted texts", head: ["title", "work", "book", "lines"], rows: (v) => [[v.title, v.work, v.book, v.lines.length]] },
};
const DELETED = "Deleted";
const CELL_LIMIT = 45000;   // a cell holds 50,000 characters
const MAX_CHANGES = 500;

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Plain-text format keeps values like "-ā/a", "2" and "137a" exactly as sent.
function makeTab(title, head) {
  const ss = SpreadsheetApp.getActive();
  const first = ss.getSheets()[0];
  const sh = first.getName() === "Sheet1" && first.getLastRow() === 0 ? first : ss.insertSheet(title);
  sh.setName(title);
  sh.getRange(1, 1, 1, head.length).setNumberFormat("@").setValues([head]).setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}
function tab(kind) {
  const t = TABS[kind];
  const sh = SpreadsheetApp.getActive().getSheetByName(t.title);
  if (sh) return sh;
  const made = makeTab(t.title, t.head.concat(["updated", "id", "json"]));
  made.hideColumns(t.head.length + 2, 2);
  return made;
}
function deletedTab() {
  return SpreadsheetApp.getActive().getSheetByName(DELETED) || makeTab(DELETED, ["kind", "id", "updated"]);
}

function deleteMatching(sh, column, match) {
  const last = sh.getLastRow();
  if (last < 2) return;
  // Sheets refuses to delete every non-frozen row, so keep a spare one.
  if (sh.getMaxRows() === last) sh.insertRowsAfter(last, 100);
  const values = sh.getRange(2, 1, last - 1, column).getValues();
  let end = -1;
  for (let i = values.length - 1; i >= -1; i--) {
    const hit = i >= 0 && match(values[i]);
    if (hit && end < 0) end = i;
    if (!hit && end >= 0) { sh.deleteRows(i + 3, end - i); end = -1; }
  }
}
function append(sh, rows) {
  if (!rows.length) return;
  const start = sh.getLastRow() + 1, end = start + rows.length - 1;
  if (end > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), end - sh.getMaxRows() + 100);
  sh.getRange(start, 1, rows.length, rows[0].length).setNumberFormat("@").setValues(rows);
}
function chunks(text) {
  const out = [];
  for (let i = 0; i < text.length; i += CELL_LIMIT) out.push(text.slice(i, i + CELL_LIMIT));
  return out;
}

function writeKind(kind, changes) {
  const t = TABS[kind], sh = tab(kind), idColumn = t.head.length + 2;
  const ids = new Set(changes.map((c) => c.id));
  deleteMatching(sh, idColumn, (row) => ids.has(String(row[idColumn - 1])));
  const now = new Date().toISOString(), blank = t.head.map(() => "");
  const rows = [];
  changes.forEach((c) => {
    if (c.value == null) return;
    const shown = t.rows(c.value), parts = chunks(JSON.stringify(c.value));
    for (let i = 0; i < Math.max(shown.length, parts.length); i++) {
      rows.push((shown[i] || blank).map(String).concat([i === 0 ? now : "", c.id, parts[i] || ""]));
    }
  });
  append(sh, rows);
}
// A deletion is remembered so that other browsers drop the record too; saving
// the same record again clears the mark.
function noteDeletions(changes) {
  const sh = deletedTab();
  const ids = new Set(changes.map((c) => c.kind + "|" + c.id));
  deleteMatching(sh, 2, (row) => ids.has(row[0] + "|" + row[1]));
  const now = new Date().toISOString();
  append(sh, changes.filter((c) => c.value == null).map((c) => [c.kind, c.id, now]));
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return reply({ ok: false, error: "busy" });
  try {
    const changes = (JSON.parse(e.postData.contents).changes || []).slice(0, MAX_CHANGES)
      .filter((c) => TABS[c.kind] && typeof c.id === "string" && c.id.length <= 64 && (c.value === null || typeof c.value === "object"));
    Object.keys(TABS).forEach((kind) => {
      const mine = changes.filter((c) => c.kind === kind);
      if (mine.length) writeKind(kind, mine);
    });
    if (changes.length) noteDeletions(changes);
    return reply({ ok: true, saved: changes.length });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function readKind(kind) {
  const t = TABS[kind], sh = tab(kind), last = sh.getLastRow();
  if (last < 2) return [];
  const parts = new Map();
  sh.getRange(2, t.head.length + 2, last - 1, 2).getValues().forEach(([id, json]) => {
    if (id) parts.set(String(id), (parts.get(String(id)) || "") + json);
  });
  const out = [];
  parts.forEach((json, id) => {
    try { out.push([id, JSON.parse(json)]); } catch (err) { /* a damaged row: leave it out */ }
  });
  return out;
}

function doGet() {
  try {
    const out = { ok: true };
    Object.keys(TABS).forEach((kind) => { out[kind] = readKind(kind); });
    const sh = deletedTab(), last = sh.getLastRow();
    out.deleted = last < 2 ? [] : sh.getRange(2, 1, last - 1, 2).getValues();
    return reply(out);
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}
