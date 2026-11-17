import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

export async function verifyAuth(req, res, next) {
  try {
    const token = req.cookies?.academy_token;
    if (!token) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' }
      });
    }

    const payload = jwt.verify(token, env.JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT id, full_name, username, role, is_active, token_version,
              can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees,
              can_view_audit_logs
       FROM users WHERE id = $1`,
      [payload.sub]
    );

    const user = rows[0];
    if (!user || !user.is_active || user.token_version !== payload.tv) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Session invalid or expired' }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Session invalid or expired' }
    });
  }
}
