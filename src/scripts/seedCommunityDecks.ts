import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { env } from '../utils/env';

// Demo decks for the Flashcards "Comunidade" screen. Each deck belongs to a bot
// user (email @lettering.test). Running it again replaces the demo decks;
// `npm run seed:community -- --remove` deletes them.

type DemoDeck = {
  username: string;
  name: string;
  cards: Array<[word: string, translation: string]>;
};

const BOT_EMAIL_PATTERN = 'community-bot-%@lettering.test';

const DECKS: DemoDeck[] = [
  {
    username: 'TravelTalk',
    name: 'Viagem: aeroporto e hotel',
    cards: [
      ['boarding pass', 'cartão de embarque'],
      ['luggage', 'bagagem'],
      ['departure', 'partida'],
      ['arrival', 'chegada'],
      ['gate', 'portão de embarque'],
      ['delayed', 'atrasado'],
      ['customs', 'alfândega'],
      ['reservation', 'reserva'],
      ['check-in', 'check-in / registro de entrada'],
      ['room key', 'chave do quarto'],
      ['receipt', 'recibo'],
      ['round trip', 'ida e volta'],
    ],
  },
  {
    username: 'KitchenWords',
    name: 'Cozinha e restaurante',
    cards: [
      ['spoon', 'colher'],
      ['fork', 'garfo'],
      ['knife', 'faca'],
      ['plate', 'prato'],
      ['bowl', 'tigela'],
      ['to boil', 'ferver'],
      ['to fry', 'fritar'],
      ['to bake', 'assar'],
      ['menu', 'cardápio'],
      ['the bill', 'a conta'],
      ['tip', 'gorjeta'],
      ['dessert', 'sobremesa'],
    ],
  },
  {
    username: 'OfficeEnglish',
    name: 'Inglês no trabalho',
    cards: [
      ['meeting', 'reunião'],
      ['deadline', 'prazo'],
      ['schedule', 'agenda / cronograma'],
      ['coworker', 'colega de trabalho'],
      ['manager', 'gerente'],
      ['to hire', 'contratar'],
      ['to quit', 'pedir demissão'],
      ['salary', 'salário'],
      ['report', 'relatório'],
      ['task', 'tarefa'],
      ['to reach out', 'entrar em contato'],
      ['day off', 'dia de folga'],
    ],
  },
];

// Who likes which deck, by deck index, so the list is not all zeros.
const LIKES: Array<[likerIndex: number, deckIndex: number]> = [
  [1, 0], [2, 0], [0, 1], [2, 1], [0, 2],
];

async function seedCommunityDecks(remove: boolean): Promise<void> {
  const pool = mysql.createPool({ uri: env.DATABASE_URL, timezone: 'Z' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Decks, cards and likes are removed by ON DELETE CASCADE.
    const [removed] = await connection.execute<mysql.ResultSetHeader>(
      'DELETE FROM users WHERE email LIKE ?',
      [BOT_EMAIL_PATTERN],
    );

    if (remove) {
      await connection.commit();
      console.log(`Removed ${removed.affectedRows} community bot user(s) and their decks`);
      return;
    }

    const passwordHash = await bcrypt.hash(randomUUID(), 4);
    const now = Date.now();
    const userIds: string[] = [];
    const deckIds: string[] = [];

    for (const [index, deck] of DECKS.entries()) {
      const userId = randomUUID();
      const deckId = randomUUID();
      userIds.push(userId);
      deckIds.push(deckId);
      // Stagger publish dates so the order looks natural.
      const publishedAt = new Date(now - (index + 1) * 26 * 60 * 60 * 1_000);

      await connection.execute(
        'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
        [userId, deck.username, `community-bot-${index + 1}@lettering.test`, passwordHash],
      );
      await connection.execute(
        `INSERT INTO flashcard_decks (id, user_id, name, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [deckId, userId, deck.name, publishedAt, publishedAt, publishedAt],
      );
      for (const [word, translation] of deck.cards) {
        await connection.execute(
          `INSERT INTO flashcard_cards
            (id, deck_id, word, translation, normalized_word, due_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), deckId, word, translation, word.normalize('NFKC').toLowerCase(),
            publishedAt, publishedAt, publishedAt],
        );
      }
    }

    for (const [likerIndex, deckIndex] of LIKES) {
      await connection.execute(
        'INSERT INTO flashcard_deck_likes (deck_id, user_id) VALUES (?, ?)',
        [deckIds[deckIndex], userIds[likerIndex]],
      );
    }

    await connection.commit();
    console.log(`Published ${DECKS.length} community demo decks: ${DECKS.map((d) => d.name).join(', ')}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seedCommunityDecks(process.argv.includes('--remove')).catch((error: unknown) => {
  console.error('Community deck seed failed', error);
  process.exitCode = 1;
});
