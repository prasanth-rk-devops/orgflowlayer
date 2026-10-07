const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../../db/pool');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate, authorize('admin'));

const BANDS = ['Under 1 year', '1 to 3 years', '3 to 5 years', '5 years or more'];

router.get('/summary',
  validate({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()) }) }),
  asyncHandler(async (req, res) => {
    const { year } = req.query;
    const [byType, byDept, byMonth, decisions, tenure, hires, topAbsent] = await Promise.all([
      query(`SELECT t.name AS type,
                    COALESCE(SUM(r.days) FILTER (WHERE r.status = 'approved'), 0)::int AS days,
                    COUNT(r.id) FILTER (WHERE r.status = 'approved')::int AS requests
             FROM leave_types t
             LEFT JOIN leave_requests r ON r.leave_type_id = t.id AND EXTRACT(YEAR FROM r.start_date) = $1
             GROUP BY t.id ORDER BY t.id`, [year]),
      query(`SELECT COALESCE(d.name, 'Unassigned') AS department,
                    COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'active')::int AS people,
                    COALESCE(SUM(r.days) FILTER (WHERE r.status = 'approved' AND EXTRACT(YEAR FROM r.start_date) = $1), 0)::int AS days
             FROM employees e
             LEFT JOIN departments d ON d.id = e.department_id
             LEFT JOIN leave_requests r ON r.employee_id = e.id
             GROUP BY d.id, d.name ORDER BY days DESC, department`, [year]),
      query(`SELECT EXTRACT(MONTH FROM start_date)::int AS month, SUM(days)::int AS days
             FROM leave_requests WHERE status = 'approved' AND EXTRACT(YEAR FROM start_date) = $1 GROUP BY 1`, [year]),
      query(`SELECT COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
                    COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                    COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                    COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
                    ROUND((AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600)
                           FILTER (WHERE reviewed_at IS NOT NULL))::numeric, 1)::float AS "avgHoursToDecision"
             FROM leave_requests WHERE EXTRACT(YEAR FROM start_date) = $1`, [year]),
      query(`SELECT band, COUNT(*)::int AS count FROM (
               SELECT CASE WHEN hire_date > CURRENT_DATE - interval '1 year'  THEN 'Under 1 year'
                           WHEN hire_date > CURRENT_DATE - interval '3 years' THEN '1 to 3 years'
                           WHEN hire_date > CURRENT_DATE - interval '5 years' THEN '3 to 5 years'
                           ELSE '5 years or more' END AS band
               FROM employees WHERE status = 'active') t GROUP BY band`),
      query(`SELECT EXTRACT(YEAR FROM hire_date)::int AS year, COUNT(*)::int AS hires FROM employees GROUP BY 1 ORDER BY 1`),
      query(`SELECT e.id, e.first_name || ' ' || e.last_name AS name, SUM(r.days)::int AS days
             FROM leave_requests r JOIN employees e ON e.id = r.employee_id
             WHERE r.status = 'approved' AND EXTRACT(YEAR FROM r.start_date) = $1
             GROUP BY e.id ORDER BY days DESC, name LIMIT 5`, [year]),
    ]);

    const monthly = Array(12).fill(0);
    byMonth.rows.forEach((r) => { monthly[r.month - 1] = r.days; });
    const d = decisions.rows[0];
    const decided = d.approved + d.rejected;
    const bandCounts = Object.fromEntries(tenure.rows.map((r) => [r.band, r.count]));

    res.json({
      year,
      totals: {
        approvedDays: byType.rows.reduce((a, r) => a + r.days, 0),
        approvedRequests: d.approved,
        approvalRate: decided ? Math.round((d.approved / decided) * 100) : null,
        avgHoursToDecision: d.avgHoursToDecision,
        ...d,
      },
      byType: byType.rows,
      byDepartment: byDept.rows.map((r) => ({ ...r, daysPerPerson: r.people ? Math.round((r.days / r.people) * 10) / 10 : 0 })),
      byMonth: monthly,
      tenureBands: BANDS.map((band) => ({ band, count: bandCounts[band] || 0 })),
      hiresByYear: hires.rows,
      mostAbsent: topAbsent.rows,
    });
  }));

module.exports = router;
