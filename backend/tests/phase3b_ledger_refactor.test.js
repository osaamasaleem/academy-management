/**
 * Phase 3b – Fee Ledger Refactor Tests
 *
 * Tests:
 *  1. New student has status=Active and open enrollment_history
 *  2. Bulk dry-run returns preview without committing
 *  3. Bulk set_fee commits new fee_amount
 *  4. Bulk waive marks row waived and excludes from outstanding balance
 *  5. Bulk mark_paid records payment
 *  6. Repeated bulk waive is idempotent (no duplicate rows)
 *  7. Mark student as Left removes future unpaid rows
 *  8. Return student creates new open enrollment interval
 *  9. Current month row exists after return
 * 10. Paid rows are preserved after leave/return cycle
 *
 * Run: node backend/tests/phase3b_ledger_refactor.test.js
 */

import assert from 'assert';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

const PORT = 5097;
const BASE = `http://localhost:${PORT}/api`;

let adminCookie = '';
let testStudentId = null;

/* ─── Helpers ──────────────────────────────────────────────────────── */
function karachi() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
}
function currentYearMonth() {
  const d = karachi();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

async function api(method, path, body, cookie) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  return fetch(`${BASE}${path}`, opts);
}

/** Fetch student lifetime ledger */
async function getLedger(studentId) {
  const r = await api('GET', `/fees/student/${studentId}`, undefined, adminCookie);
  assert.strictEqual(r.status, 200, `GET /fees/student/${studentId} must return 200`);
  const body = await r.json();
  return body.data; // { student, ledger }
}

/** Fetch a fresh copy of the student record */
async function getStudent(studentId) {
  const r = await api('GET', `/students/${studentId}`, undefined, adminCookie);
  assert.strictEqual(r.status, 200, `GET /students/${studentId} must return 200`);
  const body = await r.json();
  return body.data; // student object
}

