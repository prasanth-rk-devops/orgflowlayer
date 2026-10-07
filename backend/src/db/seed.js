const bcrypt = require('bcryptjs');
const { env, assertEnv } = require('../config/env');
const { pool, withTransaction } = require('./pool');

async function seed() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) return console.log('[seed] users exist, skipping');

  await withTransaction(async (c) => {
    for (const d of ['Executive', 'Engineering', 'Human Resources', 'Finance', 'Sales']) {
      await c.query('INSERT INTO departments(name) VALUES ($1) ON CONFLICT DO NOTHING', [d]);
    }
    for (const [n, d] of [['Annual Leave', 20], ['Sick Leave', 10], ['Personal Leave', 5]]) {
      await c.query('INSERT INTO leave_types(name, annual_days) VALUES ($1,$2) ON CONFLICT DO NOTHING', [n, d]);
    }
    const dept = async (name) => (await c.query('SELECT id FROM departments WHERE name=$1', [name])).rows[0].id;

    const mkEmployee = async (f, l, email, title, deptName, managerId, role, password) => {
      const e = await c.query(
        `INSERT INTO employees(first_name,last_name,email,job_title,department_id,manager_id,hire_date,salary)
         VALUES ($1,$2,$3,$4,$5,$6,'2022-01-10',$7) RETURNING id`,
        [f, l, email, title, await dept(deptName), managerId, 60000]);
      const hash = await bcrypt.hash(password, 12);
      await c.query(
        'INSERT INTO users(employee_id,email,password_hash,role) VALUES ($1,$2,$3,$4)',
        [e.rows[0].id, email, hash, role]);
      return e.rows[0].id;
    };

    // People who appear in the org chart but have no sign-in
    const mkProfile = async (f, l, email, title, deptName, managerId, hire, salary) => (await c.query(
      `INSERT INTO employees(first_name,last_name,email,job_title,department_id,manager_id,hire_date,salary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [f, l, email, title, await dept(deptName), managerId, hire, salary])).rows[0].id;

    const yearsAgo = (n) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); };

    const ceo = env.seedDemo
      ? await mkProfile('Elena', 'Rossi', 'elena.rossi@orgflow.local', 'Chief Executive Officer', 'Executive', null, '2018-03-01', 185000)
      : null;
    const adminEmpId = await mkEmployee('System', 'Admin', env.adminEmail, 'HR Administrator', 'Human Resources', ceo, 'admin', env.adminPassword);

    if (env.seedDemo) {
      await mkProfile('Daniel', 'Okafor', 'daniel.okafor@orgflow.local', 'Finance Manager', 'Finance', ceo, '2020-06-15', 98000);
      await mkProfile('Priya', 'Nair', 'priya.nair@orgflow.local', 'Head of Sales', 'Sales', ceo, yearsAgo(3), 105000);
      const mgr = await mkEmployee('Maya', 'Patel', 'maya.patel@orgflow.local', 'Engineering Manager', 'Engineering', ceo, 'manager', 'Manager@12345');
      await mkEmployee('Liam', 'Chen', 'liam.chen@orgflow.local', 'Software Engineer', 'Engineering', mgr, 'employee', 'Employee@12345');
      await mkEmployee('Sara', 'Khan', 'sara.khan@orgflow.local', 'QA Engineer', 'Engineering', mgr, 'employee', 'Employee@12345');
      const adminUser = (await c.query('SELECT id FROM users WHERE employee_id = $1', [adminEmpId])).rows[0].id;
      await c.query(
        'INSERT INTO announcements(title, body, pinned, author_id) VALUES ($1,$2,TRUE,$3),($4,$5,FALSE,$3)',
        ['Welcome to OrgFlow', 'Request time off, see who is out, and find anyone in the company from one place. Questions? Ask People Operations.', adminUser,
         'Office closed on public holidays', 'Company holidays are listed under Holidays and are never deducted from your leave balance.']);
      console.log('[seed] demo users created (maya.patel, liam.chen, sara.khan @orgflow.local)');
    }
  });
  console.log(`[seed] admin created: ${env.adminEmail}`);
}

module.exports = { seed };

if (require.main === module) {
  assertEnv();
  seed().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
