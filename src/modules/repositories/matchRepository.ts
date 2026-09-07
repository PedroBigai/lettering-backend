import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { BoardCell } from '../../interfaces/game';
import type {
  ConfirmWordRecord,
  ConfirmWordResult,
  MatchRepository,
  MatchHistoryPage,
  MatchSnapshotRecord,
  NewMatch,
  PlacePieceRecord,
  PlacePieceResult,
  RankingQuery,
  RankingResult,
} from '../../interfaces/match';
import { applyGravity, findLandingRow } from '../game/boardEngine';
import { findFirstWord } from '../game/wordDetector';
import { ApiError } from '../../server/errors';

type MatchRow = RowDataPacket & {
  id: string;
  language: string;
  mode: string;
  theme: string | null;
  target_word_count: number | null;
  status: string;
  board_rows: number;
  board_columns: number;
  min_word_length: number;
  started_at: Date | null;
  player_id: string;
  player_status: string;
  score: number;
  level_reached: number;
  lives_remaining: number;
  board_version: number;
  game_time_ms: number;
  paused_at: Date | null;
};

type PieceRow = RowDataPacket & {
  id: string;
  letter: string;
  sequence_number: number;
  status: string;
  row_position: number | null;
  column_position: number | null;
};

type WordRow = RowDataPacket & {
  id: string;
  formed_word: string;
  points_earned: number;
  board_version: number;
  cells: unknown;
  created_at: Date;
};

type PendingWordRow = RowDataPacket & {
  match_player_id: string;
  formed_word: string;
  direction: 'horizontal' | 'vertical';
  points_earned: number;
  board_version: number;
  cells: unknown;
  created_at: Date;
};

type LockedPlayerRow = RowDataPacket & {
  player_id: string;
  mode: string;
  theme: string | null;
  target_word_count: number | null;
  match_status: string;
  player_status: string;
  board_rows: number;
  board_columns: number;
  min_word_length: number;
  board_version: number;
  score: number;
  lives_remaining: number;
  joined_at: Date;
  game_time_ms: number;
};

type HistoryRow = RowDataPacket & {
  id: string;
  mode: string;
  theme: string | null;
  language: string;
  match_status: string;
  player_status: string;
  score: number;
  lives_remaining: number;
  game_time_ms: number;
  words_found: number;
  started_at: Date | null;
  finished_at: Date | null;
};

async function rollback(connection: PoolConnection): Promise<void> {
  try {
    await connection.rollback();
  } catch {
    // Preserve the original transaction error.
  }
}

function parseBoardCells(value: unknown): BoardCell[] {
  return (typeof value === 'string' ? JSON.parse(value) : value) as BoardCell[];
}

export class MysqlMatchRepository implements MatchRepository {
  constructor(private readonly database: Pool) {}

