import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    // Quick DB connectivity check
    await pool.query('SELECT 1');
    res.status(200).json({
      data: {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }
    });
  } catch (error) {
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database connection failed',
        details: error.message
      }
    });
  }
});

export default router;
