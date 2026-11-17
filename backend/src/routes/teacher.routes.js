import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logAudit } from '../services/audit.js';

const router = Router();

// Protect all teacher routes: authenticated + admin only
router.use('/teachers', verifyAuth, requireAdmin);

const createTeacherSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(120),
  username: z.string().min(1, 'Username is required').max(80),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  phone: z.string().min(1, 'Phone is required').max(25),
  cnic: z.string().regex(/^[0-9]{13}$/, 'CNIC must be 13 digits').optional().nullable().or(z.literal('')),
  subject_specialty: z.string().max(100).optional().nullable().or(z.literal('')),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Joining date must be YYYY-MM-DD').optional(),
  permissions: z.object({
    can_view_students: z.boolean().optional(),
    can_manage_students: z.boolean().optional(),
    can_mark_all_attendance: z.boolean().optional(),
    can_manage_fees: z.boolean().optional()
  }).optional()
});

const updateTeacherSchema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  username: z.string().min(1).max(80).optional(),
  phone: z.string().min(1).max(25).optional(),
  cnic: z.string().regex(/^[0-9]{13}$/, 'CNIC must be 13 digits').optional().nullable().or(z.literal('')),
  subject_specialty: z.string().max(100).optional().nullable().or(z.literal('')),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).optional(),
  can_view_students: z.boolean().optional(),
  can_manage_students: z.boolean().optional(),
  can_mark_all_attendance: z.boolean().optional(),
  can_manage_fees: z.boolean().optional(),
  role: z.any().optional() // explicitly handled for rejection
});

function maskCNIC(cnic) {
  if (!cnic || cnic.length < 4) return cnic;
  return '*********' + cnic.slice(-4);
}

