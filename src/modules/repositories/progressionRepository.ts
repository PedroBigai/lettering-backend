import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  calculateMatchXp,
  getPlayerProgression,
  type ProgressionAward,
} from '../game/progression';

export async function awardMatchProgression(
  connection: PoolConnection,
  playerId: string,
  userId: string,
  score: number,
): Promise<ProgressionAward | null> {
  const xpAwarded = calculateMatchXp(score);
  const [claim] = await connection.execute<ResultSetHeader>(
    `UPDATE match_players SET xp_awarded = ?
     WHERE id = ? AND xp_awarded = 0`,
    [xpAwarded, playerId],
  );
  if (claim.affectedRows === 0) return null;

  const [userRows] = await connection.execute<
    (RowDataPacket & { total_xp: number | string })[]
  >(
    'SELECT total_xp FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
    [userId],
  );
  const user = userRows[0];
  if (!user) throw new Error('Match player user could not be loaded');

  const previous = getPlayerProgression(Number(user.total_xp));
  const progression = getPlayerProgression(previous.totalXp + xpAwarded);
  await connection.execute(
    'UPDATE users SET total_xp = ? WHERE id = ?',
    [progression.totalXp, userId],
  );

  return {
    xpAwarded,
    previousLevel: previous.level,
    levelsGained: progression.level - previous.level,
    progression,
  };
}
