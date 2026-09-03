const assert = require('node:assert/strict');
const test = require('node:test');
const { AuthModule } = require('../dist/modules/authModule');
const { MatchModule } = require('../dist/modules/matchModule');
const { loadEnglishContent, getWordsForMatch } = require('../dist/modules/game/content');
const { VALID_THEMES } = require('../dist/modules/game/contentSchemas');
const { createApp } = require('../dist/server/app');

class InMemoryUserRepository {
  constructor() {
    this.users = [];
  }
  async findById(id) { return this.users.find((u) => u.id === id); }
  async findByEmail(email) { return this.users.find((u) => u.email === email); }
  async findByUsername(username) { return this.users.find((u) => u.username === username); }
  async create(input) {
    const user = { ...input, createdAt: new Date(), updatedAt: new Date() };
    this.users.push(user);
    return user;
  }
}

class InMemoryMatchRepository {
  constructor() {
    this.snapshots = new Map();
  }
  async createSoloMatch(input) {
    this.snapshots.set(input.matchId, {
      id: input.matchId,
      language: input.language,
      mode: input.mode,
      theme: input.theme ?? null,
      status: 'in_progress',
      boardRows: 10,
      boardColumns: 9,
      minWordLength: 3,
      startedAt: new Date(),
      userId: input.userId,
      player: {
        id: input.playerId,
        status: 'playing',
        score: 0,
        levelReached: 1,
        livesRemaining: input.mode === 'hardcore' ? 1 : 3,
        boardVersion: 0,
        gameTimeMs: 0,
        pausedAt: null,
      },
      pieces: input.pieces.map((piece) => ({
        id: piece.id,
        letter: piece.letter,
        sequenceNumber: piece.sequenceNumber,
        status: 'active',
        row: null,
        column: null,
      })),
      words: [],
      pendingWord: null,
    });
  }
  async findSnapshot(matchId, userId) {
    const snapshot = this.snapshots.get(matchId);
    return snapshot?.userId === userId ? snapshot : undefined;
  }
  async placePiece() { throw new Error('Not implemented'); }
  async confirmWord() { throw new Error('Not implemented'); }
  async leaveMatch() {}
  async setPaused() {}
  async listByUser() { return { items: [], total: 0, limit: 20, offset: 0 }; }
  async expireInactive() { return 0; }
}

async function createTestApp() {
  const content = await loadEnglishContent();
  const users = new InMemoryUserRepository();
  const matches = new InMemoryMatchRepository();
  const authModule = new AuthModule(users, {
    jwtSecret: 'test-secret-with-at-least-32-characters',
    jwtExpiresInSeconds: 3600,
  });
  const matchModule = new MatchModule(matches, content);
  const app = createApp({
    authModule,
    matchModule,
    corsOrigins: ['http://localhost:3000'],
  });
  return { app, authModule };
}

test('validates learning mode requires a valid theme', async () => {
  const { app, authModule } = await createTestApp();
  const user = await authModule.registerUser({
    username: 'learner',
    email: 'learner@example.com',
    password: 'Password123!',
  });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    // 1. Learning without theme -> 400
    const noThemeRes = await fetch(`http://localhost:${port}/api/v1/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ mode: 'learning' }),
    });
    assert.equal(noThemeRes.status, 400);

    // 2. Learning with invalid theme -> 400
    const invalidThemeRes = await fetch(`http://localhost:${port}/api/v1/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ mode: 'learning', theme: 'space' }),
    });
    assert.equal(invalidThemeRes.status, 400);

    // 3. Learning with valid theme -> 201
    const validRes = await fetch(`http://localhost:${port}/api/v1/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ mode: 'learning', theme: 'animals' }),
    });
    assert.equal(validRes.status, 201);
    const validData = await validRes.json();
    assert.equal(validData.match.mode, 'learning');
    assert.equal(validData.match.theme, 'animals');
    assert.equal(validData.match.player.livesRemaining, 3);
  } finally {
    server.close();
  }
});

test('creates hardcore match with 1 initial life and optional theme', async () => {
  const { app, authModule } = await createTestApp();
  const user = await authModule.registerUser({
    username: 'hardcore',
    email: 'hardcore@example.com',
    password: 'Password123!',
  });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/api/v1/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ mode: 'hardcore', theme: 'food' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.match.mode, 'hardcore');
    assert.equal(data.match.theme, 'food');
    assert.equal(data.match.player.livesRemaining, 1);
  } finally {
    server.close();
  }
});

test('getWordsForMatch filters correctly by theme', async () => {
  const content = await loadEnglishContent();

  assert.equal(VALID_THEMES.length, 9);

  const animalWords = getWordsForMatch(content, 'animals');
  assert.ok(animalWords.has('cat'));
  assert.ok(animalWords.has('dog'));
  assert.equal(animalWords.has('apple'), false); // apple is food

  const foodWords = getWordsForMatch(content, 'food');
  assert.ok(foodWords.has('apple'));
  assert.equal(foodWords.has('lion'), false); // lion is animal

  const allWords = getWordsForMatch(content, null);
  assert.ok(allWords.has('cat'));
  assert.ok(allWords.has('apple'));
});
