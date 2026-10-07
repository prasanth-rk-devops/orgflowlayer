const { query } = require('../db/pool');

/** In-app notifications (the bell). Failures are logged, never thrown: they must not break the action that caused them. */
async function create(userIds, { kind, title, body = null, link = null }) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    await query(
      `INSERT INTO notifications(user_id, kind, title, body, link)
       SELECT u, $2, $3, $4, $5 FROM unnest($1::int[]) AS u`,
      [ids, kind, title.slice(0, 160), body, link]);
  } catch (e) { console.error('[inapp] failed:', e.message); }
}

async function toAllActiveUsers(exceptUserId, payload) {
  try {
    const { rows } = await query('SELECT id FROM users WHERE is_active AND id <> $1', [exceptUserId || 0]);
    await create(rows.map((r) => r.id), payload);
  } catch (e) { console.error('[inapp] broadcast failed:', e.message); }
}

/** Housekeeping: read items after 60 days, anything after 180 days. */
async function purgeOld() {
  try {
    const r = await query(
      `DELETE FROM notifications
       WHERE (read_at IS NOT NULL AND read_at < now() - interval '60 days') OR created_at < now() - interval '180 days'`);
    if (r.rowCount) console.log(`[inapp] purged ${r.rowCount} old notifications`);
  } catch (e) { console.error('[inapp] purge failed:', e.message); }
}

module.exports = { create, toAllActiveUsers, purgeOld };
