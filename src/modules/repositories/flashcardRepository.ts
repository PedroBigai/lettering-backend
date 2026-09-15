import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Flashcard, FlashcardDeck, FlashcardSession } from '../../interfaces/flashcards';
import type { FlashcardAction } from '../../schemas/flashcardSchemas';
import { ApiError } from '../../server/errors';
import { scheduleFlashcard } from '../game/flashcardScheduler';

type Db = Pool | PoolConnection;
const jsonIds = (value: unknown): string[] => typeof value === 'string' ? JSON.parse(value) : value as string[];
const timestamp = (value: unknown): number => new Date(value as string).getTime();
function toCard(row: RowDataPacket): Flashcard {
  return { id: row.id, word: row.word, translation: row.translation, dueAt: timestamp(row.due_at),
    intervalDays: Number(row.interval_days), ease: Number(row.ease), reviews: row.reviews,
    lapses: row.lapses, lastReviewedAt: row.last_reviewed_at ? timestamp(row.last_reviewed_at) : null, version: row.version };
}
function toSession(row: RowDataPacket): FlashcardSession {
  return { id: row.id, deckId: row.deck_id, reviewType: row.review_type, status: row.status,
    cardIds: jsonIds(row.card_ids), remainingCardIds: jsonIds(row.remaining_card_ids) };
}
const notFound = () => new ApiError(404, 'FLASHCARD_NOT_FOUND', 'Flashcard resource not found');
const conflict = (message: string) => new ApiError(409, 'FLASHCARD_CONFLICT', message);

export class MysqlFlashcardRepository {
  constructor(private readonly database: Pool) {}

  async list(userId: string, db: Db = this.database): Promise<FlashcardDeck[]> {
    const [decks] = await db.execute<RowDataPacket[]>(
      'SELECT id, name FROM flashcard_decks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at, id', [userId]);
    const [cards] = await db.execute<RowDataPacket[]>(
      `SELECT c.* FROM flashcard_cards c JOIN flashcard_decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.created_at, c.id`, [userId]);
    return decks.map(deck => ({ id: deck.id, name: deck.name,
      cards: cards.filter(card => card.deck_id === deck.id).map(toCard) }));
  }

