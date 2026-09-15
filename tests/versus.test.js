const assert = require('node:assert/strict');
const test = require('node:test');
const { createServer } = require('node:http');
const { WebSocket, WebSocketServer } = require('ws');
const { AuthModule } = require('../dist/modules/authModule');
const { VersusManager } = require('../dist/modules/versus/versusManager');

class InMemoryUserRepository {
  constructor() {
    this.users = [];
  }

  async findById(id) {
    return this.users.find((user) => user.id === id);
  }

  async findByEmail(email) {
    return this.users.find((user) => user.email === email);
  }

  async findByUsername(username) {
    return this.users.find((user) => user.username === username);
  }

  async create(input) {
    const user = { ...input, createdAt: new Date(), updatedAt: new Date() };
    this.users.push(user);
    return user;
  }
}

function createTestSetup() {
  const users = new InMemoryUserRepository();
  const authModule = new AuthModule(users, {
    jwtSecret: 'test-secret-with-at-least-32-characters',
    jwtExpiresInSeconds: 3600,
  });
  const content = {
    letters: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((value) => ({ value, weight: 1 })),
    words: new Map(),
  };

  const versusManager = new VersusManager(null, authModule, content);
  const server = createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token') || undefined;
    versusManager.handleConnection(ws, token);
  });

  return { users, authModule, versusManager, server, wss };
}

function createClient(port, token) {
  const url = token ? `ws://127.0.0.1:${port}/ws?token=${token}` : `ws://127.0.0.1:${port}/ws`;
  const ws = new WebSocket(url);

  const messages = [];
  const waiters = [];

  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString());
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter(parsed);
    } else {
      messages.push(parsed);
    }
  });

  function nextMessage() {
    if (messages.length > 0) {
      return Promise.resolve(messages.shift());
    }
    return new Promise((resolve) => waiters.push(resolve));
  }

  function send(obj) {
    ws.send(JSON.stringify(obj));
  }

  return { ws, nextMessage, send };
}

test('versus websocket: connects, authenticates and creates a private room', async () => {
  const setup = createTestSetup();
  const server = setup.server.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const reg = await setup.authModule.registerUser({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
    });

    const client = createClient(port, reg.token);
    await new Promise((resolve) => client.ws.once('open', resolve));

    const authMsg = await client.nextMessage();
    assert.equal(authMsg.type, 'authenticated');
    assert.equal(authMsg.username, 'alice');

    client.send({ type: 'create_room' });
    const roomMsg = await client.nextMessage();
    assert.equal(roomMsg.type, 'room_created');
    assert.ok(typeof roomMsg.code === 'string');
    assert.equal(roomMsg.code.length, 6);

    client.ws.close();
  } finally {
    setup.versusManager.close();
    setup.wss.close();
    server.close();
  }
});

