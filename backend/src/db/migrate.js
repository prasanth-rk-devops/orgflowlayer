const fs = require('fs');
const path = require('path');
const { assertEnv } = require('../config/env');
const { pool, withTransaction } = require('./pool');

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    console.log(`[migrate] applied ${file}`);
  }
}

module.exports = { migrate };

if (require.main === module) {
  assertEnv();
  migrate()
    .then(() => pool.end())
    .catch((e) => { console.error(e); process.exit(1); });
}
