// helpers.js — shared set-up for the integration tests.
// Each test file gets a brand-new in-memory database with the demo data and a real HTTP server
// on a random free port, so tests never affect each other or the real data/cas.db file.
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seedDemo, DEMO_PASSWORD } = require('../scripts/seed');

const TODAY = '2026-10-01';   // a fixed "today" so date rules give the same result every time

async function startTestServer(today = TODAY) {
  const db = createDb(':memory:');
  const ids = seedDemo(db, today);
  const app = createApp(db, { today: () => today });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));        // port 0 = "any free port"
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

  function close() {
    server.closeAllConnections();
    server.close();
    db.close();
  }

  return { db, ids, today, request, login, close };
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

module.exports = { startTestServer, validProject, TODAY };
