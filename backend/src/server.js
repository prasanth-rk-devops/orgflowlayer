const { env, assertEnv } = require('./config/env');
assertEnv();
const app = require('./app');
const { pool } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { seed } = require('./db/seed');
const { purgeOld } = require('./utils/inapp');

async function connectWithRetry(retries = 20) {
  for (let i = 1; i <= retries; i += 1) {
    try { await pool.query('SELECT 1'); return; }
    catch (e) {
      console.log(`[db] waiting for database (${i}/${retries}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database not reachable');
}

(async () => {
  await connectWithRetry();
  await migrate();
  await seed();
  const server = app.listen(env.port, () => console.log(`[api] listening on :${env.port} (${env.nodeEnv})`));

  purgeOld();
  setInterval(purgeOld, 24 * 60 * 60 * 1000).unref();

  const shutdown = (sig) => {
    console.log(`[api] ${sig} received, shutting down`);
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch((e) => { console.error(e); process.exit(1); });
