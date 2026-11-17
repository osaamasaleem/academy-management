import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_WINDOW_MIN * 60 * 1000,
  max: env.LOGIN_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many login attempts. Please try again later.'
    }
  }
});