  async createSoloMatch(input: NewMatch): Promise<void> {
    const connection = await this.database.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute(
        'SELECT id FROM users WHERE id = ? FOR UPDATE',
        [input.userId],
      );
      const [activeRows] = await connection.execute<
        (RowDataPacket & { id: string })[]
      >(
        `SELECT mp.id
         FROM match_players mp
         INNER JOIN matches m ON m.id = mp.match_id
         WHERE mp.user_id = ?
           AND mp.status IN ('waiting', 'playing', 'paused')
           AND m.status IN ('waiting', 'in_progress')
         LIMIT 1`,
        [input.userId],
      );
      if (activeRows.length > 0) {
        throw new ApiError(409, 'ACTIVE_MATCH_EXISTS', 'User already has an active match');
      }
      const initialLives = input.mode === 'hardcore' ? 1 : 3;
      await connection.execute(
        `INSERT INTO matches
          (id, language, mode, theme, target_word_count, status, board_rows, board_columns,
           min_word_length, max_players, rules_version, started_at)
         VALUES (?, ?, ?, ?, ?, 'in_progress', 10, 9, 3, 1, '1', CURRENT_TIMESTAMP(3))`,
        [input.matchId, input.language, input.mode, input.theme ?? null, input.wordTarget ?? null],
      );
      await connection.execute(
        `INSERT INTO match_players
          (id, match_id, user_id, status, score, level_reached, lives_remaining,
           board_version, game_time_ms, joined_at)
         VALUES (?, ?, ?, 'playing', 0, 1, ?, 0, 0, CURRENT_TIMESTAMP(3))`,
        [input.playerId, input.matchId, input.userId, initialLives],
      );

      for (const piece of input.pieces) {
        await connection.execute(
          `INSERT INTO match_letters
            (id, match_player_id, sequence_number, letter, status,
             generated_at, activated_at)
           VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
          [piece.id, input.playerId, piece.sequenceNumber, piece.letter],
        );
      }

      await connection.commit();
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async findSnapshot(
    matchId: string,
    userId: string,
  ): Promise<MatchSnapshotRecord | undefined> {
    const [matchRows] = await this.database.execute<MatchRow[]>(
      `SELECT m.id, m.language, m.mode, m.theme, m.target_word_count, m.status, m.board_rows,
              m.board_columns, m.min_word_length, m.started_at,
              mp.id AS player_id, mp.status AS player_status, mp.score,
              mp.level_reached, mp.lives_remaining, mp.board_version,
              CASE
                WHEN mp.status = 'playing' THEN GREATEST(0,
                  FLOOR(TIMESTAMPDIFF(MICROSECOND, mp.joined_at, CURRENT_TIMESTAMP(3)) / 1000)
                  - mp.total_paused_ms)
                ELSE mp.game_time_ms
              END AS game_time_ms,
              mp.paused_at
       FROM matches m
       INNER JOIN match_players mp ON mp.match_id = m.id
       WHERE m.id = ? AND mp.user_id = ?
       LIMIT 1`,
      [matchId, userId],
    );
    const match = matchRows[0];
    if (!match) return undefined;

    const [pieceRows, wordRows, pendingWordRows] = await Promise.all([
      this.database.execute<PieceRow[]>(
        `SELECT id, letter, sequence_number, status, row_position, column_position
         FROM match_letters
         WHERE match_player_id = ?
           AND status IN ('active', 'queued', 'placed')
         ORDER BY sequence_number`,
        [match.player_id],
      ),
      this.database.execute<WordRow[]>(
        `SELECT id, formed_word, points_earned, board_version, cells, created_at
         FROM game_words
         WHERE match_player_id = ?
         ORDER BY created_at DESC`,
        [match.player_id],
      ),
      this.database.execute<PendingWordRow[]>(
        `SELECT match_player_id, formed_word, direction, points_earned,
                board_version, cells, created_at
         FROM match_pending_words
         WHERE match_player_id = ?
         LIMIT 1`,
        [match.player_id],
      ),
    ]);

    const pendingWord = pendingWordRows[0][0];

    return {
      id: match.id,
      language: match.language,
      mode: match.mode,
      theme: match.theme,
      wordTarget: match.target_word_count,
      status: match.status,
      boardRows: match.board_rows,
      boardColumns: match.board_columns,
      minWordLength: match.min_word_length,
      startedAt: match.started_at,
      player: {
        id: match.player_id,
        status: match.player_status,
        score: match.score,
        levelReached: match.level_reached,
        livesRemaining: match.lives_remaining,
        boardVersion: match.board_version,
        gameTimeMs: match.game_time_ms,
        pausedAt: match.paused_at,
      },
      pieces: pieceRows[0].map((piece) => ({
        id: piece.id,
        letter: piece.letter,
        sequenceNumber: piece.sequence_number,
        status: piece.status,
        row: piece.row_position,
        column: piece.column_position,
      })),
      words: wordRows[0].map((word) => ({
        id: word.id,
        formedWord: word.formed_word,
        pointsEarned: word.points_earned,
        boardVersion: word.board_version,
        cells: typeof word.cells === 'string' ? JSON.parse(word.cells) : word.cells,
        createdAt: word.created_at,
      })),
      pendingWord: pendingWord
        ? {
            formedWord: pendingWord.formed_word,
            direction: pendingWord.direction,
            pointsEarned: pendingWord.points_earned,
            boardVersion: pendingWord.board_version,
            cells: parseBoardCells(pendingWord.cells),
            createdAt: pendingWord.created_at,
          }
        : null,
    };
  }

  async placePiece(input: PlacePieceRecord): Promise<PlacePieceResult> {
    const connection = await this.database.getConnection();

    try {
      await connection.beginTransaction();
      const [playerRows] = await connection.execute<LockedPlayerRow[]>(
        `SELECT mp.id AS player_id, m.mode, m.theme, m.target_word_count, m.status AS match_status,
                mp.status AS player_status, m.board_rows, m.board_columns,
                m.min_word_length, mp.board_version, mp.score, mp.lives_remaining,
                mp.joined_at, mp.game_time_ms
         FROM matches m
         INNER JOIN match_players mp ON mp.match_id = m.id
         WHERE m.id = ? AND mp.user_id = ?
         LIMIT 1 FOR UPDATE`,
        [input.matchId, input.userId],
      );
      const player = playerRows[0];
      if (!player) throw new ApiError(404, 'MATCH_NOT_FOUND', 'Match not found');
      if (player.match_status !== 'in_progress' || player.player_status !== 'playing') {
        throw new ApiError(
          409,
          player.player_status === 'paused' ? 'MATCH_PAUSED' : 'MATCH_NOT_ACTIVE',
          player.player_status === 'paused' ? 'Match is paused' : 'Match is not active',
        );
      }
      if (player.board_version !== input.boardVersion) {
        throw new ApiError(409, 'STALE_BOARD_VERSION', 'Board version is outdated', {
          currentBoardVersion: player.board_version,
        });
      }

      // A palavra destacada é uma oportunidade de pontuação, não uma pausa.
      // Ao colocar outra peça, ela é recalculada sobre a versão mais nova do
      // tabuleiro para permitir extensões como FEEL -> FEELING.
      await connection.execute(
        'DELETE FROM match_pending_words WHERE match_player_id = ?',
        [player.player_id],
      );

      const [pieceRows] = await connection.execute<PieceRow[]>(
        `SELECT id, letter, sequence_number, status, row_position, column_position
         FROM match_letters
         WHERE match_player_id = ? AND status IN ('active', 'placed')
         ORDER BY sequence_number FOR UPDATE`,
        [player.player_id],
      );
      const activePieces = pieceRows.filter((piece) => piece.status === 'active');
      const chosen = activePieces.find((piece) => piece.id === input.pieceId);
      if (!chosen) {
        throw new ApiError(409, 'PIECE_NOT_ACTIVE', 'Piece is not an active option');
      }

      const boardCells: BoardCell[] = pieceRows
        .filter(
          (piece): piece is PieceRow & { row_position: number; column_position: number } =>
            piece.status === 'placed' &&
            piece.row_position !== null &&
            piece.column_position !== null,
        )
        .map((piece) => ({
          pieceId: piece.id,
          letter: piece.letter,
          row: piece.row_position,
          column: piece.column_position,
        }));
      const landingRow = findLandingRow(
        boardCells,
        player.board_rows,
        player.board_columns,
        input.column,
      );
      if (landingRow === null) {
        throw new ApiError(409, 'COLUMN_FULL', 'Column is full');
      }

      const placedPiece: BoardCell = {
        pieceId: chosen.id,
        letter: chosen.letter,
        row: landingRow,
        column: input.column,
      };
      await connection.execute(
        `UPDATE match_letters
         SET status = 'placed', row_position = ?, column_position = ?, placed_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [landingRow, input.column, chosen.id],
      );
      await connection.execute(
        `UPDATE match_letters
         SET status = 'discarded'
         WHERE match_player_id = ? AND status = 'active' AND id <> ?`,
        [player.player_id, chosen.id],
      );

      const boardAfterPlacement = [...boardCells, placedPiece];
      const lifeLost = landingRow === 0;
      // Toda palavra do dicionário é válida e pontua. O tema serve apenas
      // para definir quais palavras avançam o objetivo do modo temático.
      const candidateWords = input.words ?? new Map();
      const found = lifeLost
        ? undefined
        : findFirstWord(
            boardAfterPlacement,
            placedPiece,
            candidateWords,
            player.min_word_length,
          );
      let removedCells: BoardCell[] = [];
      let movedCells: PlacePieceResult['movedCells'] = [];
      let currentScore = player.score;
      const livesRemaining = lifeLost
        ? Math.max(0, player.lives_remaining - 1)
        : player.lives_remaining;
      const nextBoardVersion = player.board_version + 1;

      if (found) {
        await connection.execute(
          `INSERT INTO match_pending_words
            (match_player_id, formed_word, direction, points_earned, board_version, cells)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            player.player_id,
            found.word,
            found.direction,
            found.definition.score,
            nextBoardVersion,
            JSON.stringify(found.cells),
          ],
        );
      }

      if (lifeLost) {
        removedCells = boardAfterPlacement;
        movedCells = [];
        await connection.execute(
          `UPDATE match_letters
           SET status = 'discarded', row_position = NULL, column_position = NULL
           WHERE match_player_id = ? AND status = 'placed'`,
          [player.player_id],
        );
      }

      const gameOver = livesRemaining === 0;

      if (!gameOver) {
        const nextPieces = input.createNextPieces(
          player.mode,
          player.theme,
          Math.floor(chosen.sequence_number / 4),
        );
        const [sequenceRows] = await connection.execute<
          (RowDataPacket & { max_sequence: number })[]
        >(
          `SELECT COALESCE(MAX(sequence_number), 0) AS max_sequence
           FROM match_letters WHERE match_player_id = ?`,
          [player.player_id],
        );
        const firstSequence = sequenceRows[0].max_sequence + 1;
        for (const [index, piece] of nextPieces.entries()) {
          await connection.execute(
            `INSERT INTO match_letters
              (id, match_player_id, sequence_number, letter, status,
               generated_at, activated_at)
             VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            [piece.id, player.player_id, firstSequence + index, piece.letter],
          );
        }
      }

      await connection.execute(
        `UPDATE match_players
         SET score = ?, lives_remaining = ?, board_version = ?, status = ?,
             game_time_ms = GREATEST(0,
               FLOOR(TIMESTAMPDIFF(MICROSECOND, joined_at, CURRENT_TIMESTAMP(3)) / 1000)
               - total_paused_ms),
             last_activity_at = CURRENT_TIMESTAMP(3),
             finished_at = CASE WHEN ? = 'game_over' THEN CURRENT_TIMESTAMP(3) ELSE finished_at END
         WHERE id = ?`,
        [
          currentScore,
          livesRemaining,
          nextBoardVersion,
          gameOver ? 'game_over' : 'playing',
          gameOver ? 'game_over' : 'playing',
          player.player_id,
        ],
      );
      if (gameOver) {
        await connection.execute(
          `UPDATE match_letters SET status = 'discarded'
           WHERE match_player_id = ? AND status = 'active'`,
          [player.player_id],
        );
        await connection.execute(
          `UPDATE matches SET status = 'finished', finished_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [input.matchId],
        );
      }

      await connection.commit();
      return {
        boardVersion: nextBoardVersion,
        placedPiece,
        foundWord: found
          ? {
              word: found.word,
              direction: found.direction,
              pointsEarned: found.definition.score,
              translations: found.definition.translations,
              description: found.definition.description,
              cells: found.cells,
            }
          : null,
        removedCells,
        movedCells,
        currentScore,
        lifeLost,
        livesRemaining,
        gameOver,
      };
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async confirmWord(input: ConfirmWordRecord): Promise<ConfirmWordResult> {
    const connection = await this.database.getConnection();

    try {
      await connection.beginTransaction();
      const [playerRows] = await connection.execute<LockedPlayerRow[]>(
        `SELECT mp.id AS player_id, m.mode, m.theme, m.target_word_count, m.status AS match_status,
                mp.status AS player_status, m.board_rows, m.board_columns,
                m.min_word_length, mp.board_version, mp.score, mp.lives_remaining,
                mp.joined_at, mp.game_time_ms
         FROM matches m
         INNER JOIN match_players mp ON mp.match_id = m.id
         WHERE m.id = ? AND mp.user_id = ?
         LIMIT 1 FOR UPDATE`,
        [input.matchId, input.userId],
      );
      const player = playerRows[0];
      if (!player) throw new ApiError(404, 'MATCH_NOT_FOUND', 'Match not found');
      if (player.match_status !== 'in_progress' || player.player_status !== 'playing') {
        throw new ApiError(
          409,
          player.player_status === 'paused' ? 'MATCH_PAUSED' : 'MATCH_NOT_ACTIVE',
          player.player_status === 'paused' ? 'Match is paused' : 'Match is not active',
        );
      }
      if (player.board_version !== input.boardVersion) {
        throw new ApiError(409, 'STALE_BOARD_VERSION', 'Board version is outdated', {
          currentBoardVersion: player.board_version,
        });
      }

      const [pendingRows] = await connection.execute<PendingWordRow[]>(
        `SELECT match_player_id, formed_word, direction, points_earned,
                board_version, cells, created_at
         FROM match_pending_words
         WHERE match_player_id = ?
         LIMIT 1 FOR UPDATE`,
        [player.player_id],
      );
      const pendingWord = pendingRows[0];
      if (!pendingWord) {
        throw new ApiError(409, 'NO_PENDING_WORD', 'There is no word awaiting confirmation');
      }
      if (pendingWord.board_version !== player.board_version) {
        throw new ApiError(409, 'STALE_PENDING_WORD', 'Pending word is outdated');
      }

      const [pieceRows] = await connection.execute<PieceRow[]>(
        `SELECT id, letter, sequence_number, status, row_position, column_position
         FROM match_letters
         WHERE match_player_id = ? AND status = 'placed'
         ORDER BY sequence_number FOR UPDATE`,
        [player.player_id],
      );
      const boardCells: BoardCell[] = pieceRows.map((piece) => ({
        pieceId: piece.id,
        letter: piece.letter,
        row: piece.row_position as number,
        column: piece.column_position as number,
      }));
      const wordCells = parseBoardCells(pendingWord.cells);
      const referenceCell = wordCells[0];
      const removedCells = referenceCell
        ? boardCells.filter((cell) =>
            pendingWord.direction === 'horizontal'
              ? cell.row === referenceCell.row
              : cell.column === referenceCell.column,
          )
        : [];
      const removedIds = new Set(removedCells.map((cell) => cell.pieceId));
      const gravity = applyGravity(
        boardCells.filter((cell) => !removedIds.has(cell.pieceId)),
        player.board_rows,
        player.board_columns,
      );
      const nextBoardVersion = player.board_version + 1;
      const currentScore = player.score + pendingWord.points_earned;

      for (const cell of removedCells) {
        await connection.execute(
          `UPDATE match_letters
           SET status = 'cleared', row_position = NULL, column_position = NULL,
               cleared_at = CURRENT_TIMESTAMP(3)
           WHERE id = ? AND match_player_id = ? AND status = 'placed'`,
          [cell.pieceId, player.player_id],
        );
      }
      for (const moved of [...gravity.movedCells].sort((a, b) => b.toRow - a.toRow)) {
        await connection.execute(
          `UPDATE match_letters SET row_position = ?
           WHERE id = ? AND match_player_id = ? AND status = 'placed'`,
          [moved.toRow, moved.pieceId, player.player_id],
        );
      }
      await connection.execute(
        `INSERT INTO game_words
          (id, match_player_id, formed_word, points_earned, board_version, cells)
         VALUES (UUID(), ?, ?, ?, ?, ?)`,
        [
          player.player_id,
          pendingWord.formed_word,
          pendingWord.points_earned,
          nextBoardVersion,
          JSON.stringify(removedCells),
        ],
      );
      await connection.execute(
        'DELETE FROM match_pending_words WHERE match_player_id = ?',
        [player.player_id],
      );
      let completed = false;
      if (player.mode === 'learning' && player.theme && player.target_word_count) {
        const [formedRows] = await connection.execute<
          (RowDataPacket & { formed_word: string })[]
        >(
          'SELECT DISTINCT formed_word FROM game_words WHERE match_player_id = ?',
          [player.player_id],
        );
        const thematicWords = input.getWords(player.theme);
        const thematicCount = formedRows.filter((row) =>
          thematicWords.has(row.formed_word.toLowerCase()),
        ).length;
        completed = thematicCount >= player.target_word_count;
      }
      await connection.execute(
        `UPDATE match_players
         SET score = ?, board_version = ?, status = ?,
             game_time_ms = GREATEST(0,
               FLOOR(TIMESTAMPDIFF(MICROSECOND, joined_at, CURRENT_TIMESTAMP(3)) / 1000)
               - total_paused_ms),
             paused_at = NULL,
             last_activity_at = CURRENT_TIMESTAMP(3),
             finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP(3) ELSE finished_at END
         WHERE id = ?`,
        [
          currentScore,
          nextBoardVersion,
          completed ? 'completed' : 'playing',
          completed,
          player.player_id,
        ],
      );
      if (completed) {
        await connection.execute(
          `UPDATE matches SET status = 'finished', finished_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [input.matchId],
        );
        await connection.execute(
          `UPDATE match_letters SET status = 'discarded'
           WHERE match_player_id = ? AND status IN ('active', 'queued')`,
          [player.player_id],
        );
      }

      await connection.commit();
      return {
        boardVersion: nextBoardVersion,
        confirmedWord: {
          word: pendingWord.formed_word,
          direction: pendingWord.direction,
          pointsEarned: pendingWord.points_earned,
          cells: removedCells,
        },
        removedCells,
        movedCells: gravity.movedCells,
        currentScore,
        completed,
      };
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async leaveMatch(matchId: string, userId: string): Promise<void> {
    const connection = await this.database.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<
        (RowDataPacket & { player_id: string; player_status: string })[]
      >(
        `SELECT mp.id AS player_id, mp.status AS player_status
         FROM match_players mp
         WHERE mp.match_id = ? AND mp.user_id = ?
         LIMIT 1 FOR UPDATE`,
        [matchId, userId],
      );
      const player = rows[0];
      if (!player) throw new ApiError(404, 'MATCH_NOT_FOUND', 'Match not found');

      if (
        player.player_status === 'playing' ||
        player.player_status === 'waiting' ||
        player.player_status === 'paused'
      ) {
        await connection.execute(
          `UPDATE match_players
           SET status = 'left',
               game_time_ms = CASE
                 WHEN status = 'playing' THEN GREATEST(0,
                   FLOOR(TIMESTAMPDIFF(MICROSECOND, joined_at, CURRENT_TIMESTAMP(3)) / 1000)
                   - total_paused_ms)
                 ELSE game_time_ms
               END,
               paused_at = NULL,
               last_activity_at = CURRENT_TIMESTAMP(3),
               finished_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [player.player_id],
        );
        await connection.execute(
          `UPDATE match_letters SET status = 'discarded'
           WHERE match_player_id = ? AND status IN ('active', 'queued')`,
          [player.player_id],
        );
        await connection.execute(
          'DELETE FROM match_pending_words WHERE match_player_id = ?',
          [player.player_id],
        );
      }

      const [activeRows] = await connection.execute<
        (RowDataPacket & { active_players: number })[]
      >(
        `SELECT COUNT(*) AS active_players
         FROM match_players
         WHERE match_id = ? AND status IN ('waiting', 'playing', 'paused')`,
        [matchId],
      );
      if (activeRows[0].active_players === 0) {
        await connection.execute(
          `UPDATE matches
           SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP(3)
           WHERE id = ? AND status IN ('waiting', 'in_progress')`,
          [matchId],
        );
      }

      await connection.commit();
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async setPaused(matchId: string, userId: string, paused: boolean): Promise<void> {
    const connection = await this.database.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<
        (RowDataPacket & { player_id: string; player_status: string; match_status: string })[]
      >(
        `SELECT mp.id AS player_id, mp.status AS player_status, m.status AS match_status
         FROM match_players mp
         INNER JOIN matches m ON m.id = mp.match_id
         WHERE mp.match_id = ? AND mp.user_id = ?
         LIMIT 1 FOR UPDATE`,
        [matchId, userId],
      );
      const player = rows[0];
      if (!player) throw new ApiError(404, 'MATCH_NOT_FOUND', 'Match not found');
      if (player.match_status !== 'in_progress') {
        throw new ApiError(409, 'MATCH_NOT_ACTIVE', 'Match is not active');
      }

      if (paused) {
        if (player.player_status !== 'playing') {
          throw new ApiError(
            409,
            player.player_status === 'paused' ? 'MATCH_ALREADY_PAUSED' : 'MATCH_NOT_ACTIVE',
            player.player_status === 'paused' ? 'Match is already paused' : 'Match is not active',
          );
        }
        await connection.execute(
          `UPDATE match_players
           SET status = 'paused', paused_at = CURRENT_TIMESTAMP(3),
               game_time_ms = GREATEST(0,
                 FLOOR(TIMESTAMPDIFF(MICROSECOND, joined_at, CURRENT_TIMESTAMP(3)) / 1000)
                 - total_paused_ms),
               last_activity_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [player.player_id],
        );
      } else {
        if (player.player_status !== 'paused') {
          throw new ApiError(409, 'MATCH_NOT_PAUSED', 'Match is not paused');
        }
        await connection.execute(
          `UPDATE match_players
           SET status = 'playing',
               total_paused_ms = total_paused_ms + FLOOR(
                 TIMESTAMPDIFF(MICROSECOND, paused_at, CURRENT_TIMESTAMP(3)) / 1000
               ),
               paused_at = NULL,
               last_activity_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [player.player_id],
        );
      }

      await connection.commit();
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async listByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<MatchHistoryPage> {
    const [rows, countRows] = await Promise.all([
      this.database.execute<HistoryRow[]>(
        `SELECT m.id, m.mode, m.theme, m.language, m.status AS match_status,
                mp.status AS player_status, mp.score, mp.lives_remaining,
                CASE
                  WHEN mp.status = 'playing' THEN GREATEST(0,
                    FLOOR(TIMESTAMPDIFF(MICROSECOND, mp.joined_at, CURRENT_TIMESTAMP(3)) / 1000)
                    - mp.total_paused_ms)
                  ELSE mp.game_time_ms
                END AS game_time_ms,
                COUNT(DISTINCT gw.formed_word) AS words_found, m.started_at, m.finished_at
         FROM match_players mp
         INNER JOIN matches m ON m.id = mp.match_id
         LEFT JOIN game_words gw ON gw.match_player_id = mp.id
         WHERE mp.user_id = ?
         GROUP BY m.id, m.mode, m.theme, m.language, m.status, mp.status, mp.score,
                  mp.lives_remaining, mp.game_time_ms, mp.joined_at,
                  mp.total_paused_ms, m.started_at, m.finished_at
         ORDER BY m.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset],
      ),
      this.database.execute<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) AS total FROM match_players WHERE user_id = ?',
        [userId],
      ),
    ]);

    return {
      items: rows[0].map((row) => ({
        id: row.id,
        mode: row.mode,
        theme: row.theme,
        language: row.language,
        matchStatus: row.match_status,
        playerStatus: row.player_status,
        score: row.score,
        livesRemaining: row.lives_remaining,
        gameTimeMs: row.game_time_ms,
        wordsFound: Number(row.words_found),
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
      total: countRows[0][0].total,
      limit,
      offset,
    };
  }

  async getRanking(userId: string, query: RankingQuery): Promise<RankingResult> {
    const learning = query.mode === 'learning';
    const order = learning
      ? 'game_time_ms ASC, score DESC, finished_at ASC, match_id ASC'
      : 'score DESC, game_time_ms ASC, finished_at ASC, match_id ASC';
    const conditions = learning
      ? `m.mode = ? AND m.theme = ? AND m.target_word_count = ?
         AND m.status = 'finished' AND mp.status = 'completed'`
      : `m.mode = ? AND m.status = 'finished' AND mp.status = 'game_over'`;
    const params: Array<string | number> = learning
      ? [query.mode, query.theme as string, query.wordTarget as number]
      : [query.mode];
    type RankingRow = RowDataPacket & {
      position: number;
      user_id: string;
      username: string;
      score: number;
      game_time_ms: number;
    };
    const [rows] = await this.database.execute<RankingRow[]>(
      `WITH attempts AS (
         SELECT mp.user_id, u.username, mp.score, mp.game_time_ms,
                mp.finished_at, m.id AS match_id,
                ROW_NUMBER() OVER (PARTITION BY mp.user_id ORDER BY ${order}) AS attempt_number
         FROM match_players mp
         INNER JOIN matches m ON m.id = mp.match_id
         INNER JOIN users u ON u.id = mp.user_id
         WHERE ${conditions}
       ), best AS (
         SELECT * FROM attempts WHERE attempt_number = 1
       ), ranked AS (
         SELECT ROW_NUMBER() OVER (ORDER BY ${order}) AS position,
                user_id, username, score, game_time_ms
         FROM best
       )
       SELECT position, user_id, username, score, game_time_ms
       FROM ranked
       WHERE position <= 100 OR user_id = ?
       ORDER BY position`,
      [...params, userId],
    );
    const mapped = rows.map((row) => ({
      position: Number(row.position),
      userId: row.user_id,
      username: row.username,
      score: row.score,
      gameTimeMs: row.game_time_ms,
    }));
    return {
      entries: mapped.filter((entry) => entry.position <= 100),
      currentUser: mapped.find((entry) => entry.userId === userId) ?? null,
    };
  }

  async expireInactive(timeoutSeconds: number): Promise<number> {
    const connection = await this.database.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<
        (RowDataPacket & { player_id: string; match_id: string })[]
      >(
        `SELECT id AS player_id, match_id
         FROM match_players
         WHERE status IN ('waiting', 'playing', 'paused')
           AND TIMESTAMPDIFF(SECOND, last_activity_at, CURRENT_TIMESTAMP(3)) >= ?
         FOR UPDATE`,
        [timeoutSeconds],
      );
      if (rows.length === 0) {
        await connection.commit();
        return 0;
      }

      for (const row of rows) {
        await connection.execute(
          `UPDATE match_players
           SET status = 'left', paused_at = NULL,
               game_time_ms = CASE
                 WHEN status = 'playing' THEN GREATEST(0,
                   FLOOR(TIMESTAMPDIFF(MICROSECOND, joined_at, last_activity_at) / 1000)
                   - total_paused_ms)
                 ELSE game_time_ms
               END,
               finished_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [row.player_id],
        );
        await connection.execute(
          `UPDATE match_letters SET status = 'discarded'
           WHERE match_player_id = ? AND status IN ('active', 'queued')`,
          [row.player_id],
        );
        await connection.execute(
          'DELETE FROM match_pending_words WHERE match_player_id = ?',
          [row.player_id],
        );
        await connection.execute(
          `UPDATE matches
           SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?
             AND status IN ('waiting', 'in_progress')
             AND NOT EXISTS (
               SELECT 1 FROM match_players active
               WHERE active.match_id = matches.id
                 AND active.status IN ('waiting', 'playing', 'paused')
             )`,
          [row.match_id],
        );
      }

      await connection.commit();
      return rows.length;
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  }
}
