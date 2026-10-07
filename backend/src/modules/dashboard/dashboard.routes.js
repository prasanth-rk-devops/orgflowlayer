const router = require('express').Router();
const { query } = require('../../db/pool');
const { authenticate } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const [headcount, byDept, onLeave, upcoming, pending, byMonth, celebrations] = await Promise.all([
    query("SELECT COUNT(*)::int AS n FROM employees WHERE status='active'"),
    query(`SELECT COALESCE(d.name,'Unassigned') AS name, COUNT(*)::int AS count
           FROM employees e LEFT JOIN departments d ON d.id=e.department_id
           WHERE e.status='active' GROUP BY 1 ORDER BY count DESC`),
    query(`SELECT e.first_name || ' ' || e.last_name AS name, t.name AS "leaveType", r.end_date::text AS "endDate"
           FROM leave_requests r JOIN employees e ON e.id=r.employee_id JOIN leave_types t ON t.id=r.leave_type_id
           WHERE r.status='approved' AND CURRENT_DATE BETWEEN r.start_date AND r.end_date ORDER BY r.end_date`),
    query(`SELECT e.first_name || ' ' || e.last_name AS name, t.name AS "leaveType",
                  r.start_date::text AS "startDate", r.end_date::text AS "endDate"
           FROM leave_requests r JOIN employees e ON e.id=r.employee_id JOIN leave_types t ON t.id=r.leave_type_id
           WHERE r.status='approved' AND r.start_date > CURRENT_DATE AND r.start_date <= CURRENT_DATE + 30
           ORDER BY r.start_date LIMIT 10`),
    req.user.role === 'employee'
      ? query("SELECT COUNT(*)::int AS n FROM leave_requests WHERE employee_id=$1 AND status='pending'", [req.user.employeeId])
      : req.user.role === 'manager'
        ? query(`SELECT COUNT(*)::int AS n FROM leave_requests r JOIN employees e ON e.id=r.employee_id
                 WHERE r.status='pending' AND e.manager_id=$1`, [req.user.employeeId])
        : query("SELECT COUNT(*)::int AS n FROM leave_requests WHERE status='pending'"),
    query(`SELECT EXTRACT(MONTH FROM start_date)::int AS month, SUM(days)::int AS days
           FROM leave_requests
           WHERE status='approved' AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
           GROUP BY 1`),
    query(`SELECT id, first_name || ' ' || last_name AS name, job_title AS "jobTitle",
                  EXTRACT(DAY FROM hire_date)::int AS day,
                  (EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM hire_date))::int AS years
           FROM employees
           WHERE status='active' AND hire_date <= CURRENT_DATE
             AND EXTRACT(MONTH FROM hire_date) = EXTRACT(MONTH FROM CURRENT_DATE)
           ORDER BY day, name LIMIT 8`),
  ]);
  const leaveByMonth = Array(12).fill(0);
  byMonth.rows.forEach((r) => { leaveByMonth[r.month - 1] = r.days; });
  res.json({
    headcount: headcount.rows[0].n,
    byDepartment: byDept.rows,
    onLeaveToday: onLeave.rows,
    upcomingLeave: upcoming.rows,
    pendingCount: pending.rows[0].n,
    leaveByMonth,
    celebrations: celebrations.rows,
  });
}));

module.exports = router;
