const assert = require('node:assert/strict');
const test = require('node:test');
const { AuthModule } = require('../dist/modules/authModule');
const { createApp } = require('../dist/server/app');

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
    const now = new Date();
    const user = { ...input, createdAt: now, updatedAt: now };
    this.users.push(user);
    return user;
  }
}

function createTestApplication() {
  const users = new InMemoryUserRepository();
  const authModule = new AuthModule(users, {
    jwtSecret: 'test-secret-with-at-least-32-characters',
    jwtExpiresInSeconds: 3600,
  });

  return { app: createApp({ authModule }), users };
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

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });

  return { response, body: await response.json() };
}

test('registers a user, normalizes email and returns a JWT', async () => {
  const { app, users } = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const { response, body } = await request(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'pedro_1',
        email: '  PEDRO@EXAMPLE.COM ',
        password: 'secure-password',
      }),
    });

    assert.equal(response.status, 201);
    assert.equal(body.user.username, 'pedro_1');
    assert.equal(body.user.email, 'pedro@example.com');
    assert.equal(typeof body.token, 'string');
    assert.equal('passwordHash' in body.user, false);
    assert.notEqual(users.users[0].passwordHash, 'secure-password');
  });
});

test('rejects invalid registration data', async () => {
  const { app } = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const { response, body } = await request(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'x', email: 'invalid', password: '123' }),
    });

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});

test('rejects malformed JSON without returning an internal error', async () => {
  const { app } = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_JSON');
  });
});

test('logs in and reads the authenticated user', async () => {
  const { app } = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const registered = await request(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'maria',
        email: 'maria@example.com',
        password: 'secure-password',
      }),
    });

    const login = await request(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'maria@example.com',
        password: 'secure-password',
      }),
    });

    assert.equal(login.response.status, 200);

    const me = await request(baseUrl, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${registered.body.token}` },
    });

    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.email, 'maria@example.com');
  });
});

test('rejects duplicate users, invalid credentials and missing tokens', async () => {
  const { app } = createTestApplication();

  await withServer(app, async (baseUrl) => {
    const user = {
      username: 'lucas',
      email: 'lucas@example.com',
      password: 'secure-password',
    };

    await request(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(user),
    });

    const duplicate = await request(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(user),
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.error.code, 'EMAIL_ALREADY_IN_USE');

    const login = await request(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: user.email, password: 'wrong-password' }),
    });
    assert.equal(login.response.status, 401);
    assert.equal(login.body.error.code, 'INVALID_CREDENTIALS');

    const me = await request(baseUrl, '/api/v1/auth/me');
    assert.equal(me.response.status, 401);
    assert.equal(me.body.error.code, 'AUTHENTICATION_REQUIRED');
  });
});

test('rate limits repeated login attempts for the same address and email', async () => {
  const { app } = createTestApplication();

  await withServer(app, async (baseUrl) => {
    let lastResponse;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      lastResponse = await request(baseUrl, '/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'missing@example.com',
          password: 'wrong-password',
        }),
      });
    }

    assert.equal(lastResponse.response.status, 429);
    assert.equal(lastResponse.body.error.code, 'RATE_LIMIT_EXCEEDED');
  });
});
