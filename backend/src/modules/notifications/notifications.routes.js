const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../../db/pool');
const { authenticate } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');

router.use(authenticate);

// Everything here is scoped to the signed-in user; there is no way to read someone else's notifications.
router.get('/', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }) }),
  asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
      query(`SELECT id, kind, title, body, link, (read_at IS NOT NULL) AS read, created_at AS "createdAt"
             FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`, [req.user.id, req.query.limit]),
      query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]),
    ]);
    res.json({ unreadCount: unread.rows[0].n, items: items.rows });
  }));

router.post('/read-all', asyncHandler(async (req, res) => {
  const r = await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({ updated: r.rowCount });
}));

router.patch('/:id/read', validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const r = await query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]);
    if (!r.rows[0]) throw new AppError(404, 'Notification not found');
    res.json({ id: r.rows[0].id, read: true });
  }));

module.exports = router;
