import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(3600),
  MATCH_INACTIVITY_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(1800),
  MATCH_CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  CORS_ORIGINS: z
    .string()
    .default(
      'http://localhost:4173,http://127.0.0.1:4173,http://localhost:5500,http://127.0.0.1:5500',
    )
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export const env = envSchema.parse(process.env);
