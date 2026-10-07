const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate, authorize('admin'));

router.get('/', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT a.id, a.action, a.entity, a.entity_id AS "entityId", a.details, a.created_at AS "createdAt",
             u.email AS "userEmail"
      FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT $1`, [req.query.limit]);
    res.json(rows);
  }));

module.exports = router;
