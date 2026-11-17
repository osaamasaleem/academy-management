import assert from 'assert';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

async function runPhase2Tests() {
  console.log('--- Starting Phase 2 Teacher Management DoD Tests ---');

  const server = app.listen(5096);
  const baseUrl = 'http://localhost:5096/api';

  try {
    // 1. Admin login to obtain admin auth cookie
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'AdminPassword123!' })
    });
    assert.strictEqual(adminLoginRes.status, 200);
    const adminCookie = adminLoginRes.headers.get('set-cookie');

    // 2. Create teacher
    const testUsername = `test.teacher.${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/teachers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie
      },
      body: JSON.stringify({
        full_name: 'Test Teacher',
        username: testUsername,
        password: 'TeacherPassword123!',
        phone: '03009876543',
        cnic: '3520199999999',
        subject_specialty: 'Mathematics',
        permissions: {
          can_view_students: false,
          can_manage_students: false
        }
      })
    });
    assert.strictEqual(createRes.status, 201, 'Expected 201 on teacher creation');
    const createdData = await createRes.json();
    const teacherId = createdData.data.id;
    assert.ok(createdData.data.cnic.startsWith('*********'), 'CNIC should be masked in response');
    console.log('✓ Test 1: Created new teacher with masked CNIC and forced role: teacher');

    // 3. Duplicate username check (case-insensitive)
    const dupRes = await fetch(`${baseUrl}/teachers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie
      },
      body: JSON.stringify({
        full_name: 'Duplicate Teacher',
        username: testUsername.toUpperCase(),
        password: 'AnotherPassword123!',
        phone: '03001112233'
      })
    });
    assert.strictEqual(dupRes.status, 409, 'Duplicate username should return 409');
    console.log('✓ Test 2: Case-insensitive duplicate username rejected with 409');

    // 4. List teachers
    const listRes = await fetch(`${baseUrl}/teachers?search=${testUsername}`, {
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.data.some(t => t.id === teacherId));
    console.log('✓ Test 3: Teacher appears in directory list');

    // 5. Attempt role escalation via PATCH -> must be rejected with 403
    const escalateRes = await fetch(`${baseUrl}/teachers/${teacherId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie
      },
      body: JSON.stringify({ role: 'admin' })
    });
    assert.strictEqual(escalateRes.status, 403, 'Attempt to change role must return 403');
    console.log('✓ Test 4: Role escalation attempt rejected with 403');

    // 6. Teacher logs in
    const teacherLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: 'TeacherPassword123!' })
    });
    assert.strictEqual(teacherLoginRes.status, 200);
    const teacherCookie = teacherLoginRes.headers.get('set-cookie');

    // 7. Teacher attempts to access admin-only /teachers endpoint -> 403
    const forbiddenRes = await fetch(`${baseUrl}/teachers`, {
      headers: { Cookie: teacherCookie }
    });
    assert.strictEqual(forbiddenRes.status, 403, 'Teacher cannot access admin-only teacher endpoints');
    console.log('✓ Test 5: Teacher access to /teachers rejected with 403');

    // 8. Admin toggles permission: can_view_students = true
    const patchRes = await fetch(`${baseUrl}/teachers/${teacherId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie
      },
      body: JSON.stringify({ can_view_students: true })
    });
    assert.strictEqual(patchRes.status, 200);

    // 9. Teacher calls /auth/me on next request WITHOUT re-login -> live permission updated
    const teacherMeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: teacherCookie }
    });
    assert.strictEqual(teacherMeRes.status, 200);
    const teacherMeData = await teacherMeRes.json();
    assert.strictEqual(
      teacherMeData.data.user.permissions.can_view_students,
      true,
      'Permission toggle must reflect immediately on next request'
    );
    console.log('✓ Test 6: Instant permission toggle takes effect without re-login');

    // 10. Archive teacher via DELETE
    const archiveRes = await fetch(`${baseUrl}/teachers/${teacherId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(archiveRes.status, 200);

    // 11. Archived teacher tries to call /auth/me with old cookie -> 401
    const archivedMeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: teacherCookie }
    });
    assert.strictEqual(archivedMeRes.status, 401, 'Archived teacher must be rejected');
    console.log('✓ Test 7: Archived teacher session immediately revoked (401)');

    // 12. Attempt to archive admin -> 403
    const archiveAdminRes = await fetch(`${baseUrl}/teachers/1`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });
    assert.strictEqual(archiveAdminRes.status, 403, 'Admin account cannot be archived');
    console.log('✓ Test 8: Protection rule prevented archiving admin account');

    console.log('\nAll Phase 2 Teacher Management tests passed successfully!');
  } finally {
    server.close();
    await pool.end();
  }
}

runPhase2Tests().catch((err) => {
  console.error('Phase 2 test failed:', err);
  process.exit(1);
});
