import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Backend API running on port ${PORT} in ${env.NODE_ENV} mode`);
});

// Graceful shutdown on SIGTERM / SIGINT
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await pool.end();
      console.log('Database pool drained.');
      process.exit(0);
    } catch (err) {
      console.error('Error during pool drainage:', err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
