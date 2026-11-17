import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

export default router;
