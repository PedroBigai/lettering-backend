const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');

// Opt-in: uses the configured MySQL database and removes only its temporary users.
test('flashcard API persists CRUD, sessions and reviews with ownership, limits and idempotency',
  { skip: process.env.LETTERING_DB_TESTS !== '1' }, async () => {
  require('dotenv').config({ quiet: true });
  const { database } = require('../dist/utils/database');
  const { env } = require('../dist/utils/env');
  const { createApp } = require('../dist/server/app');
  const { AuthModule } = require('../dist/modules/authModule');
  const { MysqlUserRepository } = require('../dist/modules/repositories/userRepository');
  const { FlashcardModule } = require('../dist/modules/flashcardModule');
  const { MysqlFlashcardRepository } = require('../dist/modules/repositories/flashcardRepository');
  const { MysqlMatchRepository } = require('../dist/modules/repositories/matchRepository');
  const { MatchModule } = require('../dist/modules/matchModule');
  const { loadEnglishContent } = require('../dist/modules/game/content');
  const repository = new MysqlFlashcardRepository(database);
  const app = createApp({ authModule: new AuthModule(new MysqlUserRepository(database),
    { jwtSecret: env.JWT_SECRET, jwtExpiresInSeconds: 3600 }), flashcardModule: new FlashcardModule(repository),
    matchModule: new MatchModule(new MysqlMatchRepository(database), await loadEnglishContent()) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const userIds = [];
  async function request(path, token, body, expected = 200) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  }
  const command = (token, body, expected) => request('/flashcards/actions', token, body, expected);
  try {
    const accounts = [];
    for (let i = 0; i < 2; i++) {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
      const account = await request('/auth/register', null, { username: `fc_test_${suffix}`,
        email: `fc_test_${suffix}@example.invalid`, password: 'temporary-test-password-2026' }, 201);
      accounts.push(account); userIds.push(account.user.id);
    }
    const [owner, other] = accounts;
    await request('/flashcards', null, null, 401);
    assert.deepEqual((await request('/flashcards', owner.token)).decks, []);
    const deckId = randomUUID();
    await command(owner.token, { action: 'createDeck', id: deckId, name: 'Animals' });
    await command(other.token, { action: 'renameDeck', id: deckId, name: 'Unauthorized' }, 404);
    await command(owner.token, { action: 'renameDeck', id: deckId, name: 'My animals' });
    const cardId = randomUUID();
    await command(owner.token, { action: 'createCard', id: cardId, deckId, word: 'DOG', translation: 'cachorro' });
    await command(owner.token, { action: 'createCard', id: randomUUID(), deckId, word: 'ｄｏｇ', translation: 'duplicate' }, 409);
    await command(owner.token, { action: 'createCard', id: randomUUID(), deckId, word: ' ', translation: 'empty' }, 400);
    const state = await request('/flashcards', owner.token);
    assert.equal(state.decks[0].name, 'My animals');
    assert.equal(state.decks[0].cards[0].id, cardId);
    assert.deepEqual((await request('/flashcards', other.token)).decks, []);
    const sessionId = randomUUID();
    const started = await command(owner.token, { action: 'startSession', id: sessionId, deckId: null, reviewType: 'due' });
    assert.deepEqual(started.session.remainingCardIds, [cardId]);
    await repository.expireInactiveSessions(1800);
    const [fresh] = await database.execute('SELECT status, started_at FROM flashcard_sessions WHERE id = ?', [sessionId]);
    assert.equal(fresh[0].status, 'in_progress');
    assert.ok(Math.abs(new Date(fresh[0].started_at).getTime() - Date.now()) < 10000);
    await command(other.token, { action: 'finishSession', id: sessionId }, 404);
    const review = { action: 'review', id: randomUUID(), sessionId, cardId, version: 0, rating: 'good' };
    await command(owner.token, { ...review, rating: 'invalid' }, 400);
    await command(owner.token, { ...review, version: 10 }, 409);
    const results = await Promise.all([command(owner.token, review), command(owner.token, review)]);
    assert.equal(results[0].decks[0].cards[0].reviews, 1);
    assert.equal(results[1].decks[0].cards[0].reviews, 1);
    assert.equal(results[0].session.status, 'completed');
    const reviewed = results[0].decks[0].cards[0];
    assert.equal(reviewed.intervalDays, 1);
    assert.equal(reviewed.dueAt - reviewed.lastReviewedAt, 86400000);
    const [reviewRows] = await database.execute('SELECT * FROM flashcard_reviews WHERE session_id = ?', [sessionId]);
    assert.equal(reviewRows.length, 1);
    assert.equal(reviewRows[0].word, 'DOG');
    await command(owner.token, { ...review, id: randomUUID(), version: 1 }, 409);
    await command(owner.token, { ...review, rating: 'easy' }, 409);
    const empty = await command(owner.token, { action: 'startSession', id: randomUUID(), deckId, reviewType: 'due' });
    assert.equal(empty.session.status, 'completed');
    const manual = await command(owner.token, { action: 'startSession', id: randomUUID(), deckId, reviewType: 'all' });
    assert.deepEqual(manual.session.remainingCardIds, [cardId]);
    await command(owner.token, { action: 'review', id: randomUUID(), sessionId: manual.session.id, cardId, version: 1, rating: 'again' });
    const [failed] = await database.execute('SELECT interval_days FROM flashcard_reviews WHERE session_id = ?', [manual.session.id]);
    assert.equal(Math.round(failed[0].interval_days * 86400000), 60000);
    await command(owner.token, { action: 'editCard', id: cardId, deckId, version: 0, word: 'DOG', translation: 'cão' }, 409);
    const edited = await command(owner.token, { action: 'editCard', id: cardId, deckId, version: 2, word: 'DOG', translation: 'cão' });
    assert.equal(edited.decks[0].cards[0].reviews, 0);
    assert.equal(edited.decks[0].cards[0].version, 3);
    assert.equal((await request('/flashcards', owner.token)).statistics.totalReviews, 2);
    // Two simultaneous inserts for the last slot must not exceed the deck limit.
    for (let i = 0; i < 18; i++) await command(owner.token,
      { action: 'createCard', id: randomUUID(), deckId, word: `word${i}`, translation: `translation${i}` });
    const attempts = await Promise.all([0, 1].map(async i => {
      const response = await fetch(base + '/flashcards/actions', { method: 'POST',
        headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createCard', id: randomUUID(), deckId, word: `last${i}`, translation: 'last' }) });
      return response.status;
    }));
    assert.deepEqual(attempts.sort(), [200, 409]);
    assert.equal((await request('/flashcards', owner.token)).decks[0].cards.length, 20);
    const interrupted = await command(owner.token, { action: 'startSession', id: randomUUID(), deckId, reviewType: 'all' });
    assert.equal((await command(owner.token, { action: 'finishSession', id: interrupted.session.id })).session.status, 'ended');
    const expired = await command(owner.token, { action: 'startSession', id: randomUUID(), deckId, reviewType: 'all' });
    await database.execute('UPDATE flashcard_sessions SET last_activity_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 HOUR) WHERE id = ?', [expired.session.id]);
    await repository.expireInactiveSessions(1800);
    const [expiredRows] = await database.execute('SELECT status FROM flashcard_sessions WHERE id = ?', [expired.session.id]);
    assert.equal(expiredRows[0].status, 'abandoned');
    await command(owner.token, { action: 'deleteCard', id: cardId, deckId });
    await command(owner.token, { action: 'createCard', id: randomUUID(), deckId, word: 'DOG', translation: 'new dog' });
    await command(owner.token, { action: 'deleteDeck', id: deckId });
    const final = await request('/flashcards', owner.token);
    assert.deepEqual(final.decks, []);
    assert.equal(final.statistics.totalReviews, 2);
    const [historical] = await database.execute('SELECT word, translation FROM flashcard_reviews WHERE session_id = ?', [sessionId]);
    assert.equal(historical[0].translation, 'cachorro');
    // Real game engine: deterministic letters, word confirmation and multiple results.
    let game = await request('/matches', owner.token, { mode: 'classic', language: 'en-US' }, 201);
    const gameId = game.match.id;
    for (const [column, letter] of [...'CAT'].entries()) {
      const piece = game.match.letterOptions[0];
      await database.execute('UPDATE match_letters SET letter = ? WHERE id = ?', [letter, piece.pieceId]);
      await request(`/matches/${gameId}/pieces/place`, owner.token,
        { pieceId: piece.pieceId, column, boardVersion: game.match.player.boardVersion });
      game = await request(`/matches/${gameId}/state`, owner.token);
    }
    assert.equal(game.match.pendingWord.word.toLowerCase(), 'cat');
    await request(`/matches/${gameId}/words/confirm`, owner.token, { boardVersion: game.match.player.boardVersion });
    const [words] = await database.execute('SELECT formed_word, game_time_ms FROM game_words WHERE match_player_id = ?', [game.match.player.id]);
    assert.equal(words.length, 1);
    assert.equal(words[0].formed_word.toLowerCase(), 'cat');
    assert.ok(words[0].game_time_ms >= 0);
    async function finishWithScore(snapshot, score) {
      const playerId = snapshot.match.player.id;
      await database.execute('UPDATE match_players SET lives_remaining = 1, score = ? WHERE id = ?', [score, playerId]);
      for (let row = 1; row < 10; row++) await database.execute(`INSERT INTO match_letters
        (id, match_player_id, sequence_number, letter, status, row_position, column_position)
        VALUES (?, ?, ?, 'Z', 'placed', ?, 0)`, [randomUUID(), playerId, 1000 + row, row]);
      const piece = snapshot.match.letterOptions[0];
      await database.execute('UPDATE match_letters SET letter = ? WHERE id = ?', ['Z', piece.pieceId]);
      const result = await request(`/matches/${snapshot.match.id}/pieces/place`, owner.token,
        { pieceId: piece.pieceId, column: 0, boardVersion: snapshot.match.player.boardVersion });
      assert.equal(result.gameOver, true);
    }
    game = await request(`/matches/${gameId}/state`, owner.token);
    await finishWithScore(game, 100);
    const lower = await request('/matches', owner.token, { mode: 'classic', language: 'en-US' }, 201);
    await finishWithScore(lower, 50);
    let games = await request('/matches', owner.token);
    assert.equal(games.total, 2);
    assert.deepEqual(games.items.map(item => item.score).sort((a, b) => a - b), [50, 100]);
    const ranking = await request('/rankings?mode=classic', owner.token);
    assert.equal(ranking.entries.filter(entry => entry.userId === owner.user.id).length, 1);
    assert.equal(ranking.currentUser.score, 100);
    const cancelled = await request('/matches', owner.token, { mode: 'classic', language: 'en-US' }, 201);
    await request(`/matches/${cancelled.match.id}/leave`, owner.token, {});
    games = await request('/matches', owner.token);
    assert.equal(games.total, 3);
    assert.equal(games.items.find(item => item.id === cancelled.match.id).matchStatus, 'cancelled');
    const inactive = await request('/matches', owner.token, { mode: 'classic', language: 'en-US' }, 201);
    await database.execute('UPDATE match_players SET last_activity_at = DATE_SUB(NOW(3), INTERVAL 2 HOUR) WHERE id = ?', [inactive.match.player.id]);
    await new MysqlMatchRepository(database).expireInactive(1800);
    games = await request('/matches', owner.token);
    assert.equal(games.total, 4);
    assert.equal(games.items.find(item => item.id === inactive.match.id).matchStatus, 'cancelled');
  } finally {
    for (const id of userIds) {
      await database.execute('DELETE FROM matches WHERE id IN (SELECT match_id FROM match_players WHERE user_id = ?)', [id]);
      await database.execute('DELETE FROM flashcard_sessions WHERE user_id = ?', [id]);
      await database.execute('DELETE FROM users WHERE id = ?', [id]);
    }
    await new Promise(resolve => server.close(resolve));
    await database.end();
  }
});
