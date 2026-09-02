import type { Server } from 'node:http';
import { database } from './utils/database';
import { env } from './utils/env';
import { loadEnglishContent } from './modules/game/content';
import { AuthModule } from './modules/authModule';
import { MatchModule } from './modules/matchModule';
import { MysqlMatchRepository } from './modules/repositories/matchRepository';
import { MysqlUserRepository } from './modules/repositories/userRepository';
import { createApp } from './server/app';

let server: Server | undefined;
let cleanupTimer: NodeJS.Timeout | undefined;

async function bootstrap() {
  const content = await loadEnglishContent();
  await database.query('SELECT 1');

  const users = new MysqlUserRepository(database);
  const authModule = new AuthModule(users, {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresInSeconds: env.JWT_EXPIRES_IN_SECONDS,
  });
  const matches = new MysqlMatchRepository(database);
  const matchModule = new MatchModule(matches, content);
  const cleanupInactiveMatches = async () => {
    try {
      const expired = await matchModule.expireInactiveMatches(
        env.MATCH_INACTIVITY_TIMEOUT_SECONDS,
      );
      if (expired > 0) console.log(`Expired ${expired} inactive match player(s)`);
    } catch (error) {
      console.error('Failed to expire inactive matches', error);
    }
  };
  await cleanupInactiveMatches();
  cleanupTimer = setInterval(
    () => void cleanupInactiveMatches(),
    env.MATCH_CLEANUP_INTERVAL_SECONDS * 1_000,
  );
  cleanupTimer.unref();
  const app = createApp({
    authModule,
    matchModule,
    allowedOrigins: env.CORS_ORIGINS,
    enableRequestLogging: true,
  });
  server = app.listen(env.PORT, () => {
    console.log(
      `Lettering API listening on http://localhost:${env.PORT} ` +
        `with ${content.words.size} English words loaded`,
    );
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down...`);
  if (cleanupTimer) clearInterval(cleanupTimer);

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
