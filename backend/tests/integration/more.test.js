/** Integration tests: notifications, CSV import, reports. Needs TEST_DATABASE_URL (wipes the DB). */
const request = require('supertest');

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

suite('OrgFlow notifications, import and reports (integration)', () => {
  let app; let pool; const tokens = {};
  const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.token;
  /** Notifications are written after the response, so poll briefly instead of racing. */
  const eventually = async (fn, tries = 20) => { for (let i = 0; i < tries; i += 1) { const v = await fn(); if (v) return v; await sleep(100); } return null; };

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

  describe('notifications', () => {
    let leaveId;
    test('starts empty for a new user and needs sign-in', async () => {
      const res = await request(app).get('/api/notifications').set(auth('liam'));
      expect(res.status).toBe(200);
      expect(res.body.unreadCount).toBe(0);
      expect((await request(app).get('/api/notifications')).status).toBe(401);
    });
    test('a leave request notifies the manager, not the requester', async () => {
      const types = (await request(app).get('/api/leave/types').set(auth('liam'))).body;
      const created = await request(app).post('/api/leave').set(auth('liam')).send({ leaveTypeId: types[0].id, startDate: '2031-03-03', endDate: '2031-03-04' });
      expect(created.status).toBe(201);
      leaveId = created.body.id;
      const got = await eventually(async () => {
        const r = (await request(app).get('/api/notifications').set(auth('manager'))).body;
        return r.items.find((n) => n.kind === 'leave_submitted') && r;
      });
      expect(got).toBeTruthy();
      expect(got.unreadCount).toBeGreaterThan(0);
      expect(got.items[0].link).toBe('/approvals');
      expect((await request(app).get('/api/notifications').set(auth('liam'))).body.items.some((n) => n.kind === 'leave_submitted')).toBe(false);
    });
    test('the decision notifies the requester', async () => {
      await request(app).patch(`/api/leave/${leaveId}/review`).set(auth('manager')).send({ decision: 'approved' });
      const got = await eventually(async () => (await request(app).get('/api/notifications').set(auth('liam'))).body.items.find((n) => n.kind === 'leave_approved'));
      expect(got.title).toContain('approved');
    });
    test('mark one as read, then everything as read', async () => {
      const before = (await request(app).get('/api/notifications').set(auth('manager'))).body;
      const one = before.items.find((n) => !n.read);
      expect((await request(app).patch(`/api/notifications/${one.id}/read`).set(auth('manager'))).status).toBe(200);
      await request(app).post('/api/notifications/read-all').set(auth('manager'));
      expect((await request(app).get('/api/notifications').set(auth('manager'))).body.unreadCount).toBe(0);
    });
    test('nobody can read or change someone else\'s notification', async () => {
      const mine = (await request(app).get('/api/notifications').set(auth('manager'))).body.items[0];
      expect((await request(app).patch(`/api/notifications/${mine.id}/read`).set(auth('liam'))).status).toBe(404);
    });
    test('publishing an announcement notifies everyone except the author', async () => {
      await request(app).post('/api/announcements').set(auth('admin')).send({ title: 'Town hall on Friday', body: 'See you there.' });
      const got = await eventually(async () => (await request(app).get('/api/notifications').set(auth('liam'))).body.items.find((n) => n.kind === 'announcement'));
      expect(got.title).toBe('Town hall on Friday');
      expect((await request(app).get('/api/notifications').set(auth('admin'))).body.items.some((n) => n.kind === 'announcement')).toBe(false);
    });
  });

  describe('employee import', () => {
    const head = 'first_name,last_name,email,job_title,department,manager_email,hire_date,phone,salary\n';
    const post = (who, csv, dryRun = false) => request(app).post('/api/employees/import').set(auth(who)).send({ csv, dryRun });

    test('only admins can import or download the template', async () => {
      expect((await post('liam', head)).status).toBe(403);
      expect((await request(app).get('/api/employees/import-template.csv').set(auth('liam'))).status).toBe(403);
    });
    test('template downloads as CSV with the expected headings', async () => {
      const res = await request(app).get('/api/employees/import-template.csv').set(auth('admin'));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('first_name,last_name,email,job_title');
    });
    test('rejects files with missing columns and empty files', async () => {
      const res = await post('admin', 'first_name,email\nA,a@x.com');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing column');
      expect((await post('admin', head)).status).toBe(400);
    });
    test('reports every problem at once and writes nothing', async () => {
      const csv = head
        + 'Ok,Person,ok.person@acme.test,Analyst,Engineering,,2026-01-05,,\n'
        + 'Bad,Email,not-an-email,Analyst,Engineering,,2026-01-05,,\n'
        + 'Bad,Date,bad.date@acme.test,Analyst,Engineering,,2026-02-31,,\n'
        + 'Bad,Dept,bad.dept@acme.test,Analyst,Nowhere,,2026-01-05,,\n'
        + 'Dup,Existing,liam.chen@orgflow.local,Analyst,Engineering,,2026-01-05,,\n'
        + 'Bad,Mgr,bad.mgr@acme.test,Analyst,Engineering,ghost@acme.test,2026-01-05,,\n';
      const res = await post('admin', csv);
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(0);
      expect(res.body.total).toBe(6);
      expect(res.body.valid).toBe(1);
      const rows = res.body.errors.map((e) => e.row);
      expect(rows).toEqual([3, 4, 5, 6, 7]);
      const count = (await pool.query("SELECT COUNT(*)::int AS n FROM employees WHERE email LIKE '%@acme.test'")).rows[0].n;
      expect(count).toBe(0);
    });
    test('dry run validates without saving', async () => {
      const res = await post('admin', `${head}Dry,Run,dry.run@acme.test,Analyst,Engineering,,2026-01-05,,`, true);
      expect(res.body.errors).toEqual([]);
      expect(res.body.valid).toBe(1);
      expect(res.body.created).toBe(0);
      expect((await pool.query("SELECT COUNT(*)::int AS n FROM employees WHERE email = 'dry.run@acme.test'")).rows[0].n).toBe(0);
    });
    test('imports people, resolving managers from the file and from existing staff', async () => {
      const csv = head
        + 'Team,Member,team.member@acme.test,Developer,Engineering,team.lead@acme.test,2026-02-02,"+1 555, 0101",65000\n'   // manager appears LATER in the file
        + 'Team,Lead,team.lead@acme.test,Lead Developer,Engineering,maya.patel@orgflow.local,2025-06-02,,90000\n';
      const res = await post('admin', csv);
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(2);
      const rows = (await pool.query(
        `SELECT e.email, m.email AS manager, e.phone, e.salary::float AS salary FROM employees e
         LEFT JOIN employees m ON m.id = e.manager_id WHERE e.email LIKE 'team.%@acme.test' ORDER BY e.email`)).rows;
      expect(rows[0]).toEqual({ email: 'team.lead@acme.test', manager: 'maya.patel@orgflow.local', phone: null, salary: 90000 });
      expect(rows[1]).toEqual({ email: 'team.member@acme.test', manager: 'team.lead@acme.test', phone: '+1 555, 0101', salary: 65000 });
    });
    test('importing the same file again is rejected as duplicates', async () => {
      const res = await post('admin', `${head}Team,Lead,team.lead@acme.test,Lead Developer,Engineering,,2025-06-02,,`);
      expect(res.body.created).toBe(0);
      expect(res.body.errors[0].message).toContain('already exists');
    });
    test('circular chains inside one file are caught', async () => {
      const csv = head
        + 'A,One,a.one@acme.test,Dev,,b.two@acme.test,2026-01-05,,\n'
        + 'B,Two,b.two@acme.test,Dev,,a.one@acme.test,2026-01-05,,\n';
      const res = await post('admin', csv);
      expect(res.body.created).toBe(0);
      expect(res.body.errors.some((e) => e.message.includes('circular'))).toBe(true);
    });
    test('accepts semicolon-separated files and friendly column names', async () => {
      const csv = 'First name;Last name;Work email;Title;Start date\nSemi;Colon;semi.colon@acme.test;Designer;2026-03-02';
      const res = await post('admin', csv);
      expect(res.body.errors).toEqual([]);
      expect(res.body.created).toBe(1);
    });
  });

  describe('reports', () => {
    test('are admin only', async () => {
      expect((await request(app).get('/api/reports/summary').set(auth('manager'))).status).toBe(403);
      expect((await request(app).get('/api/reports/summary')).status).toBe(401);
    });
    test('summarise leave and the workforce', async () => {
      const res = await request(app).get('/api/reports/summary?year=2031').set(auth('admin'));
      expect(res.status).toBe(200);
      expect(res.body.year).toBe(2031);
      expect(res.body.byMonth).toHaveLength(12);
      expect(res.body.byMonth[2]).toBe(2);                       // Liam's approved 2 days starting 3 March 2031
      expect(res.body.totals.approvedDays).toBe(2);
      expect(res.body.totals.approvalRate).toBe(100);
      expect(res.body.byType.find((t) => t.type === 'Annual Leave').days).toBe(2);
      expect(res.body.mostAbsent[0].name).toBe('Liam Chen');
      expect(res.body.tenureBands.map((b) => b.band)).toEqual(['Under 1 year', '1 to 3 years', '3 to 5 years', '5 years or more']);
      expect(res.body.hiresByYear.length).toBeGreaterThan(0);
      const eng = res.body.byDepartment.find((d) => d.department === 'Engineering');
      expect(eng.days).toBe(2);
      expect(eng.people).toBeGreaterThan(0);
    });
    test('validate the year', async () => {
      expect((await request(app).get('/api/reports/summary?year=abc').set(auth('admin'))).status).toBe(400);
    });
  });
});
