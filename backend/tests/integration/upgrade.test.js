/** Integration tests for: password reset, holidays, CSV export, team calendar. Needs TEST_DATABASE_URL (wipes the DB). */
const request = require('supertest');
const crypto = require('crypto');

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

suite('OrgFlow upgrades (integration)', () => {
  let app; let pool; const tokens = {};
  const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const login = async (email, password) => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.token;
  };
  const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');

  beforeAll(async () => {
    app = require('../../src/app');
    ({ pool } = require('../../src/db/pool'));
    await require('../../src/db/migrate').migrate();
    await pool.query(`TRUNCATE notifications, announcements, password_resets, holidays, leave_attachments, leave_requests, audit_logs, users, employees, departments, leave_types RESTART IDENTITY CASCADE`);
    await require('../../src/db/seed').seed();
    tokens.admin = await login('admin@orgflow.local', 'Admin@12345');
    tokens.manager = await login('maya.patel@orgflow.local', 'Manager@12345');
    tokens.liam = await login('liam.chen@orgflow.local', 'Employee@12345');
  });
  afterAll(async () => { await pool.end(); });

  describe('password reset', () => {
    const insertToken = async (token, interval) => pool.query(
      `INSERT INTO password_resets(user_id, token_hash, expires_at)
       VALUES ((SELECT id FROM users WHERE email='sara.khan@orgflow.local'), $1, now() + $2::interval)`, [sha(token), interval]);

    test('forgot-password answers identically for known and unknown emails', async () => {
      const a = await request(app).post('/api/auth/forgot-password').send({ email: 'sara.khan@orgflow.local' });
      const b = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@nowhere.com' });
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body).toEqual(b.body);
    });
    test('a known email gets a stored hashed token, an unknown one does not', async () => {
      const { rows } = await pool.query('SELECT token_hash FROM password_resets');
      expect(rows.length).toBe(1);
      expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    });
    test('a valid token resets the password exactly once', async () => {
      const token = 'a'.repeat(64);
      await insertToken(token, '1 hour');
      const ok = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Brand9New' });
      expect(ok.status).toBe(200);
      await login('sara.khan@orgflow.local', 'Brand9New');
      const again = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Another9One' });
      expect(again.status).toBe(400);
    });
    test('an expired token is rejected', async () => {
      const token = 'b'.repeat(64);
      await insertToken(token, '-1 minute');
      const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Brand9New' });
      expect(res.status).toBe(400);
    });
    test('a weak new password is rejected by validation', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({ token: 'c'.repeat(64), newPassword: 'weak' });
      expect(res.status).toBe(400);
    });
  });

  describe('holidays', () => {
    test('employee can list but not create', async () => {
      expect((await request(app).get('/api/holidays?year=2030').set(auth('liam'))).status).toBe(200);
      const res = await request(app).post('/api/holidays').set(auth('liam')).send({ date: '2030-03-05', name: 'Nope' });
      expect(res.status).toBe(403);
    });
    test('admin creates a holiday; duplicates and bad dates are rejected', async () => {
      const res = await request(app).post('/api/holidays').set(auth('admin')).send({ date: '2030-03-05', name: 'Founders Day' });
      expect(res.status).toBe(201);
      expect((await request(app).post('/api/holidays').set(auth('admin')).send({ date: '2030-03-05', name: 'Again' })).status).toBe(409);
      expect((await request(app).post('/api/holidays').set(auth('admin')).send({ date: '2030-13-45', name: 'Bad' })).status).toBe(400);
    });
    test('holidays are not counted as leave days', async () => {
      const types = (await request(app).get('/api/leave/types').set(auth('liam'))).body;
      const annual = types.find((t) => t.name === 'Annual Leave').id;
      // Mon 2030-03-04 + Tue 2030-03-05 (holiday) => 1 working day
      const res = await request(app).post('/api/leave').set(auth('liam'))
        .send({ leaveTypeId: annual, startDate: '2030-03-04', endDate: '2030-03-05' });
      expect(res.status).toBe(201);
      expect(res.body.days).toBe(1);
      await request(app).patch(`/api/leave/${res.body.id}/review`).set(auth('manager')).send({ decision: 'approved' });
    });
    test('a request that is only a holiday is rejected', async () => {
      const types = (await request(app).get('/api/leave/types').set(auth('manager'))).body;
      const res = await request(app).post('/api/leave').set(auth('manager'))
        .send({ leaveTypeId: types[0].id, startDate: '2030-03-05', endDate: '2030-03-05' });
      expect(res.status).toBe(400);
    });
  });

  describe('team calendar', () => {
    test('shows approved leave and holidays for the month', async () => {
      const res = await request(app).get('/api/leave/calendar?month=2030-03').set(auth('liam'));
      expect(res.status).toBe(200);
      expect(res.body.leave.some((l) => l.name === 'Liam Chen' && l.startDate === '2030-03-04')).toBe(true);
      expect(res.body.holidays[0].name).toBe('Founders Day');
    });
    test('rejects a malformed month', async () => {
      expect((await request(app).get('/api/leave/calendar?month=2030-3').set(auth('liam'))).status).toBe(400);
    });
  });

  describe('session invalidation', () => {
    test('changing the password revokes older sessions but returns a working new one', async () => {
      const old = await login('sara.khan@orgflow.local', 'Brand9New'); // set by the reset test above
      await new Promise((r) => setTimeout(r, 1100)); // JWT iat has 1-second resolution
      const res = await request(app).post('/api/auth/change-password').set({ Authorization: `Bearer ${old}` })
        .send({ currentPassword: 'Brand9New', newPassword: 'Changed123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${old}` })).status).toBe(401);
      expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` })).status).toBe(200);
    });
  });

  describe('CSV exports', () => {
    test('admin downloads employees as CSV', async () => {
      const res = await request(app).get('/api/employees/export.csv').set(auth('admin'));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text).toContain('First name');
      expect(res.text).toContain('liam.chen@orgflow.local');
    });
    test('admin downloads the leave report, filtered by year', async () => {
      const res = await request(app).get('/api/leave/export.csv?year=2030').set(auth('admin'));
      expect(res.status).toBe(200);
      expect(res.text).toContain('Liam Chen');
      const none = await request(app).get('/api/leave/export.csv?year=2040').set(auth('admin'));
      expect(none.text.trim().split('\n').length).toBe(1); // header only
    });
    test('non-admins cannot export', async () => {
      expect((await request(app).get('/api/employees/export.csv').set(auth('manager'))).status).toBe(403);
      expect((await request(app).get('/api/leave/export.csv').set(auth('liam'))).status).toBe(403);
    });
  });
});
