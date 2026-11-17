import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
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

if (env.NODE_ENV === 'development') {
  app.use(cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true
  }));
}

// Routes
app.use('/api', healthRoutes);

// Error handling
app.use(errorHandler);

export default app;
