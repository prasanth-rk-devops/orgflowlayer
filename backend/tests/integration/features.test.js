/** Integration tests: announcements, org chart, dashboard extras. Needs TEST_DATABASE_URL (wipes the DB). */
const request = require('supertest');

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;

suite('OrgFlow features (integration)', () => {
  let app; let pool; const tokens = {};
  const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.token;

  beforeAll(async () => {
    app = require('../../src/app');
    ({ pool } = require('../../src/db/pool'));
    await require('../../src/db/migrate').migrate();
    await pool.query(`TRUNCATE notifications, announcements, password_resets, holidays, leave_attachments, leave_requests, audit_logs, users, employees, departments, leave_types RESTART IDENTITY CASCADE`);
    await require('../../src/db/seed').seed();
    tokens.admin = await login('admin@orgflow.local', 'Admin@12345');
    tokens.liam = await login('liam.chen@orgflow.local', 'Employee@12345');
  });
  afterAll(async () => { await pool.end(); });

  describe('announcements', () => {
    let id;
    test('demo data includes a pinned welcome post, pinned posts come first', async () => {
      const res = await request(app).get('/api/announcements').set(auth('liam'));
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body[0].pinned).toBe(true);
      expect(res.body[0].authorName).toBe('System Admin');
    });
    test('employees cannot publish, pin or delete', async () => {
      expect((await request(app).post('/api/announcements').set(auth('liam')).send({ title: 'Hello', body: 'x' })).status).toBe(403);
      expect((await request(app).patch('/api/announcements/1').set(auth('liam')).send({ pinned: true })).status).toBe(403);
      expect((await request(app).delete('/api/announcements/1').set(auth('liam'))).status).toBe(403);
    });
    test('admin publishes; invalid input is rejected', async () => {
      const bad = await request(app).post('/api/announcements').set(auth('admin')).send({ title: 'x', body: '' });
      expect(bad.status).toBe(400);
      const res = await request(app).post('/api/announcements').set(auth('admin')).send({ title: 'Quarterly town hall', body: 'Friday at 3pm.', pinned: false });
      expect(res.status).toBe(201);
      expect(res.body.authorName).toBe('System Admin');
      id = res.body.id;
    });
    test('admin pins it, then it leads the list', async () => {
      const pin = await request(app).patch(`/api/announcements/${id}`).set(auth('admin')).send({ pinned: true });
      expect(pin.body.pinned).toBe(true);
      const list = (await request(app).get('/api/announcements').set(auth('liam'))).body;
      expect(list[0].id).toBe(id); // pinned, and newest of the pinned
    });
    test('admin deletes it; deleting again is a 404', async () => {
      expect((await request(app).delete(`/api/announcements/${id}`).set(auth('admin'))).status).toBe(204);
      expect((await request(app).delete(`/api/announcements/${id}`).set(auth('admin'))).status).toBe(404);
    });
  });

  describe('org chart', () => {
    test('returns active people with their manager', async () => {
      const res = await request(app).get('/api/employees/org-chart').set(auth('liam'));
      expect(res.status).toBe(200);
      const byName = Object.fromEntries(res.body.map((p) => [`${p.firstName} ${p.lastName}`, p]));
      expect(byName['Elena Rossi'].managerId).toBeNull();
      expect(byName['Maya Patel'].managerId).toBe(byName['Elena Rossi'].id);
      expect(byName['Liam Chen'].managerId).toBe(byName['Maya Patel'].id);
      expect(res.body.every((p) => p.salary === undefined)).toBe(true); // never exposes pay
    });
    test('is not shadowed by /employees/:id', async () => {
      expect((await request(app).get('/api/employees/org-chart').set(auth('admin'))).status).toBe(200);
    });
    test('requires sign-in', async () => {
      expect((await request(app).get('/api/employees/org-chart')).status).toBe(401);
    });
    test('deactivated people disappear from the chart', async () => {
      const priya = (await request(app).get('/api/employees?search=priya').set(auth('admin'))).body.data[0];
      await request(app).delete(`/api/employees/${priya.id}`).set(auth('admin'));
      const names = (await request(app).get('/api/employees/org-chart').set(auth('liam'))).body.map((p) => p.firstName);
      expect(names).not.toContain('Priya');
    });
  });

  describe('dashboard extras', () => {
    test('returns 12 monthly leave totals and a celebrations list', async () => {
      const res = await request(app).get('/api/dashboard').set(auth('liam'));
      expect(res.status).toBe(200);
      expect(res.body.leaveByMonth).toHaveLength(12);
      expect(Array.isArray(res.body.celebrations)).toBe(true);
    });
    test('approved leave shows up in the month it starts', async () => {
      const year = new Date().getUTCFullYear();
      // Pick a Monday in March of the current year
      const d = new Date(Date.UTC(year, 2, 1)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
      const day = d.toISOString().slice(0, 10);
      const types = (await request(app).get('/api/leave/types').set(auth('liam'))).body;
      const created = await request(app).post('/api/leave').set(auth('liam')).send({ leaveTypeId: types[0].id, startDate: day, endDate: day });
      expect(created.status).toBe(201);
      await request(app).patch(`/api/leave/${created.body.id}/review`).set(auth('admin')).send({ decision: 'approved' });
      const res = await request(app).get('/api/dashboard').set(auth('liam'));
      expect(res.body.leaveByMonth[2]).toBe(1);
    });
  });
});
