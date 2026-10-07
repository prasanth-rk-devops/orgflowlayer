const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const AppError = require('../utils/AppError');
const { query } = require('../db/pool');

async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'Authentication required');

    let payload;
    try { payload = jwt.verify(token, env.jwtSecret); }
    catch { throw new AppError(401, 'Invalid or expired token'); }

    // Re-check the user on every request so deactivation takes effect immediately.
    const { rows } = await query(
      'SELECT id, email, role, employee_id, is_active, password_changed_at FROM users WHERE id = $1', [payload.sub]);
    const u = rows[0];
    if (!u || !u.is_active) throw new AppError(401, 'Account is disabled or no longer exists');

    if (payload.iat < Math.floor(new Date(u.password_changed_at).getTime() / 1000)) {
      throw new AppError(401, 'Your session has expired. Please sign in again.');
    }

    req.user = { id: u.id, email: u.email, role: u.role, employeeId: u.employee_id };
    next();
  } catch (err) { next(err); }
}

const authorize = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new AppError(403, 'You do not have permission to do this'));

module.exports = { authenticate, authorize };
