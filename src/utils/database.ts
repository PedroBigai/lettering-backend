import { createPool, type Pool } from 'mysql2/promise';
import { env } from './env';

export const database: Pool = createPool({
  uri: env.DATABASE_URL,
  connectionLimit: env.NODE_ENV === 'production' ? 10 : 5,
  timezone: 'Z',
});
