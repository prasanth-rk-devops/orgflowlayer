const { Pool } = require('pg');
const { env } = require('../config/env');

const pool = new Pool({ connectionString: env.databaseUrl, max: 10, idleTimeoutMillis: 30000 });

pool.on('error', (err) => console.error('Unexpected PG pool error', err));

const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside a transaction; commits on success, rolls back on error. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
