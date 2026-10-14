// helpers.js — shared set-up for the integration tests.
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const config = require('../config');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seedDemo, DEMO_PASSWORD } = require('../scripts/seed');

const TODAY = '2026-10-01';

// Each test gets its own empty MySQL database (cas_test_<random>), deleted again by close().
async function dropDatabase(name) {
  const conn = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password });
  await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await conn.end();
}

async function startTestServer(today = TODAY) {
  const database = `cas_test_${crypto.randomBytes(4).toString('hex')}`;
  const db = await createDb({ ...config, database });
  const ids = await seedDemo(db, today);
  const app = createApp(db, { today: () => today });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // Sends a request and returns { status, data, cookie }.
  async function request(method, url, body, cookie) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.get('set-cookie');
    return { status: res.status, data: await res.json().catch(() => ({})), cookie: setCookie && setCookie.split(';')[0] };
  }

  // Logs in and returns the session cookie to send with later requests.
  async function login(schoolId, loginId, password = DEMO_PASSWORD) {
    const res = await request('POST', '/api/auth/login', { schoolId, loginId, password });
    if (res.status !== 200) throw new Error(`login failed for ${loginId}: ${res.data.error}`);
    return res.cookie;
  }

  async function close() {
    server.closeAllConnections();
    server.close();
    await db.close();
    await dropDatabase(database);
  }

  return { db, ids, today, database, request, login, close };
}

// A valid "create project" form; tests copy it and change one field at a time.
function validProject(overrides = {}) {
  return {
    title: 'Mangrove Planting Day',
    description: 'Plant 100 mangrove seedlings with the Angke Kapuk conservation rangers.',
    strand: 'Service',
    location: 'Taman Wisata Alam Angke Kapuk, Jakarta Utara',
    startDate: '2026-11-20',
    endDate: '2026-11-20',
    applyDeadline: '2026-11-15',
    hours: 5,
    fee: 0,
    capParticipant: 2,
    capVolunteer: 1,
    capOrganizer: 1,
    interschool: false,
    ...overrides,
  };
}

module.exports = { startTestServer, dropDatabase, validProject, TODAY };