// GET /api/teachers
router.get('/teachers', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;
    const search = req.query.search ? req.query.search.trim() : '';
    const isActiveFilter = req.query.is_active;

    let whereConditions = ["role = 'teacher'"];
    let params = [];

    if (isActiveFilter !== undefined && isActiveFilter !== '') {
      params.push(isActiveFilter === 'true');
      whereConditions.push(`is_active = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereConditions.push(`(full_name ILIKE $${params.length} OR username ILIKE $${params.length} OR phone ILIKE $${params.length})`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT id, full_name, username, phone, cnic, subject_specialty, joining_date,
             is_active, can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees,
             created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY full_name ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataResult = await pool.query(dataQuery, [...params, pageSize, offset]);

    const formattedTeachers = dataResult.rows.map(t => ({
      ...t,
      cnic: maskCNIC(t.cnic)
    }));

    res.status(200).json({
      data: formattedTeachers,
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

// GET /api/teachers/:id
router.get('/teachers/:id', async (req, res, next) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    if (isNaN(teacherId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid teacher ID' } });
    }

    const query = `
      SELECT id, full_name, username, phone, cnic, subject_specialty, joining_date,
             is_active, can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees,
             created_at, updated_at
      FROM users
      WHERE id = $1 AND role = 'teacher'
    `;
    const { rows } = await pool.query(query, [teacherId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
    }

    res.status(200).json({ data: rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/teachers
router.post('/teachers', async (req, res, next) => {
  try {
    const parsed = createTeacherSchema.parse(req.body);

    // Duplicate check for username (case-insensitive)
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [parsed.username.trim()]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: { code: 'USERNAME_TAKEN', message: 'Username is already taken' }
      });
    }

    // Duplicate check for CNIC if provided
    if (parsed.cnic) {
      const existingCnic = await pool.query('SELECT id FROM users WHERE cnic = $1', [parsed.cnic]);
      if (existingCnic.rows.length > 0) {
        return res.status(409).json({
          error: { code: 'CNIC_TAKEN', message: 'CNIC already registered to another user' }
        });
      }
    }

    const saltRounds = env.BCRYPT_COST || 10;
    const passwordHash = await bcrypt.hash(parsed.password, saltRounds);

    const perms = parsed.permissions || {};

    const insertQuery = `
      INSERT INTO users (
        full_name, username, password_hash, phone, role, cnic,
        subject_specialty, joining_date, is_active,
        can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees
      )
      VALUES ($1, $2, $3, $4, 'teacher', $5, $6, COALESCE($7::date, today_pk()), TRUE, $8, $9, $10, $11)
      RETURNING id, full_name, username, phone, cnic, subject_specialty, joining_date,
                is_active, can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees,
                created_at;
    `;

    const values = [
      parsed.full_name.trim(),
      parsed.username.trim(),
      passwordHash,
      parsed.phone.trim(),
      parsed.cnic || null,
      parsed.subject_specialty || null,
      parsed.joining_date || null,
      Boolean(perms.can_view_students),
      Boolean(perms.can_manage_students),
      Boolean(perms.can_mark_all_attendance),
      Boolean(perms.can_manage_fees)
    ];

    const { rows } = await pool.query(insertQuery, values);
    const newTeacher = rows[0];

    await logAudit({
      actorId: req.user.id,
      action: 'teacher.create',
      entityType: 'teacher',
      entityId: newTeacher.id,
      details: { username: newTeacher.username, full_name: newTeacher.full_name }
    });

    res.status(201).json({
      data: {
        ...newTeacher,
        cnic: maskCNIC(newTeacher.cnic)
      }
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/teachers/:id
router.patch('/teachers/:id', async (req, res, next) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    if (isNaN(teacherId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid teacher ID' } });
    }

    if (req.body.role) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Modifying user role is prohibited' }
      });
    }

    const targetUserRes = await pool.query('SELECT * FROM users WHERE id = $1', [teacherId]);
    if (targetUserRes.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
    }

    const targetUser = targetUserRes.rows[0];
    if (targetUser.role === 'admin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Admin account cannot be modified through teacher endpoints' }
      });
    }

    const parsed = updateTeacherSchema.parse(req.body);

    if (parsed.username && parsed.username.toLowerCase() !== targetUser.username.toLowerCase()) {
      const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [parsed.username.trim(), teacherId]);
      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: { code: 'USERNAME_TAKEN', message: 'Username is already taken by another user' }
        });
      }
    }

    if (parsed.cnic && parsed.cnic !== targetUser.cnic) {
      const existingCnic = await pool.query('SELECT id FROM users WHERE cnic = $1 AND id != $2', [parsed.cnic, teacherId]);
      if (existingCnic.rows.length > 0) {
        return res.status(409).json({
          error: { code: 'CNIC_TAKEN', message: 'CNIC already registered to another user' }
        });
      }
    }

    const updates = [];
    const values = [];

    const fieldMap = {
      full_name: parsed.full_name,
      username: parsed.username ? parsed.username.trim() : undefined,
      phone: parsed.phone,
      cnic: parsed.cnic === '' ? null : parsed.cnic,
      subject_specialty: parsed.subject_specialty === '' ? null : parsed.subject_specialty,
      joining_date: parsed.joining_date,
      is_active: parsed.is_active,
      can_view_students: parsed.can_view_students,
      can_manage_students: parsed.can_manage_students,
      can_mark_all_attendance: parsed.can_mark_all_attendance,
      can_manage_fees: parsed.can_manage_fees
    };

    for (const [key, val] of Object.entries(fieldMap)) {
      if (val !== undefined) {
        values.push(val);
        updates.push(`${key} = $${values.length}`);
      }
    }

    let passwordUpdated = false;
    if (parsed.password) {
      const saltRounds = env.BCRYPT_COST || 10;
      const hash = await bcrypt.hash(parsed.password, saltRounds);
      values.push(hash);
      updates.push(`password_hash = $${values.length}`);
      updates.push(`token_version = token_version + 1`);
      passwordUpdated = true;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { code: 'NO_CHANGES', message: 'No valid fields provided for update' } });
    }

    values.push(teacherId);
    const updateQuery = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, full_name, username, phone, cnic, subject_specialty, joining_date,
                is_active, can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees,
                updated_at;
    `;

    const { rows } = await pool.query(updateQuery, values);
    const updatedTeacher = rows[0];

    // Log changes to audit
    await logAudit({
      actorId: req.user.id,
      action: passwordUpdated ? 'teacher.password_reset' : 'teacher.update',
      entityType: 'teacher',
      entityId: teacherId,
      details: {
        updated_fields: Object.keys(parsed).filter(k => parsed[k] !== undefined)
      }
    });

    res.status(200).json({
      data: {
        ...updatedTeacher,
        cnic: maskCNIC(updatedTeacher.cnic)
      }
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/teachers/:id (Soft archive)
router.delete('/teachers/:id', async (req, res, next) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    if (isNaN(teacherId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid teacher ID' } });
    }

    const targetUserRes = await pool.query('SELECT role, is_active FROM users WHERE id = $1', [teacherId]);
    if (targetUserRes.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
    }

    if (targetUserRes.rows[0].role === 'admin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cannot archive the admin account' }
      });
    }

    await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [teacherId]);

    await logAudit({
      actorId: req.user.id,
      action: 'teacher.archive',
      entityType: 'teacher',
      entityId: teacherId,
      details: { message: 'Teacher archived' }
    });

    res.status(200).json({
      data: {
        id: teacherId,
        is_active: false,
        message: 'Teacher archived successfully'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
