const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');
const { isoDate } = require('../../utils/validators');

router.use(authenticate);

router.get('/', validate({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, holiday_date::text AS date, name FROM holidays
       WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM holiday_date) = $1) ORDER BY holiday_date`, [req.query.year ?? null]);
    res.json(rows);
  }));

router.post('/', authorize('admin'),
  validate({ body: z.object({ date: isoDate, name: z.string().trim().min(2).max(100) }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'INSERT INTO holidays(holiday_date, name) VALUES ($1,$2) RETURNING id, holiday_date::text AS date, name',
      [req.body.date, req.body.name]);
    await audit(null, req.user.id, 'create', 'holiday', rows[0].id, req.body);
    res.status(201).json(rows[0]);
  }));

router.delete('/:id', authorize('admin'), validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM holidays WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows[0]) throw new AppError(404, 'Holiday not found');
    await audit(null, req.user.id, 'delete', 'holiday', r.rows[0].id);
    res.status(204).end();
  }));

module.exports = router;
