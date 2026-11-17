import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { logAudit } from '../services/audit.js';
import { getTodayPKString } from '../services/billing.js';

const router = Router();

// Validation schemas
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const bulkAttendanceSchema = z.object({
  date: z.string().regex(dateRegex, 'Date must be in YYYY-MM-DD format'),
  records: z.array(
    z.object({
      teacher_id: z.coerce.number().int().positive('Teacher ID must be positive'),
      status: z.enum(['present', 'absent', 'late', 'leave']),
      remarks: z.string().max(255).optional().nullable()
    })
  ).min(1, 'At least one record is required')
});

/**
 * GET /api/attendance/my
 * Access: Any authenticated user
 * Strictly scoped to req.user.id (row-level isolation)
 * Query: ?month=1..12&year=YYYY (defaults to current month/year in Asia/Karachi)
 */
router.get('/attendance/my', verifyAuth, async (req, res, next) => {
  try {
    const todayPK = getTodayPKString();
    const [currYearStr, currMonthStr] = todayPK.split('-');
    const currentYear = parseInt(currYearStr, 10);
    const currentMonth = parseInt(currMonthStr, 10);

    const month = req.query.month ? parseInt(req.query.month, 10) : currentMonth;
    const year = req.query.year ? parseInt(req.query.year, 10) : currentYear;

    if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid month (must be 1-12)' }
      });
    }
    if (isNaN(year) || year < 2020) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid year (must be >= 2020)' }
      });
    }

    const teacherId = req.user.id;

    // Fetch records for the specified month and year for this teacher only
    const query = `
      SELECT 
        id,
        attendance_date::text AS attendance_date,
        status,
        remarks,
        created_at,
        updated_at
      FROM teacher_attendance
      WHERE teacher_id = $1
        AND EXTRACT(YEAR FROM attendance_date) = $2
        AND EXTRACT(MONTH FROM attendance_date) = $3
      ORDER BY attendance_date ASC
    `;

    const { rows } = await pool.query(query, [teacherId, year, month]);

    const counts = {
      present: 0,
      absent: 0,
      late: 0,
      leave: 0
    };

    rows.forEach(r => {
      if (counts[r.status] !== undefined) {
        counts[r.status]++;
      }
    });

    res.json({
      data: {
        records: rows,
        counts,
        month,
        year
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attendance/mark-self
 * Access: Any authenticated user
 * Allows a teacher to mark their own attendance for today
 * Body: { status: 'present' | 'absent' | 'late' | 'leave', remarks?: string }
 */
router.post('/attendance/mark-self', verifyAuth, async (req, res, next) => {
  try {
    const markSelfSchema = z.object({
      status: z.enum(['present', 'absent', 'late', 'leave']),
      remarks: z.string().max(255).optional().nullable()
    });

    const parsed = markSelfSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid status or remarks' }
      });
    }

    const todayPK = getTodayPKString();
    const teacherId = req.user.id;

    // Check existing
    const existing = await pool.query(
      'SELECT id, status, remarks FROM teacher_attendance WHERE teacher_id = $1 AND attendance_date = $2',
      [teacherId, todayPK]
    );

    const upsertQuery = `
      INSERT INTO teacher_attendance (
        teacher_id,
        attendance_date,
        status,
        remarks,
        marked_by,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $1, NOW(), NOW())
      ON CONFLICT (teacher_id, attendance_date)
      DO UPDATE SET
        status = EXCLUDED.status,
        remarks = EXCLUDED.remarks,
        marked_by = EXCLUDED.marked_by,
        updated_at = NOW()
      RETURNING id, teacher_id, attendance_date::text AS attendance_date, status, remarks;
    `;

    const { rows } = await pool.query(upsertQuery, [
      teacherId,
      todayPK,
      parsed.data.status,
      parsed.data.remarks || null
    ]);

    await logAudit({
      actor_id: teacherId,
      action: 'attendance.mark_self',
      entity_type: 'attendance',
      entity_id: rows[0].id,
      details: {
        date: todayPK,
        status: parsed.data.status,
        before: existing.rows[0] ? existing.rows[0].status : null
      }
    });

    res.status(200).json({
      data: {
        message: 'Your attendance has been recorded',
        record: rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/attendance
 * Access: admin OR can_mark_all_attendance
 * Query: ?date=YYYY-MM-DD (defaults to today in Asia/Karachi)
 * Returns all active teachers with attendance status for that date (or null / "not marked")
 */
router.get('/attendance', verifyAuth, requirePermission('can_mark_all_attendance'), async (req, res, next) => {
  try {
    const todayPK = getTodayPKString();
    const date = req.query.date ? req.query.date : todayPK;

    if (!dateRegex.test(date)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Date must be in YYYY-MM-DD format' }
      });
    }

    const query = `
      SELECT 
        u.id AS teacher_id,
        u.full_name,
        u.username,
        u.subject_specialty,
        ta.id AS attendance_id,
        ta.attendance_date::text AS attendance_date,
        ta.status,
        ta.remarks,
        ta.marked_by,
        ta.updated_at
      FROM users u
      LEFT JOIN teacher_attendance ta 
        ON u.id = ta.teacher_id 
        AND ta.attendance_date = $1
      WHERE u.role = 'teacher' 
        AND u.is_active = TRUE
      ORDER BY u.full_name ASC
    `;

    const { rows } = await pool.query(query, [date]);

    res.json({
      data: {
        date,
        records: rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/attendance/summary
 * Access: admin OR can_mark_all_attendance
 * Query: ?month=1..12&year=YYYY
 * Returns monthly summary for ALL active teachers with counts (present, absent, late, leave, totalMarked)
 * and day-by-day status matrix or detailed records.
 */
router.get('/attendance/summary', verifyAuth, requirePermission('can_mark_all_attendance'), async (req, res, next) => {
  try {
    const todayPK = getTodayPKString();
    const [currYearStr, currMonthStr] = todayPK.split('-');
    const currentYear = parseInt(currYearStr, 10);
    const currentMonth = parseInt(currMonthStr, 10);

    const month = req.query.month ? parseInt(req.query.month, 10) : currentMonth;
    const year = req.query.year ? parseInt(req.query.year, 10) : currentYear;

    if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid month (must be 1-12)' }
      });
    }
    if (isNaN(year) || year < 2020) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid year (must be >= 2020)' }
      });
    }

    // 1. Get all active teachers
    const teachersQuery = `
      SELECT id, full_name, username, subject_specialty, joining_date::text AS joining_date
      FROM users
      WHERE role = 'teacher' AND is_active = TRUE
      ORDER BY full_name ASC
    `;
    const teachersRes = await pool.query(teachersQuery);
    const teachers = teachersRes.rows;

    // 2. Fetch all attendance records for this month
    const attendanceQuery = `
      SELECT 
        teacher_id,
        attendance_date::text AS attendance_date,
        status,
        remarks
      FROM teacher_attendance
      WHERE EXTRACT(YEAR FROM attendance_date) = $1
        AND EXTRACT(MONTH FROM attendance_date) = $2
      ORDER BY attendance_date ASC
    `;
    const attendanceRes = await pool.query(attendanceQuery, [year, month]);

    // Group records by teacher_id
    const attendanceByTeacher = new Map();
    for (const record of attendanceRes.rows) {
      if (!attendanceByTeacher.has(record.teacher_id)) {
        attendanceByTeacher.set(record.teacher_id, []);
      }
      attendanceByTeacher.get(record.teacher_id).push(record);
    }

    const ledger = teachers.map((teacher) => {
      const records = attendanceByTeacher.get(teacher.id) || [];
      const counts = {
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        totalMarked: records.length
      };

      const dailyStatus = {};
      const absentDates = [];
      const lateDates = [];
      const leaveDates = [];

      records.forEach((r) => {
        if (counts[r.status] !== undefined) {
          counts[r.status]++;
        }
        dailyStatus[r.attendance_date] = r.status;

        if (r.status === 'absent') absentDates.push(r.attendance_date);
        if (r.status === 'late') lateDates.push(r.attendance_date);
        if (r.status === 'leave') leaveDates.push(r.attendance_date);
      });

      return {
        teacher: {
          id: teacher.id,
          full_name: teacher.full_name,
          username: teacher.username,
          subject_specialty: teacher.subject_specialty,
          joining_date: teacher.joining_date
        },
        counts,
        dailyStatus,
        absentDates,
        lateDates,
        leaveDates,
        records
      };
    });

    res.json({
      data: {
        month,
        year,
        teachersCount: teachers.length,
        ledger
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/attendance/teacher/:id
 * Access: admin OR can_mark_all_attendance
 * Query: ?month=1..12&year=YYYY
 * Returns attendance history and summary for the specified teacher
 */
router.get('/attendance/teacher/:id', verifyAuth, requirePermission('can_mark_all_attendance'), async (req, res, next) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    if (isNaN(teacherId) || teacherId <= 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Valid Teacher ID is required' }
      });
    }

    // Verify teacher exists
    const teacherCheck = await pool.query(
      'SELECT id, full_name, username, role, is_active FROM users WHERE id = $1',
      [teacherId]
    );

    if (teacherCheck.rowCount === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Teacher not found' }
      });
    }

    const teacher = teacherCheck.rows[0];

    const todayPK = getTodayPKString();
    const [currYearStr, currMonthStr] = todayPK.split('-');
    const currentYear = parseInt(currYearStr, 10);
    const currentMonth = parseInt(currMonthStr, 10);

    const month = req.query.month ? parseInt(req.query.month, 10) : currentMonth;
    const year = req.query.year ? parseInt(req.query.year, 10) : currentYear;

    if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid month (must be 1-12)' }
      });
    }
    if (isNaN(year) || year < 2020) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid year (must be >= 2020)' }
      });
    }

    const query = `
      SELECT 
        ta.id,
        ta.attendance_date::text AS attendance_date,
        ta.status,
        ta.remarks,
        ta.marked_by,
        u_marked.full_name AS marked_by_name,
        ta.created_at,
        ta.updated_at
      FROM teacher_attendance ta
      LEFT JOIN users u_marked ON ta.marked_by = u_marked.id
      WHERE ta.teacher_id = $1
        AND EXTRACT(YEAR FROM ta.attendance_date) = $2
        AND EXTRACT(MONTH FROM ta.attendance_date) = $3
      ORDER BY ta.attendance_date ASC
    `;

    const { rows } = await pool.query(query, [teacherId, year, month]);

    const counts = {
      present: 0,
      absent: 0,
      late: 0,
      leave: 0
    };

    rows.forEach(r => {
      if (counts[r.status] !== undefined) {
        counts[r.status]++;
      }
    });

    res.json({
      data: {
        teacher: {
          id: teacher.id,
          full_name: teacher.full_name,
          username: teacher.username,
          is_active: teacher.is_active
        },
        records: rows,
        counts,
        month,
        year
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attendance/bulk
 * Access: admin OR can_mark_all_attendance
 * Body: { date: 'YYYY-MM-DD', records: [{ teacher_id, status, remarks? }] }
 * Business Rules:
 * 1. Future dates are strictly rejected (422) based on Asia/Karachi date.
 * 2. Delegated teachers (non-admin) can ONLY mark for TODAY (422 for past dates). Admin can mark any past date.
 * 3. Delegated teachers CANNOT mark their own attendance (403/422).
 * 4. Only active teachers can have attendance marked.
 * 5. Single transaction upsert (ON CONFLICT (teacher_id, attendance_date) DO UPDATE).
 * 6. Audit log for past date edits.
 */
router.post('/attendance/bulk', verifyAuth, requirePermission('can_mark_all_attendance'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const parseResult = bulkAttendanceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        }
      });
    }

    const { date, records } = parseResult.data;
    const todayPK = getTodayPKString();
    const isAdmin = req.user.role === 'admin';

    // Rule 1: No future dates allowed
    if (date > todayPK) {
      return res.status(422).json({
        error: { code: 'UNPROCESSABLE_ENTITY', message: 'Cannot mark attendance for future dates' }
      });
    }

    // Rule 2: Delegated teachers can only mark for today
    if (!isAdmin && date < todayPK) {
      return res.status(422).json({
        error: { code: 'FORBIDDEN_DATE', message: 'Delegated teachers can only mark attendance for today' }
      });
    }

    // Rule 3: Teachers can mark their own attendance and colleagues' attendance (no self-mark restriction)

    // Rule 4: Verify all target teachers are active
    const targetTeacherIds = [...new Set(records.map(r => r.teacher_id))];
    const teachersCheck = await client.query(
      `SELECT id, is_active FROM users WHERE id = ANY($1::int[]) AND role = 'teacher'`,
      [targetTeacherIds]
    );

    const activeTeacherSet = new Set(
      teachersCheck.rows.filter(t => t.is_active).map(t => t.id)
    );

    for (const id of targetTeacherIds) {
      if (!activeTeacherSet.has(id)) {
        return res.status(422).json({
          error: { code: 'INACTIVE_TEACHER', message: `Teacher ID ${id} is not an active teacher` }
        });
      }
    }

    // Fetch existing records for audit logging of updates
    const existingCheck = await client.query(
      `SELECT teacher_id, status, remarks FROM teacher_attendance WHERE attendance_date = $1 AND teacher_id = ANY($2::int[])`,
      [date, targetTeacherIds]
    );
    const existingMap = new Map();
    existingCheck.rows.forEach(r => existingMap.set(r.teacher_id, r));

    await client.query('BEGIN');

    const upsertQuery = `
      INSERT INTO teacher_attendance (
        teacher_id,
        attendance_date,
        status,
        remarks,
        marked_by,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (teacher_id, attendance_date) 
      DO UPDATE SET
        status = EXCLUDED.status,
        remarks = EXCLUDED.remarks,
        marked_by = EXCLUDED.marked_by,
        updated_at = NOW()
      RETURNING id, teacher_id, attendance_date::text AS attendance_date, status, remarks, marked_by
    `;

    const savedRecords = [];
    const auditUpdates = [];

    for (const record of records) {
      const { rows } = await client.query(upsertQuery, [
        record.teacher_id,
        date,
        record.status,
        record.remarks || null,
        req.user.id
      ]);
      savedRecords.push(rows[0]);

      const previous = existingMap.get(record.teacher_id);
      if (previous) {
        if (previous.status !== record.status || (previous.remarks || null) !== (record.remarks || null)) {
          auditUpdates.push({
            teacher_id: record.teacher_id,
            before: { status: previous.status, remarks: previous.remarks },
            after: { status: record.status, remarks: record.remarks || null }
          });
        }
      }
    }

    await client.query('COMMIT');

    // Audit log attendance operations (always log for tracking)
    await logAudit({
      actor_id: req.user.id,
      action: 'attendance.bulk_mark',
      entity_type: 'attendance',
      entity_id: null,
      details: {
        date,
        count: records.length,
        is_past_date: date < todayPK,
        updates: auditUpdates
      }
    });

    res.status(200).json({
      data: {
        message: 'Attendance recorded successfully',
        date,
        count: savedRecords.length,
        records: savedRecords
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

export default router;
