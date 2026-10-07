/**
 * Integration tests: real Express app + real PostgreSQL.
 * Run with:  TEST_DATABASE_URL=postgres://orgflow:orgflow@localhost:5432/orgflow_test npm test
 * WARNING: all tables in that database are wiped. Use a dedicated test database.
 */
const request = require('supertest');

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

suite('OrgFlow API (integration)', () => {
  let app; let pool; let tokens = {};

  const login = async (email, password) => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.token;
  };
  const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    app = require('../../src/app');
    ({ pool } = require('../../src/db/pool'));
    const { migrate } = require('../../src/db/migrate');
    const { seed } = require('../../src/db/seed');
    await migrate();
    await pool.query(`TRUNCATE notifications, announcements, password_resets, holidays, leave_attachments, leave_requests, audit_logs, users, employees, departments, leave_types RESTART IDENTITY CASCADE`);
    await seed();
    tokens.admin = await login('admin@orgflow.local', 'Admin@12345');
    tokens.manager = await login('maya.patel@orgflow.local', 'Manager@12345');
    tokens.liam = await login('liam.chen@orgflow.local', 'Employee@12345');
    tokens.sara = await login('sara.khan@orgflow.local', 'Employee@12345');
  });

  afterAll(async () => { await pool.end(); });

  describe('auth', () => {
    test('health check works', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    });
    test('rejects wrong password with a generic message', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'admin@orgflow.local', password: 'nope' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Incorrect email or password');
    });
    test('rejects malformed login body', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'bad' });
      expect(res.status).toBe(400);
    });
    test('protected route needs a token', async () => {
      expect((await request(app).get('/api/employees')).status).toBe(401);
    });
    test('/me returns the profile', async () => {
      const res = await request(app).get('/api/auth/me').set(auth('liam'));
      expect(res.body.role).toBe('employee');
      expect(res.body.firstName).toBe('Liam');
    });
  });

  describe('employees & permissions', () => {
    test('employee can list people but never sees salaries', async () => {
      const res = await request(app).get('/api/employees').set(auth('liam'));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
      expect(res.body.data.every((e) => e.salary === undefined)).toBe(true);
    });
    test('admin sees salaries', async () => {
      const res = await request(app).get('/api/employees').set(auth('admin'));
      expect(res.body.data[0].salary).toBeDefined();
    });
    test('employee cannot create employees', async () => {
      const res = await request(app).post('/api/employees').set(auth('liam')).send({});
      expect(res.status).toBe(403);
    });
    test('admin creates an employee with a login, who can then sign in', async () => {
      const res = await request(app).post('/api/employees').set(auth('admin')).send({
        firstName: 'Nina', lastName: 'Roy', email: 'nina.roy@orgflow.local', jobTitle: 'Accountant',
        hireDate: '2026-01-05', createLogin: true, password: 'Welcome123', role: 'employee',
      });
      expect(res.status).toBe(201);
      expect(res.body.hasLogin).toBe(true);
      await login('nina.roy@orgflow.local', 'Welcome123');
    });
    test('duplicate email returns 409', async () => {
      const res = await request(app).post('/api/employees').set(auth('admin')).send({
        firstName: 'X', lastName: 'Y', email: 'nina.roy@orgflow.local', jobTitle: 'Dup', hireDate: '2026-01-05' });
      expect(res.status).toBe(409);
    });
    test('circular reporting line is rejected', async () => {
      const list = (await request(app).get('/api/employees?search=maya').set(auth('admin'))).body.data[0];
      const liam = (await request(app).get('/api/employees?search=liam').set(auth('admin'))).body.data[0];
      const res = await request(app).put(`/api/employees/${list.id}`).set(auth('admin')).send({ managerId: liam.id });
      expect(res.status).toBe(400);
    });
    test('deactivated employee can no longer use their token', async () => {
      const nina = (await request(app).get("/api/employees?search=nina").set(auth("admin"))).body.data[0];
      const t = await login('nina.roy@orgflow.local', 'Welcome123');
      expect((await request(app).delete(`/api/employees/${nina.id}`).set(auth('admin'))).status).toBe(204);
      expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${t}` })).status).toBe(401);
    });
  });

  describe('leave workflow', () => {
    let types; let requestId;
    beforeAll(async () => {
      types = (await request(app).get('/api/leave/types').set(auth('liam'))).body;
    });
    const annual = () => types.find((t) => t.name === 'Annual Leave').id;
    const sick = () => types.find((t) => t.name === 'Sick Leave').id;

    test('creates a request and counts only weekdays', async () => {
      // 2030-03-04 is a Monday
      const res = await request(app).post('/api/leave').set(auth('liam'))
        .send({ leaveTypeId: annual(), startDate: '2030-03-04', endDate: '2030-03-05', reason: 'Trip' });
      expect(res.status).toBe(201);
      expect(res.body.days).toBe(2);
      expect(res.body.status).toBe('pending');
      requestId = res.body.id;
    });
    test('overlapping request is rejected', async () => {
      const res = await request(app).post('/api/leave').set(auth('liam'))
        .send({ leaveTypeId: annual(), startDate: '2030-03-05', endDate: '2030-03-06' });
      expect(res.status).toBe(409);
    });
    test('request above the remaining balance is rejected', async () => {
      const res = await request(app).post('/api/leave').set(auth('liam'))
        .send({ leaveTypeId: sick(), startDate: '2030-04-01', endDate: '2030-04-30' });
      expect(res.status).toBe(422);
    });
    test('weekend-only request is rejected', async () => {
      const res = await request(app).post('/api/leave').set(auth('liam'))
        .send({ leaveTypeId: annual(), startDate: '2030-03-09', endDate: '2030-03-10' });
      expect(res.status).toBe(400);
    });
    test('request spanning two years is rejected', async () => {
      const res = await request(app).post('/api/leave').set(auth('liam'))
        .send({ leaveTypeId: annual(), startDate: '2030-12-30', endDate: '2031-01-02' });
      expect(res.status).toBe(400);
    });
    test('an unrelated employee cannot review', async () => {
      const res = await request(app).patch(`/api/leave/${requestId}/review`).set(auth('sara')).send({ decision: 'approved' });
      expect(res.status).toBe(403);
    });
    test('manager sees it in the team queue and approves it', async () => {
      const list = await request(app).get('/api/leave?scope=team&status=pending').set(auth('manager'));
      expect(list.body.some((r) => r.id === requestId)).toBe(true);
      const res = await request(app).patch(`/api/leave/${requestId}/review`).set(auth('manager'))
        .send({ decision: 'approved', note: 'Enjoy' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
    });
    test('a decided request cannot be reviewed again', async () => {
      const res = await request(app).patch(`/api/leave/${requestId}/review`).set(auth('manager')).send({ decision: 'rejected' });
      expect(res.status).toBe(409);
    });
    test('balance reflects approved days', async () => {
      const bal = (await request(app).get('/api/leave/balance').set(auth('liam'))).body;
      const a = bal.find((b) => b.name === 'Annual Leave');
      expect(a.used).toBe(2);
      expect(a.remaining).toBe(18);
    });
    test('manager cannot approve their own request', async () => {
      const created = await request(app).post('/api/leave').set(auth('manager'))
        .send({ leaveTypeId: annual(), startDate: '2030-05-06', endDate: '2030-05-06' });
      expect(created.status).toBe(201);
      const res = await request(app).patch(`/api/leave/${created.body.id}/review`).set(auth('manager')).send({ decision: 'approved' });
      expect(res.status).toBe(403);
      // an admin can
      const ok = await request(app).patch(`/api/leave/${created.body.id}/review`).set(auth('admin')).send({ decision: 'approved' });
      expect(ok.status).toBe(200);
    });
    test('requester can cancel a pending request', async () => {
      const created = await request(app).post('/api/leave').set(auth('sara'))
        .send({ leaveTypeId: annual(), startDate: '2030-06-03', endDate: '2030-06-03' });
      const res = await request(app).patch(`/api/leave/${created.body.id}/cancel`).set(auth('sara'));
      expect(res.body.status).toBe('cancelled');
    });
    test('employees cannot view the team queue', async () => {
      expect((await request(app).get('/api/leave?scope=team').set(auth('liam'))).status).toBe(403);
    });
  });

  describe('attachments', () => {
    let reqId; let fileId;
    const pdf = Buffer.from('%PDF-1.4 test file');

    beforeAll(async () => {
      const types = (await request(app).get('/api/leave/types').set(auth('liam'))).body;
      const sick = types.find((t) => t.name === 'Sick Leave').id;
      const res = await request(app).post('/api/leave').set(auth('liam'))
        .send({ leaveTypeId: sick, startDate: '2030-07-01', endDate: '2030-07-01' });
      reqId = res.body.id;
    });

    test('requester uploads a PDF', async () => {
      const res = await request(app).post(`/api/leave/${reqId}/attachments`).set(auth('liam'))
        .attach('file', pdf, { filename: 'certificate.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('certificate.pdf');
      fileId = res.body.id;
    });
    test('disallowed file types are rejected', async () => {
      const res = await request(app).post(`/api/leave/${reqId}/attachments`).set(auth('liam'))
        .attach('file', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
      expect(res.status).toBe(400);
    });
    test('files over 5 MB are rejected', async () => {
      const res = await request(app).post(`/api/leave/${reqId}/attachments`).set(auth('liam'))
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 10, 1), { filename: 'big.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(413);
    });
    test('the manager can download it', async () => {
      const res = await request(app).get(`/api/leave/${reqId}/attachments/${fileId}`).set(auth('manager'));
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('certificate.pdf');
    });
    test('an unrelated colleague cannot download it', async () => {
      const res = await request(app).get(`/api/leave/${reqId}/attachments/${fileId}`).set(auth('sara'));
      expect(res.status).toBe(403);
    });
    test('requester can remove it while pending', async () => {
      expect((await request(app).delete(`/api/leave/${reqId}/attachments/${fileId}`).set(auth('liam'))).status).toBe(204);
    });
  });

  describe('admin-only areas', () => {
    test('audit log is admin only and has entries', async () => {
      expect((await request(app).get('/api/audit').set(auth('manager'))).status).toBe(403);
      const res = await request(app).get('/api/audit').set(auth('admin'));
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
    test('dashboard returns stats', async () => {
      const res = await request(app).get('/api/dashboard').set(auth('liam'));
      expect(res.body.headcount).toBeGreaterThan(0);
    });
    test('unknown route gives 404 JSON', async () => {
      const res = await request(app).get('/api/nope').set(auth('admin'));
      expect(res.status).toBe(404);
    });
  });
});
