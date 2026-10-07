const { query } = require('../db/pool');

/** Best-effort audit trail. Never blocks the main request on failure. */
async function audit(client, userId, action, entity, entityId, details = null) {
  try {
    await (client || { query }).query(
      'INSERT INTO audit_logs(user_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [userId, action, entity, entityId, details ? JSON.stringify(details) : null]);
  } catch (e) {
    console.error('[audit] failed', e.message);
  }
}
module.exports = { audit };
