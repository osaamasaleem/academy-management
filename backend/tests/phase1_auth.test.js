import assert from 'assert';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

async function runTests() {
  console.log('--- Starting Phase 1 Auth DoD Tests ---');

  const server = app.listen(5097);
  const baseUrl = 'http://localhost:5097/api';

  try {
    // 1. Invalid credentials -> 401 generic
    const resBad = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'InvalidPassword' })
    });
    assert.strictEqual(resBad.status, 401, 'Expected 401 on bad password');
    const badJson = await resBad.json();
    assert.strictEqual(badJson.error.code, 'INVALID_CREDENTIALS');
    console.log('✓ Test 1: Invalid login returns 401 generic error');

    // 2. Valid login -> 200, sets HttpOnly cookie, returns user data
    const resGood = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'AdminPassword123!' })
    });
    assert.strictEqual(resGood.status, 200, 'Expected 200 on good login');
    const setCookie = resGood.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('academy_token='), 'Cookie academy_token should be set');
    assert.ok(setCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');
    const goodJson = await resGood.json();
    assert.strictEqual(goodJson.data.user.role, 'admin');
    console.log('✓ Test 2: Valid login returns 200 and sets HttpOnly cookie');

    // 3. /auth/me with cookie -> 200 live permissions
    const resMe = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: setCookie }
    });
    assert.strictEqual(resMe.status, 200);
    const meJson = await resMe.json();
    assert.strictEqual(meJson.data.user.username, 'admin');
    assert.strictEqual(meJson.data.user.permissions.can_manage_students, true);
    console.log('✓ Test 3: /api/auth/me returns live permissions');

    // 4. /auth/me without cookie -> 401
    const resNoCookie = await fetch(`${baseUrl}/auth/me`);
    assert.strictEqual(resNoCookie.status, 401);
    console.log('✓ Test 4: /api/auth/me without cookie returns 401');

    // 5. Change password & verify session bump
    const resChange = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: setCookie
      },
      body: JSON.stringify({
        current_password: 'AdminPassword123!',
        new_password: 'NewAdminPassword456!'
      })
    });
    assert.strictEqual(resChange.status, 200);
    const newCookie = resChange.headers.get('set-cookie');
    assert.ok(newCookie && newCookie.includes('academy_token='));
    console.log('✓ Test 5: /api/auth/change-password updates password and re-issues cookie');

    // 6. Old cookie should now be rejected because token_version bumped
    const resOldCookie = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: setCookie }
    });
    assert.strictEqual(resOldCookie.status, 401, 'Old cookie must be invalidated after token_version bump');
    console.log('✓ Test 6: Old session token invalidated by token_version bump');

    // 7. Reset password back to AdminPassword123! so admin remains predictable
    const resReset = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: newCookie
      },
      body: JSON.stringify({
        current_password: 'NewAdminPassword456!',
        new_password: 'AdminPassword123!'
      })
    });
    assert.strictEqual(resReset.status, 200);
    console.log('✓ Test 7: Restored initial admin password');

    console.log('\nAll Phase 1 tests passed successfully!');
  } finally {
    server.close();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('Phase 1 test failure:', err);
  process.exit(1);
});
