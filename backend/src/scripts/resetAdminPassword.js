import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

async function resetAdminPassword() {
  const newPassword = process.argv[2] || env.SEED_ADMIN_PASSWORD || 'AdminPassword123!';

  try {
    const saltRounds = env.BCRYPT_COST || 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    const query = `
      UPDATE users
      SET password_hash = $1,
          token_version = token_version + 1,
          updated_at = NOW()
      WHERE role = 'admin'
      RETURNING id, full_name, username, token_version;
    `;

    const result = await pool.query(query, [passwordHash]);
    if (result.rowCount === 0) {
      console.error('No admin account found to reset.');
      process.exit(1);
    }

    console.log('Admin password reset successfully. Token version incremented:', result.rows[0]);
  } catch (error) {
    console.error('Failed to reset admin password:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();
