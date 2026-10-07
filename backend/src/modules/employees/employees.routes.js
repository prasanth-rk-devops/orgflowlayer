const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, withTransaction } = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');
const { sendCsv } = require('../../utils/csv');
const { readTable, validateRows } = require('./import');

const idParam = z.object({ id: z.coerce.number().int().positive() });
const { isoDate } = require('../../utils/validators');
const optId = z.coerce.number().int().positive().optional().nullable();

const employeeFields = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).optional().nullable(),
  jobTitle: z.string().trim().min(2).max(120),
  departmentId: optId,
  managerId: optId,
  hireDate: isoDate,
  salary: z.coerce.number().min(0).max(100000000).optional().nullable(),
});

const createSchema = employeeFields.extend({
  createLogin: z.boolean().optional().default(false),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/).optional(),
  role: z.enum(['admin', 'manager', 'employee']).optional().default('employee'),
}).refine((d) => !d.createLogin || !!d.password, { message: 'Password is required to create a login', path: ['password'] });

const updateSchema = employeeFields.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
  role: z.enum(['admin', 'manager', 'employee']).optional(),
});

const listQuery = z.object({
  search: z.string().trim().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const SELECT = `
  SELECT e.id, e.first_name AS "firstName", e.last_name AS "lastName", e.email, e.phone,
         e.job_title AS "jobTitle", e.department_id AS "departmentId", d.name AS "departmentName",
         e.manager_id AS "managerId", m.first_name || ' ' || m.last_name AS "managerName",
         e.hire_date::text AS "hireDate", e.salary::float AS salary, e.status,
         u.role AS role, (u.id IS NOT NULL) AS "hasLogin"
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN employees m ON m.id = e.manager_id
  LEFT JOIN users u ON u.employee_id = e.id`;

// Salary is confidential: only admins can see it.
const redact = (user) => (row) => (user.role === 'admin' ? row : { ...row, salary: undefined });

router.use(authenticate);

/** Flat list of active people with their manager; the browser builds the tree. */
router.get('/org-chart', asyncHandler(async (_req, res) => {
  const { rows } = await query(`
    SELECT e.id, e.first_name AS "firstName", e.last_name AS "lastName", e.job_title AS "jobTitle",
           d.name AS "departmentName", e.manager_id AS "managerId"
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.status = 'active' ORDER BY e.first_name, e.last_name`);
  res.json(rows);
}));

router.get('/import-template.csv', authorize('admin'), (_req, res) => {
  const cols = ['first_name', 'last_name', 'email', 'job_title', 'department', 'manager_email', 'hire_date', 'phone', 'salary'];
  sendCsv(res, 'employee-import-template.csv', cols.map((c) => ({ key: c, label: c })), [{
    first_name: 'Ada', last_name: 'Lovelace', email: 'ada.lovelace@yourcompany.com', job_title: 'Analyst', department: 'Engineering',
    manager_email: '', hire_date: '2026-01-12', phone: '+1 555 0100', salary: 72000 }]);
});

/**
 * Bulk create employees (no sign-ins) from CSV text. All-or-nothing: if any row has a problem nothing is written.
 * Always answers 200 with { total, valid, created, errors[] } so the UI can show every problem at once.
 * dryRun: true checks the file without saving.
 */
router.post('/import', authorize('admin'),
  validate({ body: z.object({ csv: z.string().min(1).max(1000000), dryRun: z.boolean().optional().default(false) }) }),
  asyncHandler(async (req, res) => {
    const rows = readTable(req.body.csv);
    const out = await withTransaction(async (c) => {
      const { valid, errors, badRows, existing } = await validateRows(c, rows);
      if (errors.length || req.body.dryRun) return { created: 0, valid: rows.length - badRows, errors };

      const ids = new Map();
      for (const p of valid) {
        const r = await c.query(
          `INSERT INTO employees(first_name,last_name,email,phone,job_title,department_id,hire_date,salary)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [p.first_name, p.last_name, p.email, p.phone ?? null, p.job_title, p.departmentId, p.hire_date, p.salary ?? null]);
        ids.set(p.email, r.rows[0].id);
      }
      for (const p of valid) {
        if (!p.manager_email) continue;
        const mid = ids.get(p.manager_email) ?? existing.get(p.manager_email)?.id;
        await c.query('UPDATE employees SET manager_id = $1 WHERE id = $2', [mid, ids.get(p.email)]);
      }
      await audit(c, req.user.id, 'import', 'employee', null, { created: valid.length });
      return { created: valid.length, valid: rows.length, errors: [] };
    });
    res.json({ total: rows.length, dryRun: req.body.dryRun, ...out });
  }));

router.get('/export.csv', authorize('admin'), asyncHandler(async (req, res) => {
  const { rows } = await query(`${SELECT} ORDER BY e.last_name, e.first_name`);
  await audit(null, req.user.id, 'export', 'employee', null, { rows: rows.length });
  sendCsv(res, `employees-${new Date().toISOString().slice(0, 10)}.csv`, [
    { key: 'firstName', label: 'First name' }, { key: 'lastName', label: 'Last name' }, { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' }, { key: 'jobTitle', label: 'Job title' }, { key: 'departmentName', label: 'Department' },
    { key: 'managerName', label: 'Manager' }, { key: 'hireDate', label: 'Hire date' }, { key: 'salary', label: 'Salary' },
    { key: 'status', label: 'Status' }, { key: 'role', label: 'Access level' },
  ], rows);
}));

router.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const { search, departmentId, status, page, limit } = req.query;
  const where = []; const params = [];
  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    where.push(`(e.first_name ILIKE ${p} OR e.last_name ILIKE ${p} OR e.email ILIKE ${p} OR e.job_title ILIKE ${p})`);
  }
  if (departmentId) { params.push(departmentId); where.push(`e.department_id = $${params.length}`); }
  if (status) { params.push(status); where.push(`e.status = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (await query(`SELECT COUNT(*)::int AS n FROM employees e ${clause}`, params)).rows[0].n;
  const rows = (await query(
    `${SELECT} ${clause} ORDER BY e.first_name, e.last_name LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params)).rows;
  res.json({ data: rows.map(redact(req.user)), page, limit, total, totalPages: Math.ceil(total / limit) });
}));

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const { rows } = await query(`${SELECT} WHERE e.id = $1`, [req.params.id]);
  if (!rows[0]) throw new AppError(404, 'Employee not found');
  res.json(redact(req.user)(rows[0]));
}));

async function assertManagerValid(client, managerId, selfId) {
  if (!managerId) return;
  if (selfId && Number(managerId) === Number(selfId)) throw new AppError(400, 'An employee cannot manage themselves');
  const r = await client.query('SELECT id FROM employees WHERE id=$1 AND status=$2', [managerId, 'active']);
  if (!r.rows[0]) throw new AppError(400, 'Selected manager does not exist or is inactive');
  // prevent cycles: walk up the chain from the proposed manager
  if (selfId) {
    let cur = managerId;
    for (let i = 0; i < 50 && cur; i += 1) {
      const up = await client.query('SELECT manager_id FROM employees WHERE id=$1', [cur]);
      cur = up.rows[0]?.manager_id;
      if (cur && Number(cur) === Number(selfId)) throw new AppError(400, 'This would create a circular reporting line');
    }
  }
}

router.post('/', authorize('admin'), validate({ body: createSchema }), asyncHandler(async (req, res) => {
  const b = req.body;
  const id = await withTransaction(async (c) => {
    await assertManagerValid(c, b.managerId, null);
    const e = await c.query(
      `INSERT INTO employees(first_name,last_name,email,phone,job_title,department_id,manager_id,hire_date,salary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [b.firstName, b.lastName, b.email, b.phone ?? null, b.jobTitle, b.departmentId ?? null,
       b.managerId ?? null, b.hireDate, b.salary ?? null]);
    if (b.createLogin) {
      const hash = await bcrypt.hash(b.password, 12);
      await c.query('INSERT INTO users(employee_id,email,password_hash,role) VALUES ($1,$2,$3,$4)',
        [e.rows[0].id, b.email, hash, b.role]);
    }
    await audit(c, req.user.id, 'create', 'employee', e.rows[0].id, { email: b.email, login: b.createLogin });
    return e.rows[0].id;
  });
  const { rows } = await query(`${SELECT} WHERE e.id=$1`, [id]);
  res.status(201).json(rows[0]);
}));

const COLUMN = {
  firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone', jobTitle: 'job_title',
  departmentId: 'department_id', managerId: 'manager_id', hireDate: 'hire_date', salary: 'salary', status: 'status',
};

router.put('/:id', authorize('admin'), validate({ params: idParam, body: updateSchema }), asyncHandler(async (req, res) => {
  const id = req.params.id;
  await withTransaction(async (c) => {
    const exists = await c.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE', [id]);
    if (!exists.rows[0]) throw new AppError(404, 'Employee not found');
    if ('managerId' in req.body) await assertManagerValid(c, req.body.managerId, id);

    const sets = []; const params = [];
    for (const [key, col] of Object.entries(COLUMN)) {
      if (key in req.body) { params.push(req.body[key] ?? null); sets.push(`${col} = $${params.length}`); }
    }
    if (sets.length) {
      params.push(id);
      await c.query(`UPDATE employees SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    }
    if (req.body.email) await c.query('UPDATE users SET email=$1 WHERE employee_id=$2', [req.body.email, id]);
    if (req.body.role) {
      if (req.body.role !== 'admin' && Number(id) === req.user.employeeId) throw new AppError(400, 'You cannot remove your own admin role');
      await c.query('UPDATE users SET role=$1 WHERE employee_id=$2', [req.body.role, id]);
    }
    if (req.body.status) await c.query('UPDATE users SET is_active=$1 WHERE employee_id=$2', [req.body.status === 'active', id]);
    await audit(c, req.user.id, 'update', 'employee', Number(id), { ...req.body, salary: undefined });
  });
  const { rows } = await query(`${SELECT} WHERE e.id=$1`, [id]);
  res.json(rows[0]);
}));

// Employees are never hard-deleted (leave history / audit integrity). Deactivate instead.
router.delete('/:id', authorize('admin'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  if (Number(req.params.id) === req.user.employeeId) throw new AppError(400, 'You cannot deactivate your own account');
  await withTransaction(async (c) => {
    const r = await c.query("UPDATE employees SET status='inactive', updated_at=now() WHERE id=$1 RETURNING id", [req.params.id]);
    if (!r.rows[0]) throw new AppError(404, 'Employee not found');
    await c.query('UPDATE users SET is_active=FALSE WHERE employee_id=$1', [req.params.id]);
    await audit(c, req.user.id, 'deactivate', 'employee', Number(req.params.id));
  });
  res.status(204).end();
}));

module.exports = router;
