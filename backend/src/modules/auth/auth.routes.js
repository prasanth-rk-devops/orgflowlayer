const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { env } = require('../../config/env');
const { query, withTransaction } = require('../../db/pool');
const notify = require('../../utils/notifications');
const { authenticate } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const passwordRule = z.string().min(8, 'Min 8 characters')
  .regex(/[A-Z]/, 'Needs an uppercase letter').regex(/[0-9]/, 'Needs a number');

const profileSql = `
  SELECT u.id, u.email, u.role, u.employee_id AS "employeeId",
         e.first_name AS "firstName", e.last_name AS "lastName", e.job_title AS "jobTitle"
  FROM users u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.id = $1`;

router.post('/login',
  loginLimiter,
  validate({ body: z.object({ email: z.string().email(), password: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    const user = rows[0];
    // Same message for unknown user / wrong password to avoid account enumeration.
    const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash));
    if (!ok) throw new AppError(401, 'Incorrect email or password');

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    await audit(null, user.id, 'login', 'user', user.id);
    const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
    const profile = (await query(profileSql, [user.id])).rows[0];
    res.json({ token, user: profile });
  }));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json((await query(profileSql, [req.user.id])).rows[0]);
}));

router.post('/change-password',
  authenticate,
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: passwordRule }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(req.body.currentPassword, rows[0].password_hash))) {
      throw new AppError(400, 'Current password is incorrect');
    }
    const hash = await bcrypt.hash(req.body.newPassword, 12);
    // Signing out other devices: every session issued before this moment stops working.
    await query('UPDATE users SET password_hash = $1, password_changed_at = $2 WHERE id = $3', [hash, new Date(), req.user.id]);
    await audit(null, req.user.id, 'change_password', 'user', req.user.id);
    const token = jwt.sign({ sub: req.user.id, role: req.user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
    res.json({ message: 'Password updated', token });
  }));

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.nodeEnv === 'test' ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset requests. Try again later.' },
});
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

// Always answers the same way so nobody can discover which emails have accounts.
router.post('/forgot-password',
  resetLimiter,
  validate({ body: z.object({ email: z.string().email() }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT id, email FROM users WHERE lower(email) = lower($1) AND is_active', [req.body.email]);
    const user = rows[0];
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await query(`INSERT INTO password_resets(user_id, token_hash, expires_at)
                   VALUES ($1, $2, now() + interval '1 hour')`, [user.id, sha256(token)]);
      notify.sendMail({
        to: user.email,
        subject: 'Reset your OrgFlow password',
        text: `Someone asked to reset your OrgFlow password.\n\nOpen this link within 1 hour:\n${env.appUrl}/reset-password?token=${token}\n\nIf this was not you, ignore this email: your password stays the same.`,
      }).catch(() => {});
      await audit(null, user.id, 'forgot_password', 'user', user.id);
    }
    res.json({ message: 'If that email has an account, a reset link is on its way.' });
  }));

router.post('/reset-password',
  resetLimiter,
  validate({ body: z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid token'), newPassword: passwordRule }) }),
  asyncHandler(async (req, res) => {
    await withTransaction(async (c) => {
      const r = (await c.query(
        `SELECT id, user_id FROM password_resets
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [sha256(req.body.token)])).rows[0];
      if (!r) throw new AppError(400, 'This reset link is invalid or has expired');
      const hash = await bcrypt.hash(req.body.newPassword, 12);
      await c.query('UPDATE users SET password_hash = $1, password_changed_at = $2 WHERE id = $3', [hash, new Date(), r.user_id]);
      await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [r.user_id]);
      await audit(c, r.user_id, 'reset_password', 'user', r.user_id);
    });
    res.json({ message: 'Password updated. You can sign in now.' });
  }));

module.exports = router;
