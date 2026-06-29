(() => {
  if (typeof window === "undefined" || window.Papa?.parse) return;

  function coerceCell(value, dynamicTyping) {
    if (!dynamicTyping) return value;
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return value;
  }

  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    const pushCell = () => { row.push(cell); cell = ""; };
    const pushRow = () => {
      pushCell();
      rows.push(row);
      row = [];
    };

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && ch === ',') {
        pushCell();
        continue;
      }

      if (!inQuotes && (ch === '\n' || ch === '\r')) {
        if (ch === '\r' && next === '\n') i += 1;
        pushRow();
        continue;
      }

      cell += ch;
    }

    if (cell.length || row.length) pushRow();
    return rows;
  }

  function fallbackParse(text, options = {}) {
    const { header = false, skipEmptyLines = false, dynamicTyping = false, complete, error } = options;
    try {
      const matrix = parseCsvText(String(text || ""));
      if (!matrix.length) {
        const empty = { data: [], errors: [], meta: { fields: [] } };
        if (typeof complete === "function") complete(empty);
        return empty;
      }

      const rows = skipEmptyLines
        ? matrix.filter((r) => r.some((v) => String(v || "").trim() !== ""))
        : matrix;

      let data;
      let fields = [];
      if (header) {
        fields = (rows.shift() || []).map((v) => String(v || "").trim());
        data = rows.map((r) => {
          const obj = {};
          for (let i = 0; i < fields.length; i++) {
            obj[fields[i]] = coerceCell(String(r[i] ?? ""), dynamicTyping);
          }
          return obj;
        });
      } else {
        data = rows.map((r) => r.map((cell) => coerceCell(String(cell ?? ""), dynamicTyping)));
      }

      const result = { data, errors: [], meta: { fields } };
      if (typeof complete === "function") complete(result);
      return result;
    } catch (err) {
      if (typeof error === "function") error(err);
      else throw err;
      return { data: [], errors: [err], meta: { fields: [] } };
    }
  }

  window.Papa = { parse: fallbackParse };
})();
