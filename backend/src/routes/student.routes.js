import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { logAudit } from '../services/audit.js';

const router = Router();

const initialFeeRowSchema = z.object({
  billing_month: z.number().int().min(1).max(12),
  billing_year: z.number().int().min(2020),
  fee_amount: z.number().min(0),
  status: z.enum(['paid', 'unpaid', 'waived']),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  remarks: z.string().max(255).optional().nullable()
});

const createStudentSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(120),
  guardian_name: z.string().max(120).optional().nullable(),
  guardian_phone: z.string().min(1, 'Guardian phone is required').max(25),
  grade: z.coerce.number().int().min(1).max(12),
  stream: z.enum(['General', 'Science', 'ICS', 'Arts']).default('General'),
  monthly_fee: z.coerce.number().min(0, 'Monthly fee cannot be negative'),
  fee_due_day: z.coerce.number().int().min(1).max(31).default(1),
  fee_note: z.string().max(255).optional().nullable(),
  admission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Admission date must be YYYY-MM-DD').optional(),
  roll_no: z.string().max(30).optional().nullable().or(z.literal('')),
  initial_fee_history: z.array(initialFeeRowSchema).optional()
});

const updateStudentSchema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  guardian_name: z.string().max(120).optional().nullable(),
  guardian_phone: z.string().min(1).max(25).optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  stream: z.enum(['General', 'Science', 'ICS', 'Arts']).optional(),
  monthly_fee: z.coerce.number().min(0).optional(),
  fee_due_day: z.coerce.number().int().min(1).max(31).optional(),
  fee_note: z.string().max(255).optional().nullable(),
  admission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  roll_no: z.string().min(1).max(30).optional(),
  status: z.enum(['Active', 'Left', 'active', 'inactive']).optional()
});

const leaveStudentSchema = z.object({
  last_month: z.coerce.number().int().min(1).max(12),
  last_year: z.coerce.number().int().min(2020)
});

const returnStudentSchema = z.object({
  return_month: z.coerce.number().int().min(1).max(12),
  return_year: z.coerce.number().int().min(2020)
});

