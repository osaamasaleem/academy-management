import { Router } from 'express';
import { pool } from '../config/db.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { getTodayPKString, clampDueDay, isEnrolledInPeriod } from '../services/billing.js';

const router = Router();

/**
 * GET /api/dashboard/summary
 * Access: Authenticated users
 * Admin returns full overview:
 *  - activeTeachers
 *  - activeStudents
 *  - attendanceToday: { present, absent, late, leave, notMarked }
 *  - fees: { month, year, expected, collected, pending, overdue }
 * Teacher returns:
 *  - own month attendance counts
 *  - only sections for permissions held (e.g. fee summary if can_manage_fees, student count if can_view_students)
 */
router.get('/dashboard/summary', verifyAuth, async (req, res, next) => {
  try {
    const todayPK = getTodayPKString();
    const [currYearStr, currMonthStr] = todayPK.split('-');
    const currentYear = parseInt(currYearStr, 10);
    const currentMonth = parseInt(currMonthStr, 10);

    const isAdmin = req.user.role === 'admin';

    // 1. Teacher's own attendance this month (always included for non-admin)
    let myAttendance = null;
    if (!isAdmin) {
      const myAttQuery = `
        SELECT status, COUNT(*)::int AS count
        FROM teacher_attendance
        WHERE teacher_id = $1
          AND EXTRACT(YEAR FROM attendance_date) = $2
          AND EXTRACT(MONTH FROM attendance_date) = $3
        GROUP BY status
      `;
      const myAttRes = await pool.query(myAttQuery, [req.user.id, currentYear, currentMonth]);
      const myCounts = { present: 0, absent: 0, late: 0, leave: 0 };
      myAttRes.rows.forEach(r => {
        if (myCounts[r.status] !== undefined) myCounts[r.status] = r.count;
      });
      myAttendance = {
        month: currentMonth,
        year: currentYear,
        counts: myCounts
      };
    }

    // 2. Active Teachers count (Admin or can_mark_all_attendance)
    let activeTeachersCount = null;
    if (isAdmin || req.user.can_mark_all_attendance) {
      const teacherRes = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'teacher' AND is_active = TRUE`);
      activeTeachersCount = teacherRes.rows[0].count;
    }

    // 3. Attendance Today (Admin or can_mark_all_attendance)
    let attendanceToday = null;
    if (isAdmin || req.user.can_mark_all_attendance) {
      const attTodayQuery = `
        SELECT 
          ta.status,
          COUNT(u.id)::int AS count
        FROM users u
        LEFT JOIN teacher_attendance ta 
          ON u.id = ta.teacher_id 
          AND ta.attendance_date = $1
        WHERE u.role = 'teacher' 
          AND u.is_active = TRUE
        GROUP BY ta.status
      `;
      const attTodayRes = await pool.query(attTodayQuery, [todayPK]);
      const todayCounts = { present: 0, absent: 0, late: 0, leave: 0, notMarked: 0 };
      attTodayRes.rows.forEach(r => {
        if (r.status === null) {
          todayCounts.notMarked += r.count;
        } else if (todayCounts[r.status] !== undefined) {
          todayCounts[r.status] += r.count;
        }
      });
      attendanceToday = {
        date: todayPK,
        ...todayCounts
      };
    }

    // 4. Active Students count (Admin or can_view_students or can_manage_students)
    let activeStudentsCount = null;
    if (isAdmin || req.user.can_view_students || req.user.can_manage_students) {
      const studentRes = await pool.query(`SELECT COUNT(*)::int AS count FROM students WHERE LOWER(status) = 'active'`);
      activeStudentsCount = studentRes.rows[0].count;
    }

    // 5. Fee Summary for current month (Admin or can_manage_fees)
    let feeSummary = null;
    if (isAdmin || req.user.can_manage_fees) {
      const studentsQuery = `
        SELECT 
          s.id, 
          s.monthly_fee, 
          s.fee_due_day, 
          s.admission_date::text AS admission_date,
          s.enrollment_history,
          fr.id AS fee_record_id,
          fr.fee_amount,
          fr.amount_paid,
          fr.status AS fee_status,
          fr.paid_date::text AS paid_date
        FROM students s
        LEFT JOIN fee_records fr 
          ON s.id = fr.student_id 
          AND fr.billing_month = $1 
          AND fr.billing_year = $2
        WHERE s.status IN ('active', 'Active')
          AND s.admission_date <= (date_trunc('month', make_date($2, $1, 1)) + interval '1 month - 1 day')::date
      `;
      const feeRes = await pool.query(studentsQuery, [currentMonth, currentYear]);

      let expected = 0;
      let collected = 0;
      let pending = 0;
      let counts = { paid: 0, unpaid: 0, overdue: 0, waived: 0 };

      for (const row of feeRes.rows) {
        if (!row.fee_record_id && !isEnrolledInPeriod(row.enrollment_history, currentYear, currentMonth)) {
          continue;
        }

        const studentFee = row.fee_amount !== null && row.fee_amount !== undefined 
          ? parseFloat(row.fee_amount) 
          : parseFloat(row.monthly_fee);

        const effectiveStatus = row.fee_status || 'unpaid';
        const paidAmount = parseFloat(row.amount_paid || 0);

        if (effectiveStatus === 'waived') {
          counts.waived++;
          continue;
        }

        expected += studentFee;
        collected += paidAmount;

        if (effectiveStatus === 'paid') {
          counts.paid++;
        } else {
          // unpaid
          pending += studentFee;
          const dueDayClamped = clampDueDay(currentYear, currentMonth, row.fee_due_day);
          const mm = String(currentMonth).padStart(2, '0');
          const dd = String(dueDayClamped).padStart(2, '0');
          const dueDateStr = `${currentYear}-${mm}-${dd}`;

          if (todayPK > dueDateStr) {
            counts.overdue++;
          } else {
            counts.unpaid++;
          }
        }
      }

      feeSummary = {
        month: currentMonth,
        year: currentYear,
        expected: parseFloat(expected.toFixed(2)),
        collected: parseFloat(collected.toFixed(2)),
        pending: parseFloat(pending.toFixed(2)),
        counts
      };
    }

    res.json({
      data: {
        role: req.user.role,
        myAttendance,
        activeTeachers: activeTeachersCount,
        activeStudents: activeStudentsCount,
        attendanceToday,
        fees: feeSummary
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/audit-logs
 * Access: Admin OR can_view_audit_logs
 * Query: ?entity_type=&actor_id=&from=&to=&page=1&pageSize=50
 */
router.get('/audit-logs', verifyAuth, requirePermission('can_view_audit_logs'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const offset = (page - 1) * pageSize;

    const { entity_type, actor_id, from, to } = req.query;

    let conditions = [];
    let params = [];

    if (entity_type) {
      params.push(entity_type);
      conditions.push(`al.entity_type = $${params.length}`);
    }

    if (actor_id) {
      params.push(parseInt(actor_id, 10));
      conditions.push(`al.actor_id = $${params.length}`);
    }

    if (from) {
      params.push(from);
      conditions.push(`al.created_at >= $${params.length}::timestamptz`);
    }

    if (to) {
      params.push(to);
      conditions.push(`al.created_at <= ($${params.length}::timestamptz + interval '1 day')`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*)::int AS total FROM audit_logs al ${whereClause}`;
    const countRes = await pool.query(countQuery, params);
    const total = countRes.rows[0].total;

    const query = `
      SELECT 
        al.id,
        al.actor_id,
        u.full_name AS actor_name,
        u.username AS actor_username,
        al.action,
        al.entity_type,
        al.entity_id,
        al.details,
        al.created_at
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_id = u.id
      ${whereClause}
      ORDER BY al.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const { rows } = await pool.query(query, [...params, pageSize, offset]);

    res.json({
      data: rows,
      meta: {
        page,
        pageSize,
        total
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
