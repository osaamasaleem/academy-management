import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { logAudit } from '../services/audit.js';
import { getTodayPKString, clampDueDay, isPeriodOverdue, isEnrolledInPeriod } from '../services/billing.js';

const router = Router();

// Protect all fee routes: must be authenticated with can_manage_fees (or admin)
router.use('/fees', verifyAuth, requirePermission('can_manage_fees'));

const recordFeeSchema = z.object({
  student_id: z.coerce.number().int().positive('Student ID is required'),
  billing_month: z.coerce.number().int().min(1).max(12),
  billing_year: z.coerce.number().int().min(2020),
  status: z.enum(['paid', 'unpaid', 'waived']),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Paid date must be YYYY-MM-DD').optional().nullable(),
  fee_amount: z.coerce.number().min(0).optional(),
  amount_paid: z.coerce.number().min(0).optional(),
  remarks: z.string().max(255).optional().nullable()
});

const bulkFeeSchema = z.object({
  student_id: z.coerce.number().int().positive('Student ID is required'),
  periods: z.array(z.object({
    billing_month: z.number().int().min(1).max(12),
    billing_year: z.number().int().min(2020)
  })).min(1, 'At least one period must be selected'),
  action: z.enum(['set_fee', 'mark_paid', 'waive']),
  fee_amount: z.coerce.number().min(0).optional(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  remarks: z.string().max(255).optional().nullable(),
  dry_run: z.boolean().default(false)
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
    const studentStatusFilter = req.query.student_status ? req.query.student_status.toLowerCase() : 'active';

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

    // Student status filtering:
    // 'active' (default): only students who are currently active (s.status = 'active')
    // 'all': all students (active, inactive, Left)
    // 'inactive': archived students (s.status = 'inactive')
    if (studentStatusFilter === 'active') {
      extraConditions.push(`s.status IN ('active', 'Active')`);
    } else if (studentStatusFilter === 'inactive') {
      extraConditions.push(`s.status = 'inactive'`);
    }

    const extraWhere = extraConditions.length > 0 ? `AND ${extraConditions.join(' AND ')}` : '';

    const query = `
      SELECT s.id AS student_id, s.roll_no, s.full_name, s.grade, s.stream,
             s.fee_due_day, s.fee_note, s.payment_habit, s.status AS student_status, s.enrollment_history,
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
      WHERE s.admission_date <= (make_date($2, $1, 1) + INTERVAL '1 month - 1 day')::date
        ${extraWhere}
      ORDER BY s.grade ASC, s.full_name ASC;
    `;

    const { rows } = await pool.query(query, params);

    const sheet = rows
      .filter((row) => {
        // If row is not from fee_records, verify student was actually enrolled in this month
        if (!row.fee_record_id) {
          return isEnrolledInPeriod(row.enrollment_history, year, month);
        }
        return true;
      })
      .map((row) => {
        const isOverdue = row.status === 'unpaid' && todayPK > row.due_date;
        return {
          student_id: row.student_id,
          roll_no: row.roll_no,
          full_name: row.full_name,
          grade: row.grade,
          stream: row.stream,
          fee_due_day: row.fee_due_day,
          fee_note: row.fee_note,
          payment_habit: row.payment_habit || 'advance',
          student_status: row.student_status,
          fee_record_id: row.fee_record_id,
          fee_amount: parseFloat(row.fee_amount),
          amount_paid: parseFloat(row.amount_paid),
          status: row.status,
          paid_date: row.paid_date,
          remarks: row.remarks,
          due_date: row.due_date,
          is_overdue: isOverdue
        };
      });

    let filteredSheet = sheet;
    if (statusFilter === 'paid') {
      filteredSheet = sheet.filter(r => r.status === 'paid');
    } else if (statusFilter === 'unpaid') {
      filteredSheet = sheet.filter(r => r.status === 'unpaid' && !r.is_overdue);
    } else if (statusFilter === 'overdue') {
      filteredSheet = sheet.filter(r => r.is_overdue);
    } else if (statusFilter === 'waived') {
      filteredSheet = sheet.filter(r => r.status === 'waived');
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
    const studentStatusFilter = req.query.student_status ? req.query.student_status.toLowerCase() : 'active';

    let extraConditions = [];
    let params = [month, year];

    if (grade) {
      params.push(grade);
      extraConditions.push(`s.grade = $${params.length}`);
    }

    if (studentStatusFilter === 'active') {
      extraConditions.push(`s.status IN ('active', 'Active')`);
    } else if (studentStatusFilter === 'inactive') {
      extraConditions.push(`s.status = 'inactive'`);
    }

    const extraWhere = extraConditions.length > 0 ? `AND ${extraConditions.join(' AND ')}` : '';

    const query = `
      SELECT s.id AS student_id, s.enrollment_history,
             f.id AS fee_record_id,
             COALESCE(f.fee_amount, s.monthly_fee) AS fee_amount,
             COALESCE(f.status, 'unpaid')          AS status,
             COALESCE(f.amount_paid, 0)            AS amount_paid,
             make_date($2, $1, LEAST(s.fee_due_day,
               EXTRACT(DAY FROM (make_date($2, $1, 1) + INTERVAL '1 month - 1 day'))::int))::text AS due_date
      FROM students s
      LEFT JOIN fee_records f
             ON f.student_id = s.id AND f.billing_month = $1 AND f.billing_year = $2
      WHERE s.admission_date <= (make_date($2, $1, 1) + INTERVAL '1 month - 1 day')::date
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
    let waivedCount = 0;
    let totalEligible = 0;

    for (const r of rows) {
      if (!r.fee_record_id && !isEnrolledInPeriod(r.enrollment_history, year, month)) {
        continue;
      }
      totalEligible++;

      const feeAmt = parseFloat(r.fee_amount);
      const paidAmt = parseFloat(r.amount_paid);

      if (r.status === 'waived') {
        waivedCount++;
        continue; // Waived rows excluded from expected, pending and overdue counts
      }

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
          waived: waivedCount,
          total_students: totalEligible
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/fees/student/:id (Lifetime ledger with gaps and open-ended enrollment)
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
    const enrollmentHistory = Array.isArray(student.enrollment_history) ? student.enrollment_history : [];

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
        f.status                           AS db_status,
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
      const isEnrolled = isEnrolledInPeriod(enrollmentHistory, r.billing_year, r.billing_month);

      if (!isEnrolled && !r.fee_record_id) {
        // Month in a gap without fee record
        return {
          billing_month: r.billing_month,
          billing_year: r.billing_year,
          fee_record_id: null,
          fee_amount: 0,
          status: 'not_enrolled',
          paid_date: null,
          amount_paid: 0,
          remarks: 'Not enrolled',
          due_date: r.due_date,
          is_overdue: false,
          is_enrolled: false
        };
      }

      const status = r.db_status || 'unpaid';
      const isOverdue = isEnrolled && status === 'unpaid' && todayPK > r.due_date;

      return {
        billing_month: r.billing_month,
        billing_year: r.billing_year,
        fee_record_id: r.fee_record_id,
        fee_amount: parseFloat(r.fee_amount),
        status,
        paid_date: r.paid_date,
        amount_paid: parseFloat(r.amount_paid),
        remarks: r.remarks,
        due_date: r.due_date,
        is_overdue: isOverdue,
        is_enrolled: isEnrolled
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
          payment_habit: student.payment_habit || 'advance',
          admission_date: student.admission_date,
          status: student.status,
          enrollment_history: enrollmentHistory
        },
        ledger
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/fees/bulk (Bulk actions: Set Fee, Mark Paid, Waive, with Dry Run & Transaction)
router.post('/fees/bulk', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const parsed = bulkFeeSchema.parse(req.body);

    const stuRes = await client.query('SELECT * FROM students WHERE id = $1', [parsed.student_id]);
    if (stuRes.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Student not found' } });
    }
    const student = stuRes.rows[0];
    const todayPK = getTodayPKString();

    // Query existing fee_records for the selected periods
    const existingMap = new Map();
    for (const p of parsed.periods) {
      const { rows } = await client.query(
        'SELECT * FROM fee_records WHERE student_id = $1 AND billing_month = $2 AND billing_year = $3',
        [parsed.student_id, p.billing_month, p.billing_year]
      );
      if (rows[0]) {
        existingMap.set(`${p.billing_year}-${p.billing_month}`, rows[0]);
      }
    }

    // Dry Run calculation
    if (parsed.dry_run) {
      const preview = parsed.periods.map(p => {
        const key = `${p.billing_year}-${p.billing_month}`;
        const existing = existingMap.get(key);
        const currentFee = existing ? parseFloat(existing.fee_amount) : parseFloat(student.monthly_fee);
        const currentStatus = existing ? existing.status : 'unpaid';

        let nextFee = currentFee;
        let nextStatus = currentStatus;

        if (parsed.action === 'set_fee') {
          nextFee = parsed.fee_amount !== undefined ? parsed.fee_amount : currentFee;
        } else if (parsed.action === 'mark_paid') {
          nextStatus = 'paid';
          nextFee = parsed.fee_amount !== undefined ? parsed.fee_amount : currentFee;
        } else if (parsed.action === 'waive') {
          nextStatus = 'waived';
        }

        return {
          month: p.billing_month,
          year: p.billing_year,
          before: { fee_amount: currentFee, status: currentStatus },
          after: { fee_amount: nextFee, status: nextStatus }
        };
      });

      return res.status(200).json({
        data: {
          dry_run: true,
          action: parsed.action,
          affected_count: parsed.periods.length,
          preview
        }
      });
    }

    // Execute within a single Transaction
    await client.query('BEGIN');

    for (const p of parsed.periods) {
      const key = `${p.billing_year}-${p.billing_month}`;
      const existing = existingMap.get(key);
      const snapshotFee = existing ? parseFloat(existing.fee_amount) : parseFloat(student.monthly_fee);

      if (parsed.action === 'set_fee') {
        const newFee = parsed.fee_amount !== undefined ? parsed.fee_amount : snapshotFee;
        const currentStatus = existing ? existing.status : 'unpaid';
        const currentPaidAmt = currentStatus === 'paid' ? newFee : 0;
        const paidDate = currentStatus === 'paid' ? (existing?.paid_date || todayPK) : null;

        const upsert = `
          INSERT INTO fee_records (
            student_id, billing_month, billing_year, fee_amount,
            amount_paid, status, paid_date, remarks, recorded_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (student_id, billing_month, billing_year)
          DO UPDATE SET fee_amount = EXCLUDED.fee_amount,
                        amount_paid = EXCLUDED.amount_paid,
                        updated_at = NOW();
        `;
        await client.query(upsert, [
          parsed.student_id,
          p.billing_month,
          p.billing_year,
          newFee,
          currentPaidAmt,
          currentStatus,
          paidDate,
          existing?.remarks || null,
          req.user.id
        ]);
      } else if (parsed.action === 'mark_paid') {
        const feeToPay = parsed.fee_amount !== undefined ? parsed.fee_amount : snapshotFee;
        const datePaid = parsed.paid_date || todayPK;

        const upsert = `
          INSERT INTO fee_records (
            student_id, billing_month, billing_year, fee_amount,
            amount_paid, status, paid_date, remarks, recorded_by
          )
          VALUES ($1, $2, $3, $4, $5, 'paid', $6::date, $7, $8)
          ON CONFLICT (student_id, billing_month, billing_year)
          DO UPDATE SET fee_amount = CASE WHEN fee_records.status = 'unpaid' THEN EXCLUDED.fee_amount ELSE fee_records.fee_amount END,
                        amount_paid = EXCLUDED.fee_amount,
                        status = 'paid',
                        paid_date = EXCLUDED.paid_date,
                        remarks = COALESCE(EXCLUDED.remarks, fee_records.remarks),
                        recorded_by = EXCLUDED.recorded_by,
                        updated_at = NOW();
        `;
        await client.query(upsert, [
          parsed.student_id,
          p.billing_month,
          p.billing_year,
          feeToPay,
          feeToPay,
          datePaid,
          parsed.remarks || null,
          req.user.id
        ]);
      } else if (parsed.action === 'waive') {
        const waiveReason = parsed.remarks || 'Pre-system history';

        const upsert = `
          INSERT INTO fee_records (
            student_id, billing_month, billing_year, fee_amount,
            amount_paid, status, paid_date, remarks, recorded_by
          )
          VALUES ($1, $2, $3, $4, 0, 'waived', NULL, $5, $6)
          ON CONFLICT (student_id, billing_month, billing_year)
          DO UPDATE SET amount_paid = 0,
                        status = 'waived',
                        paid_date = NULL,
                        remarks = EXCLUDED.remarks,
                        recorded_by = EXCLUDED.recorded_by,
                        updated_at = NOW();
        `;
        await client.query(upsert, [
          parsed.student_id,
          p.billing_month,
          p.billing_year,
          snapshotFee,
          waiveReason,
          req.user.id
        ]);
      }
    }

    await client.query('COMMIT');

    await logAudit({
      actorId: req.user.id,
      action: `fee.bulk_${parsed.action}`,
      entityType: 'fee_record',
      entityId: parsed.student_id,
      details: {
        action: parsed.action,
        affected_periods_count: parsed.periods.length,
        periods: parsed.periods.map(p => `${p.billing_month}/${p.billing_year}`),
        data: { fee_amount: parsed.fee_amount, paid_date: parsed.paid_date, remarks: parsed.remarks }
      }
    });

    res.status(200).json({
      data: {
        success: true,
        action: parsed.action,
        affected_count: parsed.periods.length,
        message: `Successfully updated ${parsed.periods.length} billing periods`
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// POST /api/fees/record (Single-row upsert, mark paid, revert, or waive)
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

    const existingRes = await pool.query(
      'SELECT * FROM fee_records WHERE student_id = $1 AND billing_month = $2 AND billing_year = $3',
      [parsed.student_id, parsed.billing_month, parsed.billing_year]
    );
    const existing = existingRes.rows[0];

    // Preserve snapshot fee amount
    const feeAmount = parsed.fee_amount !== undefined
      ? parsed.fee_amount
      : (existing ? parseFloat(existing.fee_amount) : parseFloat(student.monthly_fee));

    if (parsed.status === 'waived') {
      const upsertQuery = `
        INSERT INTO fee_records (
          student_id, billing_month, billing_year, fee_amount,
          amount_paid, status, paid_date, remarks, recorded_by
        )
        VALUES ($1, $2, $3, $4, 0, 'waived', NULL, $5, $6)
        ON CONFLICT (student_id, billing_month, billing_year)
        DO UPDATE SET amount_paid = 0, status = 'waived', paid_date = NULL,
                      remarks = EXCLUDED.remarks, recorded_by = EXCLUDED.recorded_by,
                      updated_at = NOW()
        RETURNING *;
      `;
      const { rows } = await pool.query(upsertQuery, [
        parsed.student_id,
        parsed.billing_month,
        parsed.billing_year,
        feeAmount,
        parsed.remarks || 'Pre-system history',
        req.user.id
      ]);

      await logAudit({
        actorId: req.user.id,
        action: 'fee.waive',
        entityType: 'fee_record',
        entityId: rows[0].id,
        details: { student_id: parsed.student_id, period: `${parsed.billing_month}/${parsed.billing_year}` }
      });

      return res.status(200).json({ data: rows[0] });
    }

    if (parsed.status === 'unpaid') {
      // Revert check: only admin can revert a previously paid record
      if (existing && existing.status === 'paid') {
        if (req.user.role !== 'admin') {
          return res.status(403).json({
            error: { code: 'FORBIDDEN', message: 'Only administrators can revert a recorded payment' }
          });
        }
      }

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
