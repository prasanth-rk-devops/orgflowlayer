const router = require('express').Router();
const { z } = require('zod');
const { query, withTransaction } = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');
const { businessDays } = require('../../utils/dates');
const { sendCsv } = require('../../utils/csv');
const notify = require('../../utils/notifications');
const upload = require('../../middleware/upload');
const fs = require('fs');
const path = require('path');
const { env } = require('../../config/env');

const MAX_ATTACHMENTS = 3;

const { isoDate } = require('../../utils/validators');
const idParam = z.object({ id: z.coerce.number().int().positive() });

const createSchema = z.object({
  leaveTypeId: z.coerce.number().int().positive(),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().trim().max(500).optional().nullable(),
}).refine((d) => d.endDate >= d.startDate, { message: 'End date must be on or after start date', path: ['endDate'] });

const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(500).optional().nullable(),
});

const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  scope: z.enum(['mine', 'team', 'all']).default('mine'),
});

const SELECT = `
  SELECT r.id, r.employee_id AS "employeeId", e.first_name || ' ' || e.last_name AS "employeeName",
         r.leave_type_id AS "leaveTypeId", t.name AS "leaveType",
         r.start_date::text AS "startDate", r.end_date::text AS "endDate", r.days, r.reason, r.status,
         r.review_note AS "reviewNote", r.reviewed_at AS "reviewedAt", r.created_at AS "createdAt",
         COALESCE((SELECT json_agg(json_build_object('id', a.id, 'name', a.original_name, 'size', a.size_bytes) ORDER BY a.id)
                   FROM leave_attachments a WHERE a.leave_request_id = r.id), '[]'::json) AS attachments
  FROM leave_requests r
  JOIN employees e ON e.id = r.employee_id
  JOIN leave_types t ON t.id = r.leave_type_id`;

router.use(authenticate);

router.get('/types', asyncHandler(async (_req, res) => {
  res.json((await query('SELECT id, name, annual_days AS "annualDays" FROM leave_types ORDER BY id')).rows);
}));

/** Remaining days per leave type for the current calendar year (pending + approved count as used). */
router.get('/balance', asyncHandler(async (req, res) => {
  if (!req.user.employeeId) return res.json([]);
  const year = new Date().getUTCFullYear();
  const { rows } = await query(`
    SELECT t.id AS "leaveTypeId", t.name, t.annual_days AS "annualDays",
           COALESCE(SUM(r.days) FILTER (WHERE r.status='approved'), 0)::int AS used,
           COALESCE(SUM(r.days) FILTER (WHERE r.status='pending'), 0)::int AS pending
    FROM leave_types t
    LEFT JOIN leave_requests r ON r.leave_type_id = t.id AND r.employee_id = $1
         AND EXTRACT(YEAR FROM r.start_date) = $2 AND r.status IN ('approved','pending')
    GROUP BY t.id ORDER BY t.id`, [req.user.employeeId, year]);
  res.json(rows.map((r) => ({ ...r, remaining: r.annualDays - r.used - r.pending, year })));
}));

router.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const { status, scope } = req.query;
  const where = []; const params = [];

  if (scope === 'all') {
    if (req.user.role !== 'admin') throw new AppError(403, 'Only admins can view all requests');
  } else if (scope === 'team') {
    if (req.user.role === 'employee') throw new AppError(403, 'Only managers can view team requests');
    if (req.user.role === 'manager') { params.push(req.user.employeeId); where.push(`e.manager_id = $${params.length}`); }
    else where.push('e.manager_id IS NOT NULL'); // admin "team" = everyone with a manager
  } else {
    params.push(req.user.employeeId); where.push(`r.employee_id = $${params.length}`);
  }
  if (status) { params.push(status); where.push(`r.status = $${params.length}`); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT} ${clause} ORDER BY r.created_at DESC LIMIT 200`, params);
  res.json(rows);
}));

/** Approved leave and company holidays for one month (YYYY-MM): feeds the team calendar. */
router.get('/calendar',
  validate({ query: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }) }),
  asyncHandler(async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const [leave, holidays] = await Promise.all([
      query(`SELECT e.first_name || ' ' || e.last_name AS name, t.name AS "leaveType",
                    r.start_date::text AS "startDate", r.end_date::text AS "endDate"
             FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.leave_type_id
             WHERE r.status = 'approved' AND r.start_date <= $2 AND r.end_date >= $1 ORDER BY r.start_date, name`, [first, last]),
      query('SELECT holiday_date::text AS date, name FROM holidays WHERE holiday_date BETWEEN $1 AND $2 ORDER BY holiday_date', [first, last]),
    ]);
    res.json({ month, leave: leave.rows, holidays: holidays.rows });
  }));

router.get('/export.csv', authorize('admin'),
  validate({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT e.first_name || ' ' || e.last_name AS employee, e.email, t.name AS type,
              r.start_date::text AS start, r.end_date::text AS "end", r.days, r.status,
              r.review_note AS note, r.created_at::text AS created
       FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.leave_type_id
       WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM r.start_date) = $1::int)
       ORDER BY r.start_date DESC`, [req.query.year ?? null]);
    await audit(null, req.user.id, 'export', 'leave_request', null, { rows: rows.length });
    sendCsv(res, `leave-${req.query.year || 'all'}.csv`, [
      { key: 'employee', label: 'Employee' }, { key: 'email', label: 'Email' }, { key: 'type', label: 'Leave type' },
      { key: 'start', label: 'Start' }, { key: 'end', label: 'End' }, { key: 'days', label: 'Working days' },
      { key: 'status', label: 'Status' }, { key: 'note', label: 'Reviewer note' }, { key: 'created', label: 'Requested at' },
    ], rows);
  }));

