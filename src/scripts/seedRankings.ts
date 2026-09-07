import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mysql, { type PoolConnection } from 'mysql2/promise';
import { env } from '../utils/env';
import { VALID_THEMES } from '../modules/game/contentSchemas';

const BOT_COUNT = 120;
const WORD_TARGETS = [5, 10, 25, 50] as const;

type SeedMatch = {
  matchId: string;
  playerId: string;
  userId: string;
  mode: 'classic' | 'hardcore' | 'learning';
  theme: string | null;
  wordTarget: number | null;
  score: number;
  gameTimeMs: number;
  playerStatus: 'game_over' | 'completed';
};

type SeedValue = string | number | Date | null;

async function insertChunks(
  connection: PoolConnection,
  prefix: string,
  rows: SeedValue[][],
  columnsPerRow: number,
): Promise<void> {
  for (let start = 0; start < rows.length; start += 250) {
    const chunk = rows.slice(start, start + 250);
    const placeholders = chunk.map(() => `(${Array(columnsPerRow).fill('?').join(',')})`).join(',');
    await connection.execute(`${prefix} ${placeholders}`, chunk.flat());
  }
}

async function seedRankings(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Ranking demo data cannot be created in production');
  }

  const pool = mysql.createPool({ uri: env.DATABASE_URL, timezone: 'Z' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM users WHERE email LIKE 'ranking-bot-%@lettering.test'");

    const passwordHash = await bcrypt.hash(randomUUID(), 4);
    const users = Array.from({ length: BOT_COUNT }, (_, index) => ({
      id: randomUUID(),
      username: `RANKBOT${String(index + 1).padStart(3, '0')}`,
      email: `ranking-bot-${String(index + 1).padStart(3, '0')}@lettering.test`,
    }));
    await insertChunks(
      connection,
      'INSERT INTO users (id, username, email, password_hash) VALUES',
      users.map((user) => [user.id, user.username, user.email, passwordHash]),
      4,
    );

    const matches: SeedMatch[] = [];
    for (const [index, user] of users.entries()) {
      const rank = index + 1;
      for (const mode of ['classic', 'hardcore'] as const) {
        matches.push({
          matchId: randomUUID(), playerId: randomUUID(), userId: user.id, mode,
          theme: null, wordTarget: null,
          score: Math.max(10, 1250 - rank * 7 - (mode === 'hardcore' ? 90 : 0)),
          gameTimeMs: 55_000 + rank * 1_750,
          playerStatus: 'game_over',
        });
      }

      for (const theme of VALID_THEMES) {
        for (const wordTarget of WORD_TARGETS) {
          matches.push({
            matchId: randomUUID(), playerId: randomUUID(), userId: user.id,
            mode: 'learning', theme, wordTarget,
            score: Math.max(10, wordTarget * 120 - rank),
            gameTimeMs: wordTarget * 18_000 + rank * 2_250,
            playerStatus: 'completed',
          });
        }
      }
    }

    await insertChunks(
      connection,
      `INSERT INTO matches
       (id, language, mode, theme, target_word_count, status, started_at, finished_at)
       VALUES`,
      matches.map((match) => [
        match.matchId, 'en-US', match.mode, match.theme, match.wordTarget,
        'finished', new Date(Date.now() - match.gameTimeMs), new Date(),
      ]),
      8,
    );
    await insertChunks(
      connection,
      `INSERT INTO match_players
       (id, match_id, user_id, status, score, level_reached, lives_remaining,
        board_version, game_time_ms, joined_at, finished_at)
       VALUES`,
      matches.map((match) => [
        match.playerId, match.matchId, match.userId, match.playerStatus, match.score,
        1, 0, 1, match.gameTimeMs,
        new Date(Date.now() - match.gameTimeMs), new Date(),
      ]),
      11,
    );

    await connection.commit();
    console.log(`Created ${users.length} ranking bots and ${matches.length} completed matches`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seedRankings().catch((error: unknown) => {
  console.error('Ranking seed failed', error);
  process.exitCode = 1;
});
