import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

async function seedAdmin() {
  const username = env.SEED_ADMIN_USERNAME || 'admin';
  const password = env.SEED_ADMIN_PASSWORD || 'AdminPassword123!';
  const fullName = env.SEED_ADMIN_NAME || 'Principal Admin';
  const phone = env.SEED_ADMIN_PHONE || '03001234567';

  try {
    const existingAdmin = await pool.query("SELECT id, username FROM users WHERE role = 'admin'");
    if (existingAdmin.rows.length > 0) {
      console.log(`Admin account already exists (username: ${existingAdmin.rows[0].username}). Skipping seeding.`);
      await pool.end();
      return;
    }

    const saltRounds = env.BCRYPT_COST || 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const insertQuery = `
      INSERT INTO users (
        full_name, username, password_hash, phone, role,
        can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees
      )
      VALUES ($1, $2, $3, $4, 'admin', TRUE, TRUE, TRUE, TRUE)
      RETURNING id, full_name, username, role;
    `;

    const result = await pool.query(insertQuery, [fullName, username, passwordHash, phone]);
    console.log('Principal admin account seeded successfully:', result.rows[0]);
  } catch (error) {
    console.error('Failed to seed admin:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();
