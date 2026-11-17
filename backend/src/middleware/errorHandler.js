import { ZodError } from 'zod';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = (statusCode === 500 && env.NODE_ENV === 'production')
    ? 'An unexpected error occurred'
    : err.message || 'Something went wrong';

  if (statusCode >= 500) {
    console.error(`[Unhandled Error] ${req.method} ${req.url}:`, err);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {})
    }
  });
};