// GET /api/students (read permission)
router.get(
  '/students',
  verifyAuth,
  requirePermission('can_view_students', 'can_manage_students'),
  async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50));
      const offset = (page - 1) * pageSize;
      const search = req.query.search ? req.query.search.trim() : '';
      const grade = req.query.grade ? parseInt(req.query.grade) : null;
      const stream = req.query.stream ? req.query.stream.trim() : null;
      const status = req.query.status !== undefined ? req.query.status : 'active';

      let whereConditions = [];
      let params = [];

      if (status && status !== 'all') {
        if (status === 'active' || status === 'Active') {
          whereConditions.push(`status IN ('active', 'Active')`);
        } else if (status === 'Left') {
          whereConditions.push(`status = 'Left'`);
        } else if (status === 'inactive') {
          whereConditions.push(`status = 'inactive'`);
        } else {
          params.push(status);
          whereConditions.push(`status = $${params.length}`);
        }
      }

      if (grade) {
        params.push(grade);
        whereConditions.push(`grade = $${params.length}`);
      }

      if (stream) {
        params.push(stream);
        whereConditions.push(`stream = $${params.length}`);
      }

      if (search) {
        params.push(`%${search}%`);
        whereConditions.push(`(full_name ILIKE $${params.length} OR roll_no ILIKE $${params.length} OR guardian_phone ILIKE $${params.length})`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const countQuery = `SELECT COUNT(*) FROM students ${whereClause}`;
      const countRes = await pool.query(countQuery, params);
      const total = parseInt(countRes.rows[0].count, 10);

      const dataQuery = `
        SELECT id, roll_no, full_name, guardian_name, guardian_phone, grade, stream,
               monthly_fee, fee_due_day, fee_note, admission_date, status, enrollment_history,
               created_by, created_at, updated_at
        FROM students
        ${whereClause}
        ORDER BY grade ASC, full_name ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      const dataRes = await pool.query(dataQuery, [...params, pageSize, offset]);

      res.status(200).json({
        data: dataRes.rows,
        meta: { page, pageSize, total }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/students/:id (read permission)
router.get(
  '/students/:id',
  verifyAuth,
  requirePermission('can_view_students', 'can_manage_students'),
  async (req, res, next) => {
    try {
      const studentId = parseInt(req.params.id, 10);
      if (isNaN(studentId)) {
        return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid student ID' } });
      }

      const { rows } = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
      }

      res.status(200).json({ data: rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/students (write permission)
router.post(
  '/students',
  verifyAuth,
  requirePermission('can_manage_students'),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const parsed = createStudentSchema.parse(req.body);

      if (parsed.roll_no) {
        const existing = await client.query('SELECT id FROM students WHERE LOWER(roll_no) = LOWER($1)', [parsed.roll_no.trim()]);
        if (existing.rows.length > 0) {
          return res.status(409).json({
            error: { code: 'DUPLICATE_ROLL_NO', message: 'Roll number already exists' }
          });
        }
      }

      await client.query('BEGIN');

      const admDate = parsed.admission_date || new Date().toISOString().split('T')[0];
      const [admYear, admMonth] = admDate.split('-').map(Number);

      const initialEnrollment = JSON.stringify([
        {
          from_year: admYear,
          from_month: admMonth,
          to_year: null,
          to_month: null
        }
      ]);

      let insertQuery;
      let values;

      if (parsed.roll_no) {
        insertQuery = `
          INSERT INTO students (
            roll_no, full_name, guardian_name, guardian_phone, grade, stream,
            monthly_fee, fee_due_day, fee_note, admission_date, status, enrollment_history, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, 'Active', $11::jsonb, $12)
          RETURNING *;
        `;
        values = [
          parsed.roll_no.trim(),
          parsed.full_name.trim(),
          parsed.guardian_name ? parsed.guardian_name.trim() : null,
          parsed.guardian_phone.trim(),
          parsed.grade,
          parsed.stream,
          parsed.monthly_fee,
          parsed.fee_due_day,
          parsed.fee_note ? parsed.fee_note.trim() : null,
          admDate,
          initialEnrollment,
          req.user.id
        ];
      } else {
        insertQuery = `
          INSERT INTO students (
            full_name, guardian_name, guardian_phone, grade, stream,
            monthly_fee, fee_due_day, fee_note, admission_date, status, enrollment_history, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, 'Active', $10::jsonb, $11)
          RETURNING *;
        `;
        values = [
          parsed.full_name.trim(),
          parsed.guardian_name ? parsed.guardian_name.trim() : null,
          parsed.guardian_phone.trim(),
          parsed.grade,
          parsed.stream,
          parsed.monthly_fee,
          parsed.fee_due_day,
          parsed.fee_note ? parsed.fee_note.trim() : null,
          admDate,
          initialEnrollment,
          req.user.id
        ];
      }

      const { rows } = await client.query(insertQuery, values);
      const student = rows[0];

      // If initial historical fee records provided during onboarding, insert them
      if (Array.isArray(parsed.initial_fee_history) && parsed.initial_fee_history.length > 0) {
        for (const f of parsed.initial_fee_history) {
          const amountPaid = f.status === 'paid' ? f.fee_amount : 0;
          const paidDate = f.status === 'paid' ? (f.paid_date || admDate) : null;

          const feeInsert = `
            INSERT INTO fee_records (
              student_id, billing_month, billing_year, fee_amount,
              amount_paid, status, paid_date, remarks, recorded_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (student_id, billing_month, billing_year)
            DO UPDATE SET fee_amount = EXCLUDED.fee_amount, amount_paid = EXCLUDED.amount_paid,
                          status = EXCLUDED.status, paid_date = EXCLUDED.paid_date,
                          remarks = EXCLUDED.remarks, recorded_by = EXCLUDED.recorded_by;
          `;
          await client.query(feeInsert, [
            student.id,
            f.billing_month,
            f.billing_year,
            f.fee_amount,
            amountPaid,
            f.status,
            paidDate,
            f.remarks || null,
            req.user.id
          ]);
        }
      }

      await client.query('COMMIT');

      await logAudit({
        actorId: req.user.id,
        action: 'student.create',
        entityType: 'student',
        entityId: student.id,
        details: { roll_no: student.roll_no, full_name: student.full_name, grade: student.grade }
      });

      res.status(201).json({ data: student });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
);

// POST /api/students/:id/leave (Mark as Left)
router.post(
  '/students/:id/leave',
  verifyAuth,
  requirePermission('can_manage_students'),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const studentId = parseInt(req.params.id, 10);
      const { last_month, last_year } = leaveStudentSchema.parse(req.body);

      const stuRes = await client.query('SELECT * FROM students WHERE id = $1', [studentId]);
      if (stuRes.rows.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
      }
      const student = stuRes.rows[0];

      await client.query('BEGIN');

      // Update enrollment_history: find the active open interval and close it
      let history = Array.isArray(student.enrollment_history) ? [...student.enrollment_history] : [];
      if (history.length === 0) {
        const [admY, admM] = String(student.admission_date).split('-').map(Number);
        history = [{ from_year: admY, from_month: admM, to_year: last_year, to_month: last_month }];
      } else {
        const lastIdx = history.length - 1;
        history[lastIdx] = {
          ...history[lastIdx],
          to_year: last_year,
          to_month: last_month
        };
      }

      // Update student status to 'Left'
      await client.query(
        `UPDATE students SET status = 'Left', enrollment_history = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(history), studentId]
      );

      // Remove only unpaid rows strictly after last_month / last_year (never touch paid or waived)
      const deleteUnpaidRes = await client.query(
        `DELETE FROM fee_records
         WHERE student_id = $1
           AND status = 'unpaid'
           AND (billing_year > $2 OR (billing_year = $2 AND billing_month > $3))
         RETURNING id;`,
        [studentId, last_year, last_month]
      );

      await client.query('COMMIT');

      await logAudit({
        actorId: req.user.id,
        action: 'student.leave',
        entityType: 'student',
        entityId: studentId,
        details: {
          last_attended: `${last_month}/${last_year}`,
          unpaid_future_rows_removed: deleteUnpaidRes.rowCount
        }
      });

      res.status(200).json({
        data: {
          id: studentId,
          status: 'Left',
          last_attended: `${last_month}/${last_year}`,
          unpaid_future_rows_removed: deleteUnpaidRes.rowCount,
          message: 'Student marked as Left successfully'
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
);

// POST /api/students/:id/return (Return / Re-enroll)
router.post(
  '/students/:id/return',
  verifyAuth,
  requirePermission('can_manage_students'),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const studentId = parseInt(req.params.id, 10);
      const { return_month, return_year } = returnStudentSchema.parse(req.body);

      const stuRes = await client.query('SELECT * FROM students WHERE id = $1', [studentId]);
      if (stuRes.rows.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
      }
      const student = stuRes.rows[0];

      await client.query('BEGIN');

      let history = Array.isArray(student.enrollment_history) ? [...student.enrollment_history] : [];
      history.push({
        from_year: return_year,
        from_month: return_month,
        to_year: null,
        to_month: null
      });

      await client.query(
        `UPDATE students SET status = 'Active', enrollment_history = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(history), studentId]
      );

      await client.query('COMMIT');

      await logAudit({
        actorId: req.user.id,
        action: 'student.return',
        entityType: 'student',
        entityId: studentId,
        details: { return_period: `${return_month}/${return_year}` }
      });

      res.status(200).json({
        data: {
          id: studentId,
          status: 'Active',
          return_period: `${return_month}/${return_year}`,
          message: 'Student returned and reactivated successfully'
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
);

// PATCH /api/students/:id (write permission)
router.patch(
  '/students/:id',
  verifyAuth,
  requirePermission('can_manage_students'),
  async (req, res, next) => {
    try {
      const studentId = parseInt(req.params.id, 10);
      if (isNaN(studentId)) {
        return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid student ID' } });
      }

      const currentStudentRes = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
      if (currentStudentRes.rows.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
      }
      const current = currentStudentRes.rows[0];

      const parsed = updateStudentSchema.parse(req.body);

      if (parsed.roll_no && parsed.roll_no.toLowerCase() !== current.roll_no.toLowerCase()) {
        const existing = await pool.query('SELECT id FROM students WHERE LOWER(roll_no) = LOWER($1) AND id != $2', [parsed.roll_no.trim(), studentId]);
        if (existing.rows.length > 0) {
          return res.status(409).json({
            error: { code: 'DUPLICATE_ROLL_NO', message: 'Roll number already exists' }
          });
        }
      }

      const updates = [];
      const values = [];

      const fields = [
        'full_name', 'guardian_name', 'guardian_phone', 'grade', 'stream',
        'monthly_fee', 'fee_due_day', 'fee_note', 'admission_date', 'roll_no', 'status'
      ];

      for (const field of fields) {
        if (parsed[field] !== undefined) {
          values.push(parsed[field]);
          updates.push(`${field} = $${values.length}`);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: { code: 'NO_CHANGES', message: 'No fields to update' } });
      }

      values.push(studentId);
      const updateQuery = `
        UPDATE students
        SET ${updates.join(', ')}
        WHERE id = $${values.length}
        RETURNING *;
      `;

      const { rows } = await pool.query(updateQuery, values);
      const updated = rows[0];

      await logAudit({
        actorId: req.user.id,
        action: 'student.update',
        entityType: 'student',
        entityId: studentId,
        details: { updated_fields: Object.keys(parsed) }
      });

      res.status(200).json({ data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/students/:id (Archive)
router.delete(
  '/students/:id',
  verifyAuth,
  requirePermission('can_manage_students'),
  async (req, res, next) => {
    try {
      const studentId = parseInt(req.params.id, 10);
      if (isNaN(studentId)) {
        return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid student ID' } });
      }

      const { rows } = await pool.query('UPDATE students SET status = $1 WHERE id = $2 RETURNING id, full_name, status', ['inactive', studentId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
      }

      await logAudit({
        actorId: req.user.id,
        action: 'student.archive',
        entityType: 'student',
        entityId: studentId,
        details: { message: 'Student archived' }
      });

      res.status(200).json({
        data: {
          id: studentId,
          status: 'inactive',
          message: 'Student archived successfully'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