router.post('/', validate({ body: createSchema }), asyncHandler(async (req, res) => {
  if (!req.user.employeeId) throw new AppError(400, 'Your account is not linked to an employee profile');
  const { leaveTypeId, startDate, endDate, reason } = req.body;

  if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
    throw new AppError(400, 'Requests cannot span two calendar years. Please submit one request per year.');
  }
  const holidays = (await query(
    'SELECT holiday_date::text AS d FROM holidays WHERE holiday_date BETWEEN $1 AND $2', [startDate, endDate])).rows.map((r) => r.d);
  const days = businessDays(startDate, endDate, holidays);
  if (days < 1) throw new AppError(400, 'The selected range contains no working days');

  const created = await withTransaction(async (c) => {
    // Lock the employee row so two simultaneous requests cannot both pass the balance check.
    await c.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE', [req.user.employeeId]);

    const type = (await c.query('SELECT * FROM leave_types WHERE id=$1', [leaveTypeId])).rows[0];
    if (!type) throw new AppError(400, 'Unknown leave type');

    const overlap = await c.query(
      `SELECT 1 FROM leave_requests WHERE employee_id=$1 AND status IN ('pending','approved')
       AND start_date <= $3 AND end_date >= $2 LIMIT 1`, [req.user.employeeId, startDate, endDate]);
    if (overlap.rows[0]) throw new AppError(409, 'You already have a request that overlaps these dates');

    const used = (await c.query(
      `SELECT COALESCE(SUM(days),0)::int AS n FROM leave_requests
       WHERE employee_id=$1 AND leave_type_id=$2 AND status IN ('pending','approved')
       AND EXTRACT(YEAR FROM start_date) = $3`, [req.user.employeeId, leaveTypeId, Number(startDate.slice(0, 4))])).rows[0].n;
    if (used + days > type.annual_days) {
      throw new AppError(422, `Not enough ${type.name} balance: ${type.annual_days - used} day(s) left, ${days} requested`);
    }

    const r = await c.query(
      `INSERT INTO leave_requests(employee_id, leave_type_id, start_date, end_date, days, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.user.employeeId, leaveTypeId, startDate, endDate, days, reason ?? null]);
    await audit(c, req.user.id, 'create', 'leave_request', r.rows[0].id, { startDate, endDate, days });
    return r.rows[0].id;
  });
  notify.leaveSubmitted(created).catch(() => {});
  res.status(201).json((await query(`${SELECT} WHERE r.id=$1`, [created])).rows[0]);
}));

router.patch('/:id/review', authorize('admin', 'manager'),
  validate({ params: idParam, body: reviewSchema }),
  asyncHandler(async (req, res) => {
    await withTransaction(async (c) => {
      const r = (await c.query(
        `SELECT r.*, e.manager_id FROM leave_requests r JOIN employees e ON e.id = r.employee_id
         WHERE r.id=$1 FOR UPDATE OF r`, [req.params.id])).rows[0];
      if (!r) throw new AppError(404, 'Leave request not found');
      if (r.status !== 'pending') throw new AppError(409, `This request is already ${r.status}`);
      if (r.employee_id === req.user.employeeId) throw new AppError(403, 'You cannot review your own request');
      const isTheirManager = r.manager_id && r.manager_id === req.user.employeeId;
      if (req.user.role !== 'admin' && !isTheirManager) throw new AppError(403, 'Only the employee\'s manager or an admin can review this request');

      await c.query(
        `UPDATE leave_requests SET status=$1, review_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4`,
        [req.body.decision, req.body.note ?? null, req.user.id, r.id]);
      await audit(c, req.user.id, req.body.decision, 'leave_request', r.id, { note: req.body.note });
    });
    notify.leaveReviewed(req.params.id).catch(() => {});
    res.json((await query(`${SELECT} WHERE r.id=$1`, [req.params.id])).rows[0]);
  }));

router.patch('/:id/cancel', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE leave_requests SET status='cancelled'
     WHERE id=$1 AND employee_id=$2 AND status='pending' RETURNING id`, [req.params.id, req.user.employeeId]);
  if (!rows[0]) throw new AppError(404, 'No pending request of yours with this id');
  await audit(null, req.user.id, 'cancel', 'leave_request', rows[0].id);
  res.json((await query(`${SELECT} WHERE r.id=$1`, [rows[0].id])).rows[0]);
}));

// ---------- Attachments (e.g. medical certificate) ----------
const attParams = idParam.extend({ fileId: z.coerce.number().int().positive() });

/** Owner, the owner's manager, or an admin may see a request's files. */
async function loadRequestForAccess(user, id) {
  const row = (await query(
    `SELECT r.id, r.employee_id, r.status, e.manager_id FROM leave_requests r
     JOIN employees e ON e.id = r.employee_id WHERE r.id = $1`, [id])).rows[0];
  if (!row) throw new AppError(404, 'Leave request not found');
  const isOwner = row.employee_id === user.employeeId;
  const isManager = row.manager_id && row.manager_id === user.employeeId;
  if (!isOwner && !isManager && user.role !== 'admin') throw new AppError(403, 'You do not have access to this request');
  return { row, isOwner };
}

const discard = (file) => file && fs.unlink(file.path, () => {});

router.post('/:id/attachments', validate({ params: idParam }), upload.single('file'),
  asyncHandler(async (req, res) => {
    try {
      if (!req.file) throw new AppError(400, 'Choose a file to upload');
      const { row, isOwner } = await loadRequestForAccess(req.user, req.params.id);
      if (!isOwner) throw new AppError(403, 'Only the requester can add files');
      if (row.status !== 'pending') throw new AppError(409, 'Files can only be added while the request is pending');
      const count = (await query('SELECT COUNT(*)::int AS n FROM leave_attachments WHERE leave_request_id=$1', [row.id])).rows[0].n;
      if (count >= MAX_ATTACHMENTS) throw new AppError(409, `You can attach up to ${MAX_ATTACHMENTS} files per request`);

      const { rows } = await query(
        `INSERT INTO leave_attachments(leave_request_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, original_name AS name, size_bytes AS size`,
        [row.id, req.file.originalname.slice(0, 255), req.file.filename, req.file.mimetype, req.file.size, req.user.id]);
      await audit(null, req.user.id, 'upload', 'leave_request', row.id, { file: rows[0].name });
      res.status(201).json(rows[0]);
    } catch (e) { discard(req.file); throw e; }
  }));

router.get('/:id/attachments/:fileId', validate({ params: attParams }), asyncHandler(async (req, res) => {
  await loadRequestForAccess(req.user, req.params.id);
  const a = (await query('SELECT * FROM leave_attachments WHERE id=$1 AND leave_request_id=$2',
    [req.params.fileId, req.params.id])).rows[0];
  if (!a) throw new AppError(404, 'File not found');
  const full = path.join(env.uploadDir, a.stored_name);
  if (!fs.existsSync(full)) throw new AppError(404, 'File is no longer available');
  res.download(full, a.original_name);
}));

router.delete('/:id/attachments/:fileId', validate({ params: attParams }), asyncHandler(async (req, res) => {
  const { row, isOwner } = await loadRequestForAccess(req.user, req.params.id);
  if (!isOwner || row.status !== 'pending') throw new AppError(403, 'Files can only be removed by the requester while pending');
  const del = await query('DELETE FROM leave_attachments WHERE id=$1 AND leave_request_id=$2 RETURNING stored_name',
    [req.params.fileId, req.params.id]);
  if (!del.rows[0]) throw new AppError(404, 'File not found');
  fs.unlink(path.join(env.uploadDir, del.rows[0].stored_name), () => {});
  await audit(null, req.user.id, 'remove_file', 'leave_request', row.id);
  res.status(204).end();
}));

module.exports = router;