/* ─── Runner ───────────────────────────────────────────────────────── */
async function runPhase3bTests() {
  console.log('--- Starting Phase 3b Fee Ledger Refactor Tests ---');

  const server = app.listen(PORT);

  try {
    /* ── Setup: admin login ─────────────────────────────── */
    const loginRes = await api('POST', '/auth/login', {
      username: 'admin',
      password: 'AdminPassword123!',
    });
    assert.strictEqual(loginRes.status, 200, 'Admin login must succeed');
    adminCookie = loginRes.headers.get('set-cookie');

    /* ══════════════════════════════════════════════════════
       Test 1: New student has status=Active + enrollment_history
       ══════════════════════════════════════════════════════ */
    const admDate = new Date(karachi());
    admDate.setMonth(admDate.getMonth() - 3);
    const admissionDate = admDate.toISOString().split('T')[0];

    const createRes = await api('POST', '/students', {
      full_name: 'Ledger Refactor Test Student',
      guardian_name: 'Test Guardian',
      guardian_phone: '03001112223',
      grade: 7,
      stream: 'General',
      admission_date: admissionDate,
      monthly_fee: 1500,
      fee_due_day: 10,
    }, adminCookie);
    assert.strictEqual(createRes.status, 201, 'Create student returns 201');
    const createBody = await createRes.json();
    const student = createBody.data;
    assert.ok(student?.id, 'Response has student with id');
    assert.strictEqual(student.status, 'Active', "Student status defaults to 'Active'");
    assert.ok(Array.isArray(student.enrollment_history), 'enrollment_history is an array');
    assert.ok(student.enrollment_history.length > 0, 'enrollment_history is non-empty');
    const interval0 = student.enrollment_history[0];
    assert.ok(interval0.to_year === null && interval0.to_month === null, 'First interval is open-ended');
    testStudentId = student.id;
    console.log(`✓ Test 1: New student Active with open enrollment_history (ID: ${testStudentId})`);

    /* ══════════════════════════════════════════════════════
       Test 2: Bulk dry-run returns preview WITHOUT committing
       ══════════════════════════════════════════════════════ */
    const { ledger: ledger1 } = await getLedger(testStudentId);
    const unpaid1 = ledger1.filter(r => r.status === 'unpaid');
    assert.ok(unpaid1.length > 0, `Ledger has unpaid rows (found ${unpaid1.length})`);

    const target2 = unpaid1[0];
    const feeBeforeDryRun = target2.fee_amount;

    const dryRunRes = await api('POST', '/fees/bulk', {
      student_id: testStudentId,
      action: 'set_fee',
      periods: [{ billing_year: target2.billing_year, billing_month: target2.billing_month }],
      fee_amount: 9999,
      dry_run: true,
    }, adminCookie);
    assert.strictEqual(dryRunRes.status, 200, 'Dry-run returns 200');
    const dryRunBody = await dryRunRes.json();
    // response may be wrapped in data or at top level
    const dryRunData = dryRunBody.data || dryRunBody;
    assert.strictEqual(dryRunData.dry_run, true, 'Response includes dry_run: true');
    assert.ok(Array.isArray(dryRunData.preview), 'Response has preview array');
    assert.ok(dryRunData.preview.length > 0, 'Preview is non-empty');
    if (dryRunData.preview[0]?.after) {
      assert.strictEqual(dryRunData.preview[0].after.fee_amount, 9999, 'Preview shows new fee = 9999');
    }

    // Confirm NOT committed
    const { ledger: ledger1b } = await getLedger(testStudentId);
    const rowAfterDryRun = ledger1b.find(
      r => r.billing_year === target2.billing_year && r.billing_month === target2.billing_month
    );
    assert.strictEqual(rowAfterDryRun?.fee_amount, feeBeforeDryRun, 'Dry-run did NOT commit changes');
    console.log('✓ Test 2: Bulk dry-run returns preview without committing');

    /* ══════════════════════════════════════════════════════
       Test 3: Bulk set_fee commits change to multiple rows
       ══════════════════════════════════════════════════════ */
    const { ledger: ledger2 } = await getLedger(testStudentId);
    const unpaid2 = ledger2.filter(r => r.status === 'unpaid');
    assert.ok(unpaid2.length >= 1, 'Need at least 1 unpaid row for set_fee test');

    const periods3 = unpaid2.slice(0, Math.min(2, unpaid2.length)).map(r => ({
      billing_year: r.billing_year,
      billing_month: r.billing_month
    }));

    const setFeeRes = await api('POST', '/fees/bulk', {
      student_id: testStudentId,
      action: 'set_fee',
      periods: periods3,
      fee_amount: 2000,
      dry_run: false,
    }, adminCookie);
    assert.strictEqual(setFeeRes.status, 200, 'Bulk set_fee returns 200');
    const setFeeBody = await setFeeRes.json();
    const setFeeData = setFeeBody.data || setFeeBody;
    assert.ok(
      (setFeeData.affected ?? setFeeData.affected_count ?? 0) >= periods3.length,
      `Affected count >= ${periods3.length}`
    );

    const { ledger: ledger2b } = await getLedger(testStudentId);
    for (const p of periods3) {
      const row = ledger2b.find(r => r.billing_year === p.billing_year && r.billing_month === p.billing_month);
      assert.strictEqual(row?.fee_amount, 2000, `Row ${p.billing_year}/${p.billing_month} fee_amount = 2000`);
    }
    console.log('✓ Test 3: Bulk set_fee committed fee changes to multiple rows');

    /* ══════════════════════════════════════════════════════
       Test 4: Bulk waive marks row waived, excludes from outstanding balance
       ══════════════════════════════════════════════════════ */
    const { ledger: ledger3, student: stu3 } = await getLedger(testStudentId);
    const unpaid3 = ledger3.filter(r => r.status === 'unpaid');
    assert.ok(unpaid3.length >= 1, 'Need at least 1 unpaid row for waive test');

    const waiveTarget = unpaid3[0];
    // Calculate outstanding balance before waive (unpaid & enrolled rows)
    const balanceBefore = ledger3
      .filter(r => r.status === 'unpaid' && r.is_enrolled)
      .reduce((sum, r) => sum + r.fee_amount, 0);

    const waiveRes = await api('POST', '/fees/bulk', {
      student_id: testStudentId,
      action: 'waive',
      periods: [{ billing_year: waiveTarget.billing_year, billing_month: waiveTarget.billing_month }],
      remarks: 'Pre-system history test',
      dry_run: false,
    }, adminCookie);
    assert.strictEqual(waiveRes.status, 200, 'Bulk waive returns 200');

    const { ledger: ledger3b } = await getLedger(testStudentId);
    const waivedRow = ledger3b.find(
      r => r.billing_year === waiveTarget.billing_year && r.billing_month === waiveTarget.billing_month
    );
    assert.strictEqual(waivedRow?.status, 'waived', "Row status is 'waived'");

    // Outstanding should decrease (waived excluded)
    const balanceAfter = ledger3b
      .filter(r => r.status === 'unpaid' && r.is_enrolled)
      .reduce((sum, r) => sum + r.fee_amount, 0);
    assert.ok(balanceAfter < balanceBefore, `Outstanding balance decreased (${balanceBefore} → ${balanceAfter})`);
    console.log('✓ Test 4: Bulk waive marks row waived and reduces outstanding balance');

    /* ══════════════════════════════════════════════════════
       Test 5: Bulk mark_paid records payment correctly
       ══════════════════════════════════════════════════════ */
    const { ledger: ledger4 } = await getLedger(testStudentId);
    const unpaid4 = ledger4.filter(r => r.status === 'unpaid');
    assert.ok(unpaid4.length >= 1, 'Need at least 1 unpaid row for mark_paid test');

    const paidTarget = unpaid4[0];
    const paidDate = karachi().toISOString().split('T')[0];

    const markPaidRes = await api('POST', '/fees/bulk', {
      student_id: testStudentId,
      action: 'mark_paid',
      periods: [{ billing_year: paidTarget.billing_year, billing_month: paidTarget.billing_month }],
      paid_date: paidDate,
      dry_run: false,
    }, adminCookie);
    assert.strictEqual(markPaidRes.status, 200, 'Bulk mark_paid returns 200');

    const { ledger: ledger4b } = await getLedger(testStudentId);
    const paidRow = ledger4b.find(
      r => r.billing_year === paidTarget.billing_year && r.billing_month === paidTarget.billing_month
    );
    assert.strictEqual(paidRow?.status, 'paid', "Row is now 'paid'");
    console.log('✓ Test 5: Bulk mark_paid records payment correctly');

    /* ══════════════════════════════════════════════════════
       Test 6: Repeated waive is idempotent — no duplicate rows
       ══════════════════════════════════════════════════════ */
    const { ledger: ledger5 } = await getLedger(testStudentId);
    const unpaid5 = ledger5.filter(r => r.status === 'unpaid');

    if (unpaid5.length > 0) {
      const dup = unpaid5[0];
      await api('POST', '/fees/bulk', {
        student_id: testStudentId,
        action: 'waive',
        periods: [{ billing_year: dup.billing_year, billing_month: dup.billing_month }],
        remarks: 'First waive',
        dry_run: false,
      }, adminCookie);
      await api('POST', '/fees/bulk', {
        student_id: testStudentId,
        action: 'waive',
        periods: [{ billing_year: dup.billing_year, billing_month: dup.billing_month }],
        remarks: 'Second waive idempotent',
        dry_run: false,
      }, adminCookie);

      const { ledger: ledger5b } = await getLedger(testStudentId);
      const dupRows = ledger5b.filter(
        r => r.billing_year === dup.billing_year && r.billing_month === dup.billing_month
      );
      assert.strictEqual(dupRows.length, 1, `Only 1 row for period ${dup.billing_year}/${dup.billing_month} (got ${dupRows.length})`);
    }
    console.log('✓ Test 6: Repeated bulk actions do not create duplicate rows');

    /* ══════════════════════════════════════════════════════
       Test 7: Mark student as Left — removes future unpaid rows, keeps paid
       ══════════════════════════════════════════════════════ */
    const { year: cy, month: cm } = currentYearMonth();
    let lastMonth = cm - 1;
    let lastYear = cy;
    if (lastMonth === 0) { lastMonth = 12; lastYear--; }

    // Count paid rows before leave — these must survive
    const { ledger: ledgerBeforeLeave } = await getLedger(testStudentId);
    const paidBefore = ledgerBeforeLeave.filter(r => r.status === 'paid').length;

    const leaveRes = await api('POST', `/students/${testStudentId}/leave`, {
      last_month: lastMonth,
      last_year: lastYear,
    }, adminCookie);
    assert.strictEqual(leaveRes.status, 200, 'Leave returns 200');
    const leaveBody = await leaveRes.json();
    const leaveData = leaveBody.data || leaveBody;
    assert.strictEqual(leaveData.status, 'Left', "Response status is 'Left'");

    // Re-fetch student to verify enrollment_history
    const stuAfterLeave = await getStudent(testStudentId);
    assert.strictEqual(stuAfterLeave.status, 'Left', "Student status in DB is 'Left'");
    const histAfterLeave = Array.isArray(stuAfterLeave.enrollment_history) ? stuAfterLeave.enrollment_history : [];
    assert.ok(histAfterLeave.length > 0, 'enrollment_history is non-empty after leave');
    const lastInterval = histAfterLeave[histAfterLeave.length - 1];
    assert.strictEqual(lastInterval.to_year, lastYear, `Interval closed to_year = ${lastYear}`);
    assert.strictEqual(lastInterval.to_month, lastMonth, `Interval closed to_month = ${lastMonth}`);

    // No future unpaid rows
    const { ledger: ledgerAfterLeave } = await getLedger(testStudentId);
    const futureUnpaid = ledgerAfterLeave.filter(r =>
      r.status === 'unpaid' && r.is_enrolled &&
      (r.billing_year > lastYear || (r.billing_year === lastYear && r.billing_month > lastMonth))
    );
    assert.strictEqual(futureUnpaid.length, 0, `No future unpaid rows after leave (found ${futureUnpaid.length})`);

    // Paid rows preserved
    const paidAfterLeave = ledgerAfterLeave.filter(r => r.status === 'paid').length;
    assert.strictEqual(paidAfterLeave, paidBefore, `Paid rows unchanged: ${paidBefore} → ${paidAfterLeave}`);
    console.log(`✓ Test 7: Student marked Left at ${lastYear}/${lastMonth}, future unpaid removed, paid rows kept`);

    /* ══════════════════════════════════════════════════════
       Test 8: Return student — new open interval added
       ══════════════════════════════════════════════════════ */
    const returnRes = await api('POST', `/students/${testStudentId}/return`, {
      return_month: cm,
      return_year: cy,
    }, adminCookie);
    assert.strictEqual(returnRes.status, 200, 'Return returns 200');
    const returnBody = await returnRes.json();
    const returnData = returnBody.data || returnBody;
    assert.strictEqual(returnData.status, 'Active', "Response status is 'Active'");

    const stuAfterReturn = await getStudent(testStudentId);
    assert.strictEqual(stuAfterReturn.status, 'Active', "Student status in DB is 'Active'");
    const histAfterReturn = Array.isArray(stuAfterReturn.enrollment_history) ? stuAfterReturn.enrollment_history : [];
    assert.ok(histAfterReturn.length >= 2, `enrollment_history has >= 2 intervals (got ${histAfterReturn.length})`);
    const newInterval = histAfterReturn[histAfterReturn.length - 1];
    assert.strictEqual(newInterval.from_year, cy, `New interval from_year = ${cy}`);
    assert.strictEqual(newInterval.from_month, cm, `New interval from_month = ${cm}`);
    assert.ok(newInterval.to_year === null && newInterval.to_month === null, 'New interval is open-ended');
    console.log(`✓ Test 8: Student returned at ${cy}/${cm}, new open interval added`);

    /* ══════════════════════════════════════════════════════
       Test 9: Current month row exists in ledger after return
       ══════════════════════════════════════════════════════ */
    const { ledger: ledger9 } = await getLedger(testStudentId);
    const currentRow = ledger9.find(r => r.billing_year === cy && r.billing_month === cm);
    assert.ok(currentRow, `Current month ${cy}/${cm} row is present in ledger`);
    assert.notStrictEqual(currentRow.status, 'not_enrolled', 'Current month is not marked not_enrolled');
    assert.ok(currentRow.is_enrolled, 'Current month row is marked is_enrolled = true');
    console.log(`✓ Test 9: Current month ${cy}/${cm} present in ledger (status: ${currentRow.status})`);

    /* ══════════════════════════════════════════════════════
       Test 10: Paid rows still present after leave/return
       ══════════════════════════════════════════════════════ */
    const { ledger: ledger10 } = await getLedger(testStudentId);
    const paidRowsNow = ledger10.filter(r => r.status === 'paid');
    assert.ok(paidRowsNow.length > 0, `Paid rows preserved after full leave/return cycle (found ${paidRowsNow.length})`);
    console.log(`✓ Test 10: Paid rows preserved after leave/return cycle (${paidRowsNow.length} paid rows)`);

    console.log('\nAll Phase 3b Ledger Refactor tests passed successfully!');
  } finally {
    // Archive the test student to avoid polluting DB
    if (testStudentId) {
      await api('DELETE', `/students/${testStudentId}`, undefined, adminCookie);
    }
    await pool.end();
    server.close();
  }
}

runPhase3bTests().catch(err => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
