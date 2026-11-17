import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { logAudit } from '../services/audit.js';

const router = Router();

// Constant-time dummy hash to defend against timing attacks
const DUMMY_HASH = '$2b$10$wT0l8o1v5V5v0v0v0v0v0.v0v0v0v0v0v0v0v0v0v0v0v0v0v0v0v';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'New password must be at least 8 characters long')
});

function formatUserResponse(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    username: user.username,
    role: user.role,
    permissions: {
      can_view_students: Boolean(user.can_view_students),
      can_manage_students: Boolean(user.can_manage_students),
      can_mark_all_attendance: Boolean(user.can_mark_all_attendance),
      can_manage_fees: Boolean(user.can_manage_fees)
    }
  };
}

function setAuthCookie(res, userId, tokenVersion) {
  const token = jwt.sign(
    { sub: userId, tv: tokenVersion },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  const isProduction = env.NODE_ENV === 'production' || env.COOKIE_SECURE;

  res.cookie('academy_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

// POST /api/auth/login
router.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const query = `
      SELECT id, full_name, username, password_hash, role, is_active, token_version,
             can_view_students, can_manage_students, can_mark_all_attendance, can_manage_fees
      FROM users
      WHERE LOWER(username) = LOWER($1)
    `;
    const { rows } = await pool.query(query, [username.trim()]);
    const user = rows[0];

    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(password, hashToCompare);

    if (!user || !isPasswordValid || !user.is_active) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      });
    }

    // Update last login timestamp
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    setAuthCookie(res, user.id, user.token_version);

    res.status(200).json({
      data: {
        user: formatUserResponse(user)
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/auth/logout', verifyAuth, (req, res) => {
  res.clearCookie('academy_token', { path: '/' });
  res.status(200).json({
    data: {
      message: 'Logged out successfully'
    }
  });
});

// GET /api/auth/me
router.get('/auth/me', verifyAuth, (req, res) => {
  res.status(200).json({
    data: {
      user: formatUserResponse(req.user)
    }
  });
});

// POST /api/auth/change-password
router.post('/auth/change-password', verifyAuth, async (req, res, next) => {
  try {
    const { current_password, new_password } = changePasswordSchema.parse(req.body);

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const currentHash = rows[0]?.password_hash;

    const isMatch = await bcrypt.compare(current_password, currentHash);
    if (!isMatch) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Incorrect current password'
        }
      });
    }

    const saltRounds = env.BCRYPT_COST || 10;
    const newHash = await bcrypt.hash(new_password, saltRounds);

    const updateQuery = `
      UPDATE users
      SET password_hash = $1,
          token_version = token_version + 1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING token_version;
    `;
    const updateResult = await pool.query(updateQuery, [newHash, req.user.id]);
    const newTokenVersion = updateResult.rows[0].token_version;

    // Log password change in audit logs
    await logAudit({
      actorId: req.user.id,
      action: 'auth.password_change',
      entityType: 'auth',
      entityId: req.user.id,
      details: { message: 'Password changed successfully' }
    });

    // Re-issue cookie with the bumped token_version for the active caller
    setAuthCookie(res, req.user.id, newTokenVersion);

    res.status(200).json({
      data: {
        message: 'Password changed successfully'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
