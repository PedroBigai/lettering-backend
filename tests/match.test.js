const assert = require('node:assert/strict');
const test = require('node:test');
const { AuthModule } = require('../dist/modules/authModule');
const { MatchModule } = require('../dist/modules/matchModule');
const { createApp } = require('../dist/server/app');

class InMemoryUserRepository {
  constructor() {
    this.users = [];
  }

  async findById(id) { return this.users.find((user) => user.id === id); }
  async findByEmail(email) { return this.users.find((user) => user.email === email); }
  async findByUsername(username) { return this.users.find((user) => user.username === username); }

  async create(input) {
    const now = new Date();
    const user = { ...input, createdAt: now, updatedAt: now };
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

  async placePiece(input) {
    const snapshot = await this.findSnapshot(input.matchId, input.userId);
    if (!snapshot) throw new Error('Match not found');
    if (snapshot.player.boardVersion !== input.boardVersion) {
      const error = new Error('Board version is outdated');
      error.status = 409;
      error.code = 'STALE_BOARD_VERSION';
      throw error;
    }
    const chosen = snapshot.pieces.find(
      (piece) => piece.id === input.pieceId && piece.status === 'active',
    );
    if (!chosen) throw new Error('Piece not active');
    snapshot.pieces.forEach((piece) => {
      if (piece.status === 'active') piece.status = piece.id === chosen.id ? 'placed' : 'discarded';
    });
    chosen.row = 9;
    chosen.column = input.column;
    const nextPieces = input.createNextPieces(snapshot.mode, snapshot.theme, 1, []);
    snapshot.pieces.push(...nextPieces.map((piece, index) => ({
      ...piece,
      sequenceNumber: snapshot.pieces.length + index + 1,
      status: 'active',
      row: null,
      column: null,
    })));
    snapshot.player.boardVersion += 1;
    const gameOver = Boolean(snapshot.forceGameOver);
    if (gameOver) {
      snapshot.status = 'finished';
      snapshot.player.status = 'game_over';
      snapshot.finishedAt = new Date();
      this.reconcileTopScore(snapshot);
    }
    return {
      boardVersion: snapshot.player.boardVersion,
      placedPiece: {
        pieceId: chosen.id,
        letter: chosen.letter,
        row: chosen.row,
        column: chosen.column,
      },
      foundWord: null,
      removedCells: [],
      movedCells: [],
      currentScore: snapshot.player.score,
      lifeLost: false,
      livesRemaining: gameOver ? 0 : snapshot.player.livesRemaining,
      gameOver,
    };
  }

  reconcileTopScore(snapshot) {
    const list = [...this.snapshots.values()].filter(
      (item) => item.userId === snapshot.userId && item.mode === snapshot.mode && item.status === 'finished',
    );
    if (list.length <= 1) return;
    list.sort((a, b) => b.player.score - a.player.score);
    for (const inferior of list.slice(1)) {
      this.snapshots.delete(inferior.id);
    }
  }

  async confirmWord(input) {
    const snapshot = await this.findSnapshot(input.matchId, input.userId);
    if (!snapshot) throw new Error('Match not found');
    snapshot.player.boardVersion += 1;
    snapshot.player.score += 30;
    return {
      boardVersion: snapshot.player.boardVersion,
      confirmedWord: {
        word: 'cat',
        direction: 'horizontal',
        pointsEarned: 30,
        cells: [],
      },
      removedCells: [],
      movedCells: [],
      currentScore: snapshot.player.score,
    };
  }

  async leaveMatch(matchId, userId) {
    const snapshot = await this.findSnapshot(matchId, userId);
    if (!snapshot) throw new Error('Match not found');
    snapshot.player.status = 'left';
    snapshot.status = 'cancelled';
    this.snapshots.delete(matchId);
  }

  async setPaused(matchId, userId, paused) {
    const snapshot = await this.findSnapshot(matchId, userId);
    if (!snapshot) throw new Error('Match not found');
    snapshot.player.status = paused ? 'paused' : 'playing';
    snapshot.player.pausedAt = paused ? new Date() : null;
  }

  async listByUser(userId, limit, offset) {
    const items = [...this.snapshots.values()]
      .filter((snapshot) => snapshot.userId === userId)
      .map((snapshot) => ({
        id: snapshot.id,
        mode: snapshot.mode,
        language: snapshot.language,
        matchStatus: snapshot.status,
        playerStatus: snapshot.player.status,
        score: snapshot.player.score,
        livesRemaining: snapshot.player.livesRemaining,
        gameTimeMs: snapshot.player.gameTimeMs,
        wordsFound: snapshot.words.length,
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt ?? null,
      }));
    return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
  }

  async expireInactive() { return 0; }
}

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function jsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  return { response, body: await response.json() };
}

