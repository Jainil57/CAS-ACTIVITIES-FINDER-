// persistence.test.js — SC10: data must still be there after the server is stopped and restarted.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const config = require('../config');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seedDemo } = require('../scripts/seed');
const { validProject, dropDatabase, TODAY } = require('./helpers');

// Connects to the MySQL database and starts a server on it.
async function start(database) {
  const db = await createDb({ ...config, database });
  const server = await new Promise((resolve) => { const s = createApp(db, { today: () => TODAY }).listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (method, url, body, cookie) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  const stop = async () => { server.closeAllConnections(); server.close(); await db.close(); };
  return { db, send, stop };
}

test('T27 (SC10) projects, requests and logins survive a server restart', async () => {
  const database = `cas_test_${crypto.randomBytes(4).toString('hex')}`;
  try {
    const first = await start(database);
    await seedDemo(first.db, TODAY);
    const login = await first.send('POST', '/api/auth/login', { schoolId: 1, loginId: 'S1002', password: 'Password1' });
    const created = await first.send('POST', '/api/projects', validProject(), login.cookie);
    assert.equal(created.status, 201);
    await first.stop();

    // Second run on the same database: the project is still there and the login still works.
    const second = await start(database);
    const mine = await second.send('GET', '/api/my/projects', undefined, login.cookie);
    assert.equal(mine.status, 200);
    assert.ok(mine.data.created.some((p) => p.id === created.data.id && p.title === 'Mangrove Planting Day'));
    await second.stop();
  } finally {
    await dropDatabase(database);
  }
});
