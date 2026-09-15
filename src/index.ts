import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { database } from './utils/database';
import { env } from './utils/env';
import { loadEnglishContent } from './modules/game/content';
import { AuthModule } from './modules/authModule';
import { MatchModule } from './modules/matchModule';
import { MysqlMatchRepository } from './modules/repositories/matchRepository';
import { MysqlUserRepository } from './modules/repositories/userRepository';
import { VersusManager } from './modules/versus/versusManager';
import { createApp } from './server/app';
import { FlashcardModule } from './modules/flashcardModule';
import { MysqlFlashcardRepository } from './modules/repositories/flashcardRepository';

let server: Server | undefined;
let wss: WebSocketServer | undefined;
let versusManager: VersusManager | undefined;
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
  const flashcardModule = new FlashcardModule(new MysqlFlashcardRepository(database));
  const cleanupInactiveMatches = async () => {
    try {
      const expired = await matchModule.expireInactiveMatches(
        env.MATCH_INACTIVITY_TIMEOUT_SECONDS,
      );
      await flashcardModule.expireInactiveSessions(env.MATCH_INACTIVITY_TIMEOUT_SECONDS);
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
  versusManager = new VersusManager(database, authModule, content);

  const app = createApp({
    authModule,
    matchModule,
    flashcardModule,
    allowedOrigins: env.CORS_ORIGINS,
    enableRequestLogging: true,
  });
  server = app.listen(env.PORT, () => {
    console.log(
      `Lettering API listening on http://localhost:${env.PORT} ` +
        `with ${content.words.size} English words loaded`,
    );
  });

  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token') ?? undefined;
    versusManager?.handleConnection(ws, token);
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down...`);
  if (cleanupTimer) clearInterval(cleanupTimer);

  if (versusManager) versusManager.close();

  if (wss) {
    await new Promise<void>((resolve) => {
      wss?.close(() => resolve());
    });
  }

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
