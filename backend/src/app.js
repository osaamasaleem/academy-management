import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import teacherRoutes from './routes/teacher.routes.js';
import studentRoutes from './routes/student.routes.js';
import feeRoutes from './routes/fee.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
});

if (env.TRUST_PROXY) {
  app.set('trust proxy', env.TRUST_PROXY);
}

app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(pinoHttp({
  logger,
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url
      };
    }
  }
}));

const allowedOrigins = [env.CLIENT_ORIGIN];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true
}));

// Routes
app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', teacherRoutes);
app.use('/api', studentRoutes);
app.use('/api', feeRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', dashboardRoutes);

// Error handling
app.use(errorHandler);

export default app;
