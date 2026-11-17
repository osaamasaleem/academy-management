import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/academy_db'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  TZ: z.string().default('Asia/Karachi'),
  TRUST_PROXY: z.coerce.number().default(1),
  BCRYPT_COST: z.coerce.number().default(10),
  LOGIN_RATE_MAX: z.coerce.number().default(10),
  LOGIN_RATE_WINDOW_MIN: z.coerce.number().default(15),
  SEED_ADMIN_USERNAME: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().optional(),
  SEED_ADMIN_PHONE: z.string().optional()
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