test('versus websocket: two players match up, sync state, and finish when lives reach 0', async () => {
  const setup = createTestSetup();
  const server = setup.server.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const alice = await setup.authModule.registerUser({
      username: 'player_alice',
      email: 'alice2@example.com',
      password: 'password123',
    });

    const bob = await setup.authModule.registerUser({
      username: 'player_bob',
      email: 'bob2@example.com',
      password: 'password123',
    });

    const clientAlice = createClient(port, alice.token);
    await new Promise((resolve) => clientAlice.ws.once('open', resolve));
    await clientAlice.nextMessage(); // authenticated

    const clientBob = createClient(port, bob.token);
    await new Promise((resolve) => clientBob.ws.once('open', resolve));
    await clientBob.nextMessage(); // authenticated

    // Alice creates room
    clientAlice.send({ type: 'create_room' });
    const roomMsg = await clientAlice.nextMessage();
    const code = roomMsg.code;

    // Bob joins Alice's room
    clientBob.send({ type: 'join_room', code });

    // Both should receive match_start
    const aliceStart = await clientAlice.nextMessage();
    const bobStart = await clientBob.nextMessage();

    assert.equal(aliceStart.type, 'match_start');
    assert.equal(aliceStart.opponent.username, 'player_bob');
    assert.equal(aliceStart.initialBatch.length, 4);
    assert.deepEqual(aliceStart.initialBatch, bobStart.initialBatch);
    assert.equal(aliceStart.matchSeed, bobStart.matchSeed);

    assert.equal(bobStart.type, 'match_start');
    assert.equal(bobStart.opponent.username, 'player_alice');
    assert.equal(bobStart.initialBatch.length, 4);

    // Alice moves/syncs state -> Bob receives opponent_state
    clientAlice.send({
      type: 'state_sync',
      version: 1,
      board: [[null, 'A']],
      activeBlock: { row: 1, column: 2, letter: 'B' },
      score: 50,
      lives: 3,
    });

    const bobState = await clientBob.nextMessage();
    assert.equal(bobState.type, 'opponent_state');
    assert.equal(bobState.version, 1);
    assert.equal(bobState.board.length, 10);
    assert.ok(bobState.board.every((row) => row.length === 9));
    assert.equal(bobState.board[0][1], 'A');
    assert.equal(bobState.score, 50);
    assert.equal(bobState.activeBlock.letter, 'B');

    // Bob forms a word -> Alice receives opponent_word
    clientBob.send({
      type: 'word_confirmed',
      word: 'HELLO',
      points: 50,
    });

    const aliceWord = await clientAlice.nextMessage();
    assert.equal(aliceWord.type, 'opponent_word');
    assert.equal(aliceWord.word, 'HELLO');
    assert.equal(aliceWord.points, 50);

    // Alice runs out of lives -> game over
    clientAlice.send({
      type: 'game_over',
      finalScore: 50,
    });

    const aliceGameOver = await clientAlice.nextMessage();
    const bobGameOver = await clientBob.nextMessage();

    assert.equal(aliceGameOver.type, 'match_over');
    assert.equal(aliceGameOver.result, 'lose');
    assert.equal(aliceGameOver.winner, 'player_bob');

    assert.equal(bobGameOver.type, 'match_over');
    assert.equal(bobGameOver.result, 'win');
    assert.equal(bobGameOver.winner, 'player_bob');

    clientAlice.ws.close();
    clientBob.ws.close();
  } finally {
    setup.versusManager.close();
    setup.wss.close();
    server.close();
  }
});

test('versus websocket: quick match pairs two waiting players automatically', async () => {
  const setup = createTestSetup();
  const server = setup.server.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const user1 = await setup.authModule.registerUser({
      username: 'quick_one',
      email: 'quick1@example.com',
      password: 'password123',
    });

    const user2 = await setup.authModule.registerUser({
      username: 'quick_two',
      email: 'quick2@example.com',
      password: 'password123',
    });

    const client1 = createClient(port, user1.token);
    await new Promise((resolve) => client1.ws.once('open', resolve));
    await client1.nextMessage(); // authenticated

    client1.send({ type: 'quick_match' });
    const searchingMsg = await client1.nextMessage();
    assert.equal(searchingMsg.type, 'searching_quick_match');

    const client2 = createClient(port, user2.token);
    await new Promise((resolve) => client2.ws.once('open', resolve));
    await client2.nextMessage(); // authenticated

    client2.send({ type: 'quick_match' });

    const p1Start = await client1.nextMessage();
    const p2Start = await client2.nextMessage();

    assert.equal(p1Start.type, 'match_start');
    assert.equal(p1Start.opponent.username, 'quick_two');

    assert.equal(p2Start.type, 'match_start');
    assert.equal(p2Start.opponent.username, 'quick_one');

    // If client1 disconnects, client2 gets opponent_disconnected
    client1.ws.close();

    const p2Disconn = await client2.nextMessage();
    assert.equal(p2Disconn.type, 'opponent_disconnected');
    assert.equal(p2Disconn.result, 'win');

    client2.ws.close();
  } finally {
    setup.versusManager.close();
    setup.wss.close();
    server.close();
  }
});
