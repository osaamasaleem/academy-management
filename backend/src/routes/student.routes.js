import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { logAudit } from '../services/audit.js';

const router = Router();

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
  roll_no: z.string().max(30).optional().nullable().or(z.literal(''))
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
  status: z.enum(['active', 'inactive']).optional()
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
        params.push(status);
        whereConditions.push(`status = $${params.length}`);
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
               monthly_fee, fee_due_day, fee_note, admission_date, status,
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
    try {
      const parsed = createStudentSchema.parse(req.body);

      if (parsed.roll_no) {
        const existing = await pool.query('SELECT id FROM students WHERE LOWER(roll_no) = LOWER($1)', [parsed.roll_no.trim()]);
        if (existing.rows.length > 0) {
          return res.status(409).json({
            error: { code: 'DUPLICATE_ROLL_NO', message: 'Roll number already exists' }
          });
        }
      }

      let insertQuery;
      let values;

      if (parsed.roll_no) {
        insertQuery = `
          INSERT INTO students (
            roll_no, full_name, guardian_name, guardian_phone, grade, stream,
            monthly_fee, fee_due_day, fee_note, admission_date, status, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, today_pk()), 'active', $11)
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
          parsed.admission_date || null,
          req.user.id
        ];
      } else {
        insertQuery = `
          INSERT INTO students (
            full_name, guardian_name, guardian_phone, grade, stream,
            monthly_fee, fee_due_day, fee_note, admission_date, status, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, today_pk()), 'active', $10)
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
          parsed.admission_date || null,
          req.user.id
        ];
      }

      const { rows } = await pool.query(insertQuery, values);
      const student = rows[0];

      await logAudit({
        actorId: req.user.id,
        action: 'student.create',
        entityType: 'student',
        entityId: student.id,
        details: { roll_no: student.roll_no, full_name: student.full_name, grade: student.grade }
      });

      res.status(201).json({ data: student });
    } catch (error) {
      next(error);
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
