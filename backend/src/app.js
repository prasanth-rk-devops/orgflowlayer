const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { env } = require('./config/env');
const { query } = require('./db/pool');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.corsOrigin.length ? env.corsOrigin : false, credentials: false }));
// The import endpoint carries a whole CSV file; everything else stays small. Must come before the global parser.
app.use('/api/employees/import', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '100kb' }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/api/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ status: 'ok', uptime: process.uptime() }); }
  catch { res.status(503).json({ status: 'db_unavailable' }); }
});

app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/employees', require('./modules/employees/employees.routes'));
app.use('/api/departments', require('./modules/departments/departments.routes'));
app.use('/api/leave', require('./modules/leave/leave.routes'));
app.use('/api/holidays', require('./modules/holidays/holidays.routes'));
app.use('/api/announcements', require('./modules/announcements/announcements.routes'));
app.use('/api/notifications', require('./modules/notifications/notifications.routes'));
app.use('/api/reports', require('./modules/reports/reports.routes'));
app.use('/api/dashboard', require('./modules/dashboard/dashboard.routes'));
app.use('/api/audit', require('./modules/audit/audit.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