async function register(baseUrl, username, email) {
  const result = await jsonRequest(baseUrl, '/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password: 'secure-password' }),
  });
  return result.body.token;
}

function createTestApplication() {
  const users = new InMemoryUserRepository();
  const matches = new InMemoryMatchRepository();
  const authModule = new AuthModule(users, {
    jwtSecret: 'test-secret-with-at-least-32-characters',
    jwtExpiresInSeconds: 3600,
  });
  const content = {
    letters: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((value) => ({ value, weight: 1 })),
    words: new Map(),
  };
  const matchModule = new MatchModule(matches, content);
  const app = createApp({ authModule, matchModule });
  app.matchesRepo = matches;
  return app;
}

test('creates an authenticated 10x9 classic match with four letter choices', async () => {
  const app = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const token = await register(baseUrl, 'player_one', 'one@example.com');
    const created = await jsonRequest(baseUrl, '/api/v1/matches', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: 'classic', language: 'en-US' }),
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.body.match.status, 'in_progress');
    assert.equal(created.body.match.board.rows, 10);
    assert.equal(created.body.match.board.columns, 9);
    assert.equal(created.body.match.board.version, 0);
    assert.deepEqual(created.body.match.board.cells, []);
    assert.equal(created.body.match.pendingWord, null);
    assert.equal(created.body.match.letterOptions.length, 4);
    assert.equal(new Set(created.body.match.letterOptions.map((piece) => piece.letter)).size, 4);
    assert.ok(created.body.match.letterOptions.some((piece) => 'AEIOU'.includes(piece.letter)));

    const state = await jsonRequest(
      baseUrl,
      `/api/v1/matches/${created.body.match.id}/state`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(state.response.status, 200);
    assert.deepEqual(state.body.match.letterOptions, created.body.match.letterOptions);

    const chosen = created.body.match.letterOptions[0];
    const placed = await jsonRequest(
      baseUrl,
      `/api/v1/matches/${created.body.match.id}/pieces/place`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pieceId: chosen.pieceId,
          column: 3,
          boardVersion: 0,
        }),
      },
    );
    assert.equal(placed.response.status, 200);
    assert.equal(placed.body.accepted, true);
    assert.equal(placed.body.placedPiece.row, 9);
    assert.equal(placed.body.boardVersion, 1);
    assert.equal(placed.body.letterOptions.length, 4);
    assert.equal(placed.body.board.cells.length, 1);
    assert.equal(placed.body.lifeLost, false);
    assert.equal(placed.body.livesRemaining, 3);

    const confirmed = await jsonRequest(
      baseUrl,
      `/api/v1/matches/${created.body.match.id}/words/confirm`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ boardVersion: 1 }),
      },
    );
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.body.accepted, true);
    assert.equal(confirmed.body.boardVersion, 2);
    assert.equal(confirmed.body.confirmedWord.word, 'cat');
    assert.equal(confirmed.body.currentScore, 30);

    const paused = await jsonRequest(
      baseUrl,
      `/api/v1/matches/${created.body.match.id}/pause`,
      { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' },
    );
    assert.equal(paused.response.status, 200);
    assert.equal(paused.body.match.player.status, 'paused');

    const resumed = await jsonRequest(
      baseUrl,
      `/api/v1/matches/${created.body.match.id}/resume`,
      { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' },
    );
    assert.equal(resumed.response.status, 200);
    assert.equal(resumed.body.match.player.status, 'playing');

    const history = await jsonRequest(baseUrl, '/api/v1/matches?limit=10&offset=0', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(history.response.status, 200);
    assert.equal(history.body.total, 1);
    assert.equal(history.body.items[0].id, created.body.match.id);

    const detail = await jsonRequest(
      baseUrl,
      `/api/v1/matches/${created.body.match.id}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(detail.response.status, 200);
    assert.equal(detail.body.match.id, created.body.match.id);

    const left = await jsonRequest(
      baseUrl,
      `/api/v1/matches/${created.body.match.id}/leave`,
      { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' },
    );
    assert.equal(left.response.status, 200);
    assert.equal(left.body.left, true);
  });
});

test('protects match creation and does not expose another user match', async () => {
  const app = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const unauthorized = await jsonRequest(baseUrl, '/api/v1/matches', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(unauthorized.response.status, 401);

    const firstToken = await register(baseUrl, 'first_user', 'first@example.com');
    const secondToken = await register(baseUrl, 'second_user', 'second@example.com');
    const created = await jsonRequest(baseUrl, '/api/v1/matches', {
      method: 'POST',
      headers: { authorization: `Bearer ${firstToken}` },
      body: '{}',
    });
    const hidden = await jsonRequest(
      baseUrl,
      `/api/v1/matches/${created.body.match.id}/state`,
      { headers: { authorization: `Bearer ${secondToken}` } },
    );

    assert.equal(hidden.response.status, 404);
    assert.equal(hidden.body.error.code, 'MATCH_NOT_FOUND');
  });
});

test('retains only the top score match per user and mode upon game completion', async () => {
  const app = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const token = await register(baseUrl, 'scorer', 'scorer@example.com');

    // Partida 1: Conclui com 100 pontos (primeiro recorde)
    const match1 = await jsonRequest(baseUrl, '/api/v1/matches', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: 'classic', language: 'en-US' }),
    });
    const snap1 = app.matchesRepo.snapshots.get(match1.body.match.id);
    snap1.player.score = 100;
    snap1.forceGameOver = true;

    const piece1 = match1.body.match.letterOptions[0];
    await jsonRequest(baseUrl, `/api/v1/matches/${match1.body.match.id}/pieces/place`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ pieceId: piece1.pieceId, column: 0, boardVersion: 0 }),
    });

    let history = await jsonRequest(baseUrl, '/api/v1/matches', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(history.body.total, 1);
    assert.equal(history.body.items[0].id, match1.body.match.id);
    assert.equal(history.body.items[0].score, 100);

    // Partida 2: Conclui com 50 pontos (inferior ao recorde de 100) -> descartada
    const match2 = await jsonRequest(baseUrl, '/api/v1/matches', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: 'classic', language: 'en-US' }),
    });
    const snap2 = app.matchesRepo.snapshots.get(match2.body.match.id);
    snap2.player.score = 50;
    snap2.forceGameOver = true;

    const piece2 = match2.body.match.letterOptions[0];
    await jsonRequest(baseUrl, `/api/v1/matches/${match2.body.match.id}/pieces/place`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ pieceId: piece2.pieceId, column: 0, boardVersion: 0 }),
    });

    history = await jsonRequest(baseUrl, '/api/v1/matches', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(history.body.total, 1);
    assert.equal(history.body.items[0].id, match1.body.match.id);
    assert.equal(history.body.items[0].score, 100);

    // Partida 3: Conclui com 250 pontos (novo recorde) -> substitui a partida anterior
    const match3 = await jsonRequest(baseUrl, '/api/v1/matches', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: 'classic', language: 'en-US' }),
    });
    const snap3 = app.matchesRepo.snapshots.get(match3.body.match.id);
    snap3.player.score = 250;
    snap3.forceGameOver = true;

    const piece3 = match3.body.match.letterOptions[0];
    await jsonRequest(baseUrl, `/api/v1/matches/${match3.body.match.id}/pieces/place`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ pieceId: piece3.pieceId, column: 0, boardVersion: 0 }),
    });

    history = await jsonRequest(baseUrl, '/api/v1/matches', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(history.body.total, 1);
    assert.equal(history.body.items[0].id, match3.body.match.id);
    assert.equal(history.body.items[0].score, 250);
  });
});

test('removes match from history when user leaves an in-progress game', async () => {
  const app = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const token = await register(baseUrl, 'quitter', 'quitter@example.com');
    const created = await jsonRequest(baseUrl, '/api/v1/matches', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: 'classic', language: 'en-US' }),
    });

    let history = await jsonRequest(baseUrl, '/api/v1/matches', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(history.body.total, 1);

    const left = await jsonRequest(baseUrl, `/api/v1/matches/${created.body.match.id}/leave`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: '{}',
    });
    assert.equal(left.response.status, 200);
    assert.equal(left.body.left, true);

    history = await jsonRequest(baseUrl, '/api/v1/matches', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(history.body.total, 0);
  });
});

