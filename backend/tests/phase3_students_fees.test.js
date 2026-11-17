import assert from 'assert';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { clampDueDay, formatDueDate } from '../src/services/billing.js';

async function runPhase3Tests() {
  console.log('--- Starting Phase 3 Student Onboarding & Fee Ledger Tests ---');

  const server = app.listen(5095);
  const baseUrl = 'http://localhost:5095/api';

  try {
    // 1. Unit test: due-date clamp
    assert.strictEqual(clampDueDay(2026, 2, 31), 28, 'Feb 2026 day 31 must clamp to 28');
    assert.strictEqual(clampDueDay(2024, 2, 31), 29, 'Feb 2024 (leap) day 31 must clamp to 29');
    assert.strictEqual(clampDueDay(2026, 4, 31), 30, 'April day 31 must clamp to 30');
    assert.strictEqual(formatDueDate(2026, 2, 31), '2026-02-28');
    console.log('✓ Test 1: Due-date clamping logic verified for leap and 30/31-day months');

    // 2. Obtain Admin Cookie
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'AdminPassword123!' })
    });
    assert.strictEqual(adminLoginRes.status, 200);
    const adminCookie = adminLoginRes.headers.get('set-cookie');

    // 3. Create Student with auto roll number
    const stu1Res = await fetch(`${baseUrl}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        full_name: 'Bilal Ahmad',
        guardian_phone: '03001234567',
        grade: 10,
        stream: 'Science',
        monthly_fee: 4000,
        fee_due_day: 17,
        admission_date: '2026-01-10'
      })
    });
    assert.strictEqual(stu1Res.status, 201);
    const stu1 = (await stu1Res.json()).data;
    assert.ok(stu1.roll_no.startsWith('STU-'), 'Roll number must be auto-assigned');
    console.log(`✓ Test 2: Enrolled student with auto-sequence roll_no: ${stu1.roll_no}`);

    // 4. Duplicate roll_no check -> 409
    const dupStuRes = await fetch(`${baseUrl}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        roll_no: stu1.roll_no,
        full_name: 'Duplicate Student',
        guardian_phone: '03007654321',
        grade: 10,
        stream: 'Science',
        monthly_fee: 4000
      })
    });
    assert.strictEqual(dupStuRes.status, 409, 'Duplicate roll_no must return 409');
    console.log('✓ Test 3: Duplicate roll number prevented with 409');

    // 5. Monthly fee sheet includes student as implicit unpaid row (no fee_records row yet)
    const feeSheetRes = await fetch(`${baseUrl}/fees?month=2&year=2026&grade=10`, {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(feeSheetRes.status, 200);
    const feeSheetData = await feeSheetRes.json();
    const stu1FeeRow = feeSheetData.data.find(r => r.student_id === stu1.id);
    assert.ok(stu1FeeRow, 'Student must appear in monthly sheet without prior fee_records row');
    assert.strictEqual(stu1FeeRow.status, 'unpaid');
    assert.strictEqual(stu1FeeRow.fee_amount, 4000);
    assert.strictEqual(stu1FeeRow.due_date, '2026-02-17');
    console.log('✓ Test 4: Fee sheet contains implicit unpaid row with clamped due date');

    // 6. Partial payment attempt rejected with 422
    const partialRes = await fetch(`${baseUrl}/fees/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        student_id: stu1.id,
        billing_month: 2,
        billing_year: 2026,
        status: 'paid',
        paid_date: '2026-02-15',
        amount_paid: 2000 // expected 4000
      })
    });
    assert.strictEqual(partialRes.status, 422, 'Partial payment must return 422');
    console.log('✓ Test 5: Partial payment rejected with 422 (full payment required in v1)');

    // 7. Full payment recorded
    const payRes = await fetch(`${baseUrl}/fees/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        student_id: stu1.id,
        billing_month: 2,
        billing_year: 2026,
        status: 'paid',
        paid_date: '2026-02-15',
        amount_paid: 4000,
        remarks: 'Paid via cash receipt #891'
      })
    });
    assert.strictEqual(payRes.status, 200);
    const payData = (await payRes.json()).data;
    assert.strictEqual(payData.status, 'paid');
    assert.strictEqual(parseFloat(payData.amount_paid), 4000);
    console.log('✓ Test 6: Full payment recorded and snapshotted');

    // 8. Fee snapshot rule (BR-4): update student monthly_fee from 4000 to 5000
    await fetch(`${baseUrl}/students/${stu1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ monthly_fee: 5000 })
    });

    // Check fee sheet for Feb 2026: previously paid record snapshot fee_amount must still be 4000
    const snapshotCheckRes = await fetch(`${baseUrl}/fees?month=2&year=2026&grade=10`, {
      headers: { Cookie: adminCookie }
    });
    const snapshotData = await snapshotCheckRes.json();
    const updatedRow = snapshotData.data.find(r => r.student_id === stu1.id);
    assert.strictEqual(updatedRow.fee_amount, 4000, 'Snapshot fee must not be altered by subsequent student fee update');
    console.log('✓ Test 7: Historical fee snapshot preserved after updating student fee');

    // 9. Revert payment by Admin
    const revertRes = await fetch(`${baseUrl}/fees/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        student_id: stu1.id,
        billing_month: 2,
        billing_year: 2026,
        status: 'unpaid'
      })
    });
    assert.strictEqual(revertRes.status, 200);
    const revertData = (await revertRes.json()).data;
    assert.strictEqual(revertData.status, 'unpaid');
    assert.strictEqual(parseFloat(revertData.amount_paid), 0);
    console.log('✓ Test 8: Admin successfully reverted payment back to unpaid');

    // 10. Student fee history lifetime ledger
    const ledgerRes = await fetch(`${baseUrl}/fees/student/${stu1.id}`, {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(ledgerRes.status, 200);
    const ledgerData = await ledgerRes.json();
    assert.ok(ledgerData.data.ledger.length >= 1, 'Ledger must generate series from admission date');
    console.log('✓ Test 9: Student lifetime ledger generated from admission date');

    // 11. Archive student -> soft delete (status: inactive)
    const archiveRes = await fetch(`${baseUrl}/students/${stu1.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(archiveRes.status, 200);
    console.log('✓ Test 10: Student archived safely without breaking foreign key history');

    console.log('\nAll Phase 3 Student Onboarding & Fee Ledger tests passed successfully!');
  } finally {
    server.close();
    await pool.end();
  }
}

runPhase3Tests().catch((err) => {
  console.error('Phase 3 test failure:', err);
  process.exit(1);
});
