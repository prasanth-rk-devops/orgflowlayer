const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');

const idParam = z.object({ id: z.coerce.number().int().positive() });
const body = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
});

router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(`
    SELECT d.id, d.name, d.description, COUNT(e.id) FILTER (WHERE e.status='active')::int AS "employeeCount"
    FROM departments d LEFT JOIN employees e ON e.department_id = d.id
    GROUP BY d.id ORDER BY d.name`);
  res.json(rows);
}));

router.post('/', authorize('admin'), validate({ body }), asyncHandler(async (req, res) => {
  const { rows } = await query(
    'INSERT INTO departments(name, description) VALUES ($1,$2) RETURNING *', [req.body.name, req.body.description ?? null]);
  await audit(null, req.user.id, 'create', 'department', rows[0].id, req.body);
  res.status(201).json(rows[0]);
}));

router.put('/:id', authorize('admin'), validate({ params: idParam, body }), asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE departments SET name=$1, description=$2 WHERE id=$3 RETURNING *',
    [req.body.name, req.body.description ?? null, req.params.id]);
  if (!rows[0]) throw new AppError(404, 'Department not found');
  await audit(null, req.user.id, 'update', 'department', rows[0].id, req.body);
  res.json(rows[0]);
}));

router.delete('/:id', authorize('admin'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM employees WHERE department_id=$1', [req.params.id]);
  if (rows[0].n > 0) throw new AppError(409, 'Move or remove the employees in this department first');
  const del = await query('DELETE FROM departments WHERE id=$1 RETURNING id', [req.params.id]);
  if (!del.rows[0]) throw new AppError(404, 'Department not found');
  await audit(null, req.user.id, 'delete', 'department', del.rows[0].id);
  res.status(204).end();
}));

module.exports = router;
