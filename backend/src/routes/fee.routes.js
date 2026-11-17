import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { logAudit } from '../services/audit.js';
import { getTodayPKString, clampDueDay, isPeriodOverdue } from '../services/billing.js';

const router = Router();

// Protect all fee routes: must be authenticated with can_manage_fees (or admin)
router.use(verifyAuth, requirePermission('can_manage_fees'));

const recordFeeSchema = z.object({
  student_id: z.coerce.number().int().positive('Student ID is required'),
  billing_month: z.coerce.number().int().min(1).max(12),
  billing_year: z.coerce.number().int().min(2020),
  status: z.enum(['paid', 'unpaid']),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Paid date must be YYYY-MM-DD').optional().nullable(),
  amount_paid: z.coerce.number().min(0).optional(),
  remarks: z.string().max(255).optional().nullable()
});

// GET /api/fees (Monthly sheet with implicit unpaid rows)
router.get('/fees', async (req, res, next) => {
  try {
    const todayPK = getTodayPKString();
    const currentYear = parseInt(todayPK.split('-')[0], 10);
    const currentMonth = parseInt(todayPK.split('-')[1], 10);

    const month = parseInt(req.query.month, 10) || currentMonth;
    const year = parseInt(req.query.year, 10) || currentYear;
    const grade = req.query.grade ? parseInt(req.query.grade, 10) : null;
    const statusFilter = req.query.status ? req.query.status.toLowerCase() : null;
    const search = req.query.search ? req.query.search.trim() : '';

    let extraConditions = [];
    let params = [month, year];

    if (grade) {
      params.push(grade);
      extraConditions.push(`s.grade = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      extraConditions.push(`(s.full_name ILIKE $${params.length} OR s.roll_no ILIKE $${params.length})`);
    }

    const extraWhere = extraConditions.length > 0 ? `AND ${extraConditions.join(' AND ')}` : '';

    const query = `
      SELECT s.id AS student_id, s.roll_no, s.full_name, s.grade, s.stream,
             s.fee_due_day, s.fee_note,
             f.id AS fee_record_id,
             COALESCE(f.fee_amount, s.monthly_fee) AS fee_amount,
             COALESCE(f.status, 'unpaid')          AS status,
             TO_CHAR(f.paid_date, 'YYYY-MM-DD')    AS paid_date,
             COALESCE(f.amount_paid, 0)            AS amount_paid,
             f.remarks,
             make_date($2, $1, LEAST(s.fee_due_day,
               EXTRACT(DAY FROM (make_date($2, $1, 1) + INTERVAL '1 month - 1 day'))::int))::text AS due_date
      FROM students s
      LEFT JOIN fee_records f
             ON f.student_id = s.id AND f.billing_month = $1 AND f.billing_year = $2
      WHERE (s.status = 'active' OR f.id IS NOT NULL)
        AND s.admission_date <= (make_date($2, $1, 1) + INTERVAL '1 month - 1 day')::date
        ${extraWhere}
      ORDER BY s.grade ASC, s.full_name ASC;
    `;

    const { rows } = await pool.query(query, params);

    const sheet = rows.map((row) => {
      const isOverdue = row.status === 'unpaid' && todayPK > row.due_date;
      return {
        ...row,
        fee_amount: parseFloat(row.fee_amount),
        amount_paid: parseFloat(row.amount_paid),
        is_overdue: isOverdue
      };
    });

    // Filter by status if specified (paid, unpaid, overdue)
    let filteredSheet = sheet;
    if (statusFilter === 'paid') {
      filteredSheet = sheet.filter(r => r.status === 'paid');
    } else if (statusFilter === 'unpaid') {
      filteredSheet = sheet.filter(r => r.status === 'unpaid' && !r.is_overdue);
    } else if (statusFilter === 'overdue') {
      filteredSheet = sheet.filter(r => r.is_overdue);
    }

    res.status(200).json({
      data: filteredSheet,
      meta: {
        month,
        year,
        total: filteredSheet.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/fees/summary
router.get('/fees/summary', async (req, res, next) => {
  try {
    const todayPK = getTodayPKString();
    const currentYear = parseInt(todayPK.split('-')[0], 10);
    const currentMonth = parseInt(todayPK.split('-')[1], 10);

    const month = parseInt(req.query.month, 10) || currentMonth;
    const year = parseInt(req.query.year, 10) || currentYear;
    const grade = req.query.grade ? parseInt(req.query.grade, 10) : null;

    let extraConditions = [];
    let params = [month, year];

    if (grade) {
      params.push(grade);
      extraConditions.push(`s.grade = $${params.length}`);
    }

    const extraWhere = extraConditions.length > 0 ? `AND ${extraConditions.join(' AND ')}` : '';

    const query = `
      SELECT s.id AS student_id,
             COALESCE(f.fee_amount, s.monthly_fee) AS fee_amount,
             COALESCE(f.status, 'unpaid')          AS status,
             COALESCE(f.amount_paid, 0)            AS amount_paid,
             make_date($2, $1, LEAST(s.fee_due_day,
               EXTRACT(DAY FROM (make_date($2, $1, 1) + INTERVAL '1 month - 1 day'))::int))::text AS due_date
      FROM students s
      LEFT JOIN fee_records f
             ON f.student_id = s.id AND f.billing_month = $1 AND f.billing_year = $2
      WHERE (s.status = 'active' OR f.id IS NOT NULL)
        AND s.admission_date <= (make_date($2, $1, 1) + INTERVAL '1 month - 1 day')::date
        ${extraWhere};
    `;

    const { rows } = await pool.query(query, params);

    let expected = 0;
    let collected = 0;
    let pending = 0;
    let overdueAmount = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let overdueCount = 0;

    for (const r of rows) {
      const feeAmt = parseFloat(r.fee_amount);
      const paidAmt = parseFloat(r.amount_paid);
      expected += feeAmt;
      collected += paidAmt;

      const isOverdue = r.status === 'unpaid' && todayPK > r.due_date;

      if (r.status === 'paid') {
        paidCount++;
      } else {
        pending += feeAmt;
        if (isOverdue) {
          overdueCount++;
          overdueAmount += feeAmt;
        } else {
          unpaidCount++;
        }
      }
    }

    res.status(200).json({
      data: {
        month,
        year,
        expected,
        collected,
        pending,
        overdue_amount: overdueAmount,
        counts: {
          paid: paidCount,
          unpaid: unpaidCount,
          overdue: overdueCount,
          total_students: rows.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/fees/student/:id (Lifetime ledger)
router.get('/fees/student/:id', async (req, res, next) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid student ID' } });
    }

    const studentRes = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
    }
    const student = studentRes.rows[0];

    const todayPK = getTodayPKString();

    const query = `
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', $2::date),
          date_trunc('month', today_pk()),
          '1 month'::interval
        )::date AS m_start
      )
      SELECT
        EXTRACT(MONTH FROM m.m_start)::int AS billing_month,
        EXTRACT(YEAR FROM m.m_start)::int  AS billing_year,
        f.id AS fee_record_id,
        COALESCE(f.fee_amount, $3)         AS fee_amount,
        COALESCE(f.status, 'unpaid')       AS status,
        TO_CHAR(f.paid_date, 'YYYY-MM-DD') AS paid_date,
        COALESCE(f.amount_paid, 0)         AS amount_paid,
        f.remarks,
        make_date(
          EXTRACT(YEAR FROM m.m_start)::int,
          EXTRACT(MONTH FROM m.m_start)::int,
          LEAST($4, EXTRACT(DAY FROM (m.m_start + INTERVAL '1 month - 1 day'))::int)
        )::text AS due_date
      FROM months m
      LEFT JOIN fee_records f
             ON f.student_id = $1
            AND f.billing_month = EXTRACT(MONTH FROM m.m_start)::int
            AND f.billing_year  = EXTRACT(YEAR FROM m.m_start)::int
      ORDER BY billing_year DESC, billing_month DESC;
    `;

    const { rows } = await pool.query(query, [
      studentId,
      student.admission_date,
      student.monthly_fee,
      student.fee_due_day
    ]);

    const ledger = rows.map((r) => {
      const isOverdue = r.status === 'unpaid' && todayPK > r.due_date;
      return {
        ...r,
        fee_amount: parseFloat(r.fee_amount),
        amount_paid: parseFloat(r.amount_paid),
        is_overdue: isOverdue
      };
    });

    res.status(200).json({
      data: {
        student: {
          id: student.id,
          roll_no: student.roll_no,
          full_name: student.full_name,
          grade: student.grade,
          stream: student.stream,
          monthly_fee: parseFloat(student.monthly_fee),
          fee_due_day: student.fee_due_day,
          fee_note: student.fee_note,
          admission_date: student.admission_date,
          status: student.status
        },
        ledger
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/fees/record (Upsert fee payment or revert)
router.post('/fees/record', async (req, res, next) => {
  try {
    const parsed = recordFeeSchema.parse(req.body);

    const studentRes = await pool.query('SELECT * FROM students WHERE id = $1', [parsed.student_id]);
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
    }
    const student = studentRes.rows[0];

    // Check admission date rule: no periods before admission month
    const [admYear, admMonth] = String(student.admission_date).split('-').map(Number);
    if (parsed.billing_year < admYear || (parsed.billing_year === admYear && parsed.billing_month < admMonth)) {
      return res.status(422).json({
        error: { code: 'INVALID_PERIOD', message: 'Cannot record fee for period prior to student admission date' }
      });
    }

    const todayPK = getTodayPKString();

    // Check existing record
    const existingRes = await pool.query(
      'SELECT * FROM fee_records WHERE student_id = $1 AND billing_month = $2 AND billing_year = $3',
      [parsed.student_id, parsed.billing_month, parsed.billing_year]
    );
    const existing = existingRes.rows[0];

    // Fee snapshot rule (BR-4): use existing snapshot if exists, otherwise student's current monthly_fee
    const feeAmount = existing ? parseFloat(existing.fee_amount) : parseFloat(student.monthly_fee);

    if (parsed.status === 'unpaid') {
      // Reversion check: only admin can revert a previously paid record
      if (existing && existing.status === 'paid') {
        if (req.user.role !== 'admin') {
          return res.status(403).json({
            error: { code: 'FORBIDDEN', message: 'Only administrators can revert a recorded payment' }
          });
        }
      }

      // Upsert as unpaid
      const upsertQuery = `
        INSERT INTO fee_records (
          student_id, billing_month, billing_year, fee_amount,
          amount_paid, status, paid_date, remarks, recorded_by
        )
        VALUES ($1, $2, $3, $4, 0, 'unpaid', NULL, $5, $6)
        ON CONFLICT (student_id, billing_month, billing_year)
        DO UPDATE SET amount_paid = 0, status = 'unpaid', paid_date = NULL,
                      remarks = EXCLUDED.remarks, recorded_by = EXCLUDED.recorded_by,
                      updated_at = NOW()
        RETURNING *;
      `;
      const { rows } = await pool.query(upsertQuery, [
        parsed.student_id,
        parsed.billing_month,
        parsed.billing_year,
        feeAmount,
        parsed.remarks || null,
        req.user.id
      ]);

      await logAudit({
        actorId: req.user.id,
        action: 'fee.revert',
        entityType: 'fee_record',
        entityId: rows[0].id,
        details: { student_id: parsed.student_id, billing_period: `${parsed.billing_month}/${parsed.billing_year}` }
      });

      return res.status(200).json({ data: rows[0] });
    }

    // Status is 'paid'
    const paidDate = parsed.paid_date || todayPK;
    if (paidDate > todayPK) {
      return res.status(422).json({
        error: { code: 'FUTURE_DATE', message: 'Paid date cannot be in the future' }
      });
    }

    const amountPaid = parsed.amount_paid !== undefined ? parsed.amount_paid : feeAmount;

    // Full payments only rule (SRS FR-FEE-09)
    if (amountPaid < feeAmount) {
      return res.status(422).json({
        error: { code: 'PARTIAL_PAYMENT_UNSUPPORTED', message: `Full fee required (expected ${feeAmount}, got ${amountPaid})` }
      });
    }

    const upsertQuery = `
      INSERT INTO fee_records (
        student_id, billing_month, billing_year, fee_amount,
        amount_paid, status, paid_date, remarks, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, 'paid', $6::date, $7, $8)
      ON CONFLICT (student_id, billing_month, billing_year)
      DO UPDATE SET amount_paid = EXCLUDED.amount_paid, status = 'paid',
                    paid_date = EXCLUDED.paid_date, remarks = EXCLUDED.remarks,
                    recorded_by = EXCLUDED.recorded_by, updated_at = NOW()
      RETURNING *;
    `;

    const { rows } = await pool.query(upsertQuery, [
      parsed.student_id,
      parsed.billing_month,
      parsed.billing_year,
      feeAmount,
      amountPaid,
      paidDate,
      parsed.remarks || null,
      req.user.id
    ]);

    await logAudit({
      actorId: req.user.id,
      action: 'fee.record',
      entityType: 'fee_record',
      entityId: rows[0].id,
      details: {
        student_id: parsed.student_id,
        billing_period: `${parsed.billing_month}/${parsed.billing_year}`,
        amount_paid: amountPaid,
        fee_amount: feeAmount
      }
    });

    res.status(200).json({ data: rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
