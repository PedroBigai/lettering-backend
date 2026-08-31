const assert = require('node:assert/strict');
const test = require('node:test');
const { createApp } = require('../dist/server/app');

async function withServer(run, app = createApp()) {
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

test('GET /health reports that the API is alive', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('unknown routes return the standard error shape', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/unknown`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route not found',
      },
    });
  });
});

test('allows configured browser origins and rejects unknown origins', async () => {
  const app = createApp({ allowedOrigins: ['http://localhost:4173'] });

  await withServer(async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'http://localhost:4173' },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:4173');

    const denied = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'https://untrusted.example' },
    });
    assert.equal(denied.status, 403);
  }, app);
});
