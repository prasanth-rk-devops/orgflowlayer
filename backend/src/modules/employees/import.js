const { z } = require('zod');
const { parseCsv } = require('../../utils/csvParse');
const { isoDate } = require('../../utils/validators');
const AppError = require('../../utils/AppError');

const MAX_ROWS = 500;

const ALIASES = {
  first_name: ['first_name', 'firstname', 'first', 'given_name'],
  last_name: ['last_name', 'lastname', 'last', 'surname', 'family_name'],
  email: ['email', 'work_email', 'email_address'],
  job_title: ['job_title', 'title', 'position', 'role'],
  department: ['department', 'dept', 'team'],
  manager_email: ['manager_email', 'manager', 'reports_to', 'line_manager'],
  hire_date: ['hire_date', 'start_date', 'joined', 'date_joined', 'joining_date'],
  phone: ['phone', 'mobile', 'telephone'],
  salary: ['salary', 'annual_salary'],
};
const REQUIRED = ['first_name', 'last_name', 'email', 'job_title', 'hire_date'];

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const rowSchema = z.object({
  first_name: z.string().trim().min(1, 'is required').max(80),
  last_name: z.string().trim().min(1, 'is required').max(80),
  email: z.string().trim().toLowerCase().email('is not a valid email').max(160),
  job_title: z.string().trim().min(2, 'is required').max(120),
  hire_date: isoDate,
  phone: z.string().trim().max(30).optional(),
  salary: z.coerce.number({ invalid_type_error: 'must be a number' }).min(0, 'cannot be negative').max(100000000).optional(),
  department: z.string().trim().max(100).optional(),
  manager_email: z.string().trim().toLowerCase().max(160).optional(),
});

/** CSV text -> array of { rowNumber, values } using the header row. Throws AppError(400) for unusable files. */
function readTable(csv) {
  let table;
  try { table = parseCsv(csv); } catch (e) { throw new AppError(400, e.message); }
  if (table.length < 2) throw new AppError(400, 'The file needs a header row and at least one person.');
  if (table.length - 1 > MAX_ROWS) throw new AppError(400, `Import up to ${MAX_ROWS} people at a time. This file has ${table.length - 1}.`);

  const headers = table[0].map(norm);
  const index = {};
  for (const [canon, names] of Object.entries(ALIASES)) {
    const i = headers.findIndex((h) => names.includes(h));
    if (i >= 0) index[canon] = i;
  }
  const missing = REQUIRED.filter((c) => !(c in index));
  if (missing.length) throw new AppError(400, `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the expected headings.`);

  return table.slice(1).map((cells, i) => {
    const values = {};
    for (const [canon, col] of Object.entries(index)) {
      const v = (cells[col] ?? '').trim();
      if (v !== '') values[canon] = v;
    }
    return { rowNumber: i + 2, values };
  });
}

/** Validate every row against the database state. Pure of writes; returns { rows (valid, resolved), errors }. */
async function validateRows(client, rows) {
  const errors = [];
  const bad = new Set();
  const fail = (row, field, message) => { errors.push({ row, field, message }); bad.add(row); };

  const depts = new Map((await client.query('SELECT id, name FROM departments')).rows.map((d) => [d.name.toLowerCase(), d]));
  const existing = new Map((await client.query('SELECT id, email, status FROM employees')).rows.map((e) => [e.email.toLowerCase(), e]));
  const seen = new Map();
  const parsed = [];

  for (const { rowNumber, values } of rows) {
    const absent = REQUIRED.filter((c) => !values[c]);
    if (absent.length) { absent.forEach((c) => fail(rowNumber, c, `${c} is required`)); continue; }
    const r = rowSchema.safeParse(values);
    if (!r.success) { r.error.issues.forEach((i) => fail(rowNumber, i.path.join('.'), `${i.path.join('.')}: ${i.message}`)); continue; }
    const v = r.data;
    if (existing.has(v.email)) fail(rowNumber, 'email', `${v.email} already exists`);
    else if (seen.has(v.email)) fail(rowNumber, 'email', `${v.email} appears again on row ${seen.get(v.email)}`);
    else seen.set(v.email, rowNumber);
    if (v.department && !depts.has(v.department.toLowerCase())) {
      fail(rowNumber, 'department', `Unknown department "${v.department}". Existing: ${[...depts.values()].map((d) => d.name).join(', ') || 'none yet'}`);
    }
    parsed.push({ rowNumber, ...v, departmentId: v.department ? depts.get(v.department.toLowerCase())?.id ?? null : null });
  }

  // Managers: someone already in the company (active) or another row in this file.
  const fileEmails = new Set(parsed.filter((p) => !bad.has(p.rowNumber)).map((p) => p.email));
  for (const p of parsed) {
    if (!p.manager_email) continue;
    if (p.manager_email === p.email) { fail(p.rowNumber, 'manager_email', 'An employee cannot manage themselves'); continue; }
    const inDb = existing.get(p.manager_email);
    if (inDb) { if (inDb.status !== 'active') fail(p.rowNumber, 'manager_email', `${p.manager_email} is inactive`); }
    else if (!fileEmails.has(p.manager_email)) fail(p.rowNumber, 'manager_email', `Manager ${p.manager_email} was not found`);
  }
  // Circular chains that exist only inside the file
  const mgrOf = new Map(parsed.map((p) => [p.email, p.manager_email]));
  for (const p of parsed) {
    let cur = p.manager_email; let hops = 0;
    while (cur && mgrOf.has(cur) && hops < parsed.length + 1) {
      if (cur === p.email) { fail(p.rowNumber, 'manager_email', 'This creates a circular reporting line'); break; }
      cur = mgrOf.get(cur); hops += 1;
    }
  }
  errors.sort((a, b) => a.row - b.row);
  return { valid: parsed.filter((p) => !bad.has(p.rowNumber)), errors, badRows: bad.size, existing };
}

module.exports = { readTable, validateRows, MAX_ROWS };
