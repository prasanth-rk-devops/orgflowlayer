const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { query } = require('../db/pool');
const inapp = require('./inapp');

let transporter;
function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host, port: env.smtp.port, secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/** Never throws: a mail outage must not break a leave request. */
async function sendMail({ to, subject, text }) {
  const t = getTransporter();
  if (!to || !t) return;
  try { await t.sendMail({ from: env.smtp.from, to, subject, text }); }
  catch (e) { console.error('[mail] failed:', e.message); }
}

const DETAILS = `
  SELECT r.id, r.days, r.status, r.review_note AS note, r.start_date::text AS start, r.end_date::text AS "end",
         t.name AS type, e.first_name || ' ' || e.last_name AS name, e.email AS employee_email,
         m.email AS manager_email
  FROM leave_requests r
  JOIN employees e ON e.id = r.employee_id
  JOIN leave_types t ON t.id = r.leave_type_id
  LEFT JOIN employees m ON m.id = e.manager_id
  WHERE r.id = $1`;

/** The manager's account, or every admin when the employee has no manager with a sign-in. */
async function approverUserIds(requestId) {
  const m = await query(
    `SELECT u.id FROM leave_requests r JOIN employees e ON e.id = r.employee_id
     JOIN users u ON u.employee_id = e.manager_id AND u.is_active WHERE r.id = $1`, [requestId]);
  if (m.rows.length) return m.rows.map((x) => x.id);
  return (await query("SELECT id FROM users WHERE role = 'admin' AND is_active")).rows.map((x) => x.id);
}

async function leaveSubmitted(requestId) {
  const r = (await query(DETAILS, [requestId])).rows[0];
  if (!r) return;
  await inapp.create(await approverUserIds(requestId), {
    kind: 'leave_submitted', title: `${r.name} requested leave`,
    body: `${r.days} day${r.days === 1 ? '' : 's'} of ${r.type}, ${r.start} to ${r.end}`, link: '/approvals',
  });
  await sendMail({
    to: r.manager_email || env.adminEmail,
    subject: `Leave request from ${r.name}`,
    text: `${r.name} requested ${r.days} day(s) of ${r.type} (${r.start} to ${r.end}).\n\nReview it: ${env.appUrl}/approvals`,
  });
}

async function leaveReviewed(requestId) {
  const r = (await query(DETAILS, [requestId])).rows[0];
  if (!r) return;
  const owner = await query('SELECT u.id FROM leave_requests lr JOIN users u ON u.employee_id = lr.employee_id WHERE lr.id = $1', [requestId]);
  await inapp.create(owner.rows.map((x) => x.id), {
    kind: `leave_${r.status}`, title: `Your ${r.type} request was ${r.status}`,
    body: r.note ? `${r.start} to ${r.end}. Note: ${r.note}` : `${r.start} to ${r.end}`, link: '/leave',
  });
  await sendMail({
    to: r.employee_email,
    subject: `Your ${r.type} request was ${r.status}`,
    text: `Your ${r.type} request (${r.start} to ${r.end}) was ${r.status}.${r.note ? `\n\nNote from reviewer: ${r.note}` : ''}\n\nDetails: ${env.appUrl}/leave`,
  });
}

module.exports = { sendMail, leaveSubmitted, leaveReviewed };