  async execute(userId: string, input: FlashcardAction) {
    const db = await this.database.getConnection();
    try {
      await db.beginTransaction();
      // Serialize this user's mutations, including deck limits and concurrent sessions.
      const [users] = await db.execute<RowDataPacket[]>('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      if (!users.length) throw notFound();
      const now = Date.now();
      let session: FlashcardSession | undefined;
      const ownedDeck = async (id: string) => {
        const [rows] = await db.execute<RowDataPacket[]>(
          'SELECT * FROM flashcard_decks WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [id, userId]);
        if (!rows.length) throw notFound();
        return rows[0];
      };
      const ownedCard = async (id: string, deckId: string) => {
        await ownedDeck(deckId);
        const [rows] = await db.execute<RowDataPacket[]>(
          'SELECT * FROM flashcard_cards WHERE id = ? AND deck_id = ? AND deleted_at IS NULL', [id, deckId]);
        if (!rows.length) throw notFound();
        return rows[0];
      };
      const ownedSession = async (id: string) => {
        const [rows] = await db.execute<RowDataPacket[]>(
          'SELECT * FROM flashcard_sessions WHERE id = ? AND user_id = ?', [id, userId]);
        if (!rows.length) throw notFound();
        return rows[0];
      };
      const abandonSessions = async () => {
        await db.execute(`UPDATE flashcard_sessions SET status = 'abandoned', finished_at = ?, last_activity_at = ?
          WHERE user_id = ? AND status = 'in_progress'`, [new Date(now), new Date(now), userId]);
      };
      switch (input.action) {
        case 'createDeck': {
          await db.execute('INSERT INTO flashcard_decks (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [input.id, userId, input.name, new Date(now), new Date(now)]);
          break;
        }
        case 'renameDeck':
          await ownedDeck(input.id);
          await db.execute('UPDATE flashcard_decks SET name = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [input.name, input.id]);
          break;
        case 'deleteDeck':
          await ownedDeck(input.id);
          await abandonSessions();
          await db.execute('UPDATE flashcard_decks SET deleted_at = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [new Date(now), input.id]);
          break;
        case 'createCard': {
          await ownedDeck(input.deckId);
          const [counts] = await db.execute<RowDataPacket[]>(
            'SELECT COUNT(*) AS total FROM flashcard_cards WHERE deck_id = ? AND deleted_at IS NULL', [input.deckId]);
          if (counts[0].total >= 20) throw conflict('Maximum of 20 cards per deck');
          await db.execute(`INSERT INTO flashcard_cards (id, deck_id, word, translation, normalized_word, due_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [input.id, input.deckId, input.word, input.translation,
            input.word.normalize('NFKC').toLowerCase(), new Date(now), new Date(now), new Date(now)]);
          break;
        }
        case 'editCard': {
          const previous = await ownedCard(input.id, input.deckId);
          if (previous.version !== input.version) throw conflict('Card changed; reload before editing');
          if (previous.word !== input.word || previous.translation !== input.translation) {
            await abandonSessions();
            await db.execute(`UPDATE flashcard_cards SET word = ?, translation = ?, normalized_word = ?,
              due_at = ?, interval_days = 0, ease = 2.5, reviews = 0, lapses = 0,
              last_reviewed_at = NULL, version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
            [input.word, input.translation, input.word.normalize('NFKC').toLowerCase(), new Date(now), input.id]);
          }
          break;
        }
        case 'deleteCard':
          await ownedCard(input.id, input.deckId);
          await abandonSessions();
          await db.execute('UPDATE flashcard_cards SET deleted_at = ?, version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [new Date(now), input.id]);
          break;
        case 'startSession': {
          const [existing] = await db.execute<RowDataPacket[]>('SELECT * FROM flashcard_sessions WHERE id = ?', [input.id]);
          if (existing.length) {
            if (existing[0].user_id !== userId) throw notFound();
            if (existing[0].deck_id !== input.deckId || existing[0].review_type !== input.reviewType) throw conflict('Session identifier already used');
            session = toSession(existing[0]); break;
          }
          if (input.deckId) await ownedDeck(input.deckId);
          const decks = await this.list(userId, db);
          const cards = decks.filter(deck => !input.deckId || deck.id === input.deckId).flatMap(deck => deck.cards)
            .filter(card => input.reviewType === 'all' || card.dueAt <= now)
            .sort((a, b) => Number(a.reviews === 0) - Number(b.reviews === 0) || a.dueAt - b.dueAt);
          const ids = cards.map(card => card.id);
          await abandonSessions();
          await db.execute(`INSERT INTO flashcard_sessions
            (id, user_id, deck_id, review_type, status, card_ids, remaining_card_ids, finished_at, started_at, last_activity_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [input.id, userId, input.deckId, input.reviewType,
            ids.length ? 'in_progress' : 'completed', JSON.stringify(ids), JSON.stringify(ids), ids.length ? null : new Date(now),
            new Date(now), new Date(now)]);
          session = toSession(await ownedSession(input.id));
          break;
        }
        case 'review': {
          const row = await ownedSession(input.sessionId);
          const [existing] = await db.execute<RowDataPacket[]>('SELECT * FROM flashcard_reviews WHERE id = ?', [input.id]);
          if (existing.length) {
            if (existing[0].session_id !== input.sessionId || existing[0].card_id !== input.cardId || existing[0].rating !== input.rating)
              throw conflict('Review identifier already used');
            session = toSession(row); break;
          }
          const remaining = jsonIds(row.remaining_card_ids);
          if (row.status !== 'in_progress' || remaining[0] !== input.cardId) throw conflict('Review is not in the active session queue');
          const [cards] = await db.execute<RowDataPacket[]>(`SELECT c.* FROM flashcard_cards c
            JOIN flashcard_decks d ON d.id = c.deck_id WHERE c.id = ? AND d.user_id = ?
            AND c.deleted_at IS NULL AND d.deleted_at IS NULL`, [input.cardId, userId]);
          if (!cards.length) throw notFound();
          const card = toCard(cards[0]);
          if (card.version !== input.version) throw conflict('Card changed; reload before reviewing');
          const next = scheduleFlashcard(card, input.rating, now);
          await db.execute(`INSERT INTO flashcard_reviews
            (id, session_id, card_id, word, translation, rating, previous_interval_days, interval_days,
             previous_ease, ease, due_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [input.id, input.sessionId, card.id, card.word, card.translation, input.rating, card.intervalDays,
            next.intervalDays, card.ease, next.ease, new Date(next.dueAt), new Date(now)]);
          await db.execute(`UPDATE flashcard_cards SET due_at = ?, interval_days = ?, ease = ?, reviews = ?,
            lapses = ?, last_reviewed_at = ?, version = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
          [new Date(next.dueAt), next.intervalDays, next.ease, next.reviews, next.lapses, new Date(now), next.version, card.id]);
          remaining.shift();
          await db.execute(`UPDATE flashcard_sessions SET remaining_card_ids = ?, status = ?,
            finished_at = ?, last_activity_at = ? WHERE id = ?`, [JSON.stringify(remaining),
            remaining.length ? 'in_progress' : 'completed', remaining.length ? null : new Date(now), new Date(now), row.id]);
          session = toSession(await ownedSession(row.id));
          break;
        }
        case 'finishSession': {
          const row = await ownedSession(input.id);
          if (row.status === 'in_progress') await db.execute(`UPDATE flashcard_sessions SET status = 'ended',
            finished_at = ?, last_activity_at = ? WHERE id = ?`, [new Date(now), new Date(now), row.id]);
          session = toSession(await ownedSession(row.id));
          break;
        }
      }
      const decks = await this.list(userId, db);
      await db.commit();
      return { decks, ...(session ? { session } : {}) };
    } catch (error) {
      await db.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw conflict('Duplicate word or identifier');
      throw error;
    } finally { db.release(); }
  }

  async statistics(userId: string) {
    const [rows] = await this.database.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total_reviews,
      SUM(r.rating = 'again') AS again_reviews FROM flashcard_reviews r
      JOIN flashcard_sessions s ON s.id = r.session_id WHERE s.user_id = ?`, [userId]);
    const [sessions] = await this.database.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total_sessions,
      SUM(status = 'completed') AS completed_sessions FROM flashcard_sessions WHERE user_id = ?`, [userId]);
    return { totalReviews: Number(rows[0].total_reviews), againReviews: Number(rows[0].again_reviews ?? 0),
      totalSessions: Number(sessions[0].total_sessions), completedSessions: Number(sessions[0].completed_sessions ?? 0) };
  }

  async expireInactiveSessions(timeoutSeconds: number): Promise<void> {
    await this.database.execute(`UPDATE flashcard_sessions SET status = 'abandoned',
      finished_at = last_activity_at WHERE status = 'in_progress'
      AND last_activity_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? SECOND)`, [timeoutSeconds]);
  }
}
