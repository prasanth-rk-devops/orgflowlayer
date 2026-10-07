/** Escape one CSV cell. Cells starting with = + - @ are prefixed to block spreadsheet formula injection. */
function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v); // negative numbers are numbers, not formulas
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ key, label }], rows: array of objects. BOM + CRLF so Excel opens it correctly. */
function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function sendCsv(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(columns, rows));
}

module.exports = { cell, toCsv, sendCsv };
