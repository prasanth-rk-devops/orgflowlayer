const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');
const inapp = require('../../utils/inapp');

const idParam = z.object({ id: z.coerce.number().int().positive() });

const SELECT = `
  SELECT a.id, a.title, a.body, a.pinned, a.created_at AS "createdAt",
         COALESCE(e.first_name || ' ' || e.last_name, u.email, 'Former admin') AS "authorName"
  FROM announcements a
  LEFT JOIN users u ON u.id = a.author_id
  LEFT JOIN employees e ON e.id = u.employee_id`;

router.use(authenticate);

router.get('/', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${SELECT} ORDER BY a.pinned DESC, a.created_at DESC LIMIT $1`, [req.query.limit]);
    res.json(rows);
  }));

router.post('/', authorize('admin'),
  validate({ body: z.object({
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(1).max(2000),
    pinned: z.boolean().optional().default(false),
  }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'INSERT INTO announcements(title, body, pinned, author_id) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.body.title, req.body.body, req.body.pinned, req.user.id]);
    await audit(null, req.user.id, 'create', 'announcement', rows[0].id, { title: req.body.title });
    await inapp.toAllActiveUsers(req.user.id, {
      kind: 'announcement', title: req.body.title, body: req.body.body.slice(0, 140), link: '/announcements' });
    res.status(201).json((await query(`${SELECT} WHERE a.id = $1`, [rows[0].id])).rows[0]);
  }));

router.patch('/:id', authorize('admin'),
  validate({ params: idParam, body: z.object({ pinned: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const r = await query('UPDATE announcements SET pinned = $1 WHERE id = $2 RETURNING id', [req.body.pinned, req.params.id]);
    if (!r.rows[0]) throw new AppError(404, 'Announcement not found');
    await audit(null, req.user.id, req.body.pinned ? 'pin' : 'unpin', 'announcement', r.rows[0].id);
    res.json((await query(`${SELECT} WHERE a.id = $1`, [r.rows[0].id])).rows[0]);
  }));

router.delete('/:id', authorize('admin'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  const r = await query('DELETE FROM announcements WHERE id = $1 RETURNING id', [req.params.id]);
  if (!r.rows[0]) throw new AppError(404, 'Announcement not found');
  await audit(null, req.user.id, 'delete', 'announcement', r.rows[0].id);
  res.status(204).end();
}));

module.exports = router;
