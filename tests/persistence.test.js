// persistence.test.js — SC10: data must still be there after the server is stopped and restarted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seedDemo } = require('../scripts/seed');
const { validProject, TODAY } = require('./helpers');

// Starts a server on a database FILE (not in memory) and returns helpers to talk to it.
async function start(file) {
  const db = createDb(file);
  const server = await new Promise((resolve) => { const s = createApp(db, { today: () => TODAY }).listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (method, url, body, cookie) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  return { db, send, stop: () => { server.closeAllConnections(); server.close(); db.close(); } };
}

test('T27 (SC10) projects, requests and logins survive a server restart', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-'));
  const file = path.join(folder, 'cas.db');
  seedDemo(createDb(file), TODAY);

  // First run: log in and create a project.
  const first = await start(file);
  const login = await first.send('POST', '/api/auth/login', { schoolId: 1, loginId: 'S1002', password: 'Password1' });
  const created = await first.send('POST', '/api/projects', validProject(), login.cookie);
  assert.equal(created.status, 201);
  first.stop();                                                 // "switch the server off"

  // Second run on the same file: the project is still there and the session is still valid.
  const second = await start(file);
  const mine = await second.send('GET', '/api/my/projects', undefined, login.cookie);
  assert.equal(mine.status, 200);
  assert.ok(mine.data.created.some((p) => p.id === created.data.id && p.title === 'Tree Planting Day'));
  second.stop();
  fs.rmSync(folder, { recursive: true, force: true });
});
