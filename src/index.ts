import type { Server } from 'node:http';
import { database } from './config/database';
import { env } from './config/env';
import { loadEnglishContent } from './game/content';
import { AuthService } from './modules/authService';
import { MysqlUserRepository } from './repositories/userRepository';
import { createApp } from './server/app';

let server: Server | undefined;

async function bootstrap() {
  const content = await loadEnglishContent();
  await database.query('SELECT 1');

  const users = new MysqlUserRepository(database);
  const authService = new AuthService(users, {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresInSeconds: env.JWT_EXPIRES_IN_SECONDS,
  });
  const app = createApp({ authService, allowedOrigins: env.CORS_ORIGINS });
  server = app.listen(env.PORT, () => {
    console.log(
      `Lettering API listening on http://localhost:${env.PORT} ` +
        `with ${content.words.size} English words loaded`,
    );
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down...`);

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await database.end();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

bootstrap().catch(async (error: unknown) => {
  console.error('Failed to initialize Lettering backend', error);
  await database.end();
  process.exit(1);
});
