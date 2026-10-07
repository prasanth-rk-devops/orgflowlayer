/**
 * Small RFC-4180 CSV parser: quoted fields, escaped quotes (""), commas/newlines inside quotes, CRLF, BOM.
 * Auto-detects ';' as the delimiter (Excel in many locales) when the header row has no commas.
 */
function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';

  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += ch;
  }
  if (inQuotes) throw new Error('The file has a quoted value that never closes. Check for a stray " character.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

module.exports = { parseCsv };
