// api.test.js — integration tests: real HTTP requests to a running server with a test database.
// Each test starts its own fresh server so tests cannot affect each other.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, validProject } = require('./helpers');

// Runs `fn` with a fresh server and always shuts the server down afterwards (even if a check fails).
async function withServer(fn) {
  const t = await startTestServer();
  try { await fn(t); } finally { t.close(); }
}

const GMIS = 1;
const SENAYAN = 2;

// ---------------- SC1: accounts and login ----------------
test('T15 (SC1) a student added by the principal can activate an account exactly once', () => withServer(async ({ request, login }) => {
  const weak = await request('POST', '/api/auth/activate', { schoolId: GMIS, loginId: 'S1004', password: 'short' });
  assert.equal(weak.status, 400);
  const unknown = await request('POST', '/api/auth/activate', { schoolId: GMIS, loginId: 'S9999', password: 'Password1' });
  assert.equal(unknown.status, 404);
  const wrongSchool = await request('POST', '/api/auth/activate', { schoolId: SENAYAN, loginId: 'S1004', password: 'Password1' });
  assert.equal(wrongSchool.status, 404);
  const ok = await request('POST', '/api/auth/activate', { schoolId: GMIS, loginId: 's1004', password: 'Nadia2026' });
  assert.equal(ok.status, 201);
  const again = await request('POST', '/api/auth/activate', { schoolId: GMIS, loginId: 'S1004', password: 'Other2026' });
  assert.equal(again.status, 409);
  assert.ok(await login(GMIS, 'S1004', 'Nadia2026'));
}));

test('T16 (SC1) login rejects wrong details with one message and stores only hashed passwords', () => withServer(async ({ request, db }) => {
  const wrongPassword = await request('POST', '/api/auth/login', { schoolId: GMIS, loginId: 'S1001', password: 'Password2' });
  const unknownId = await request('POST', '/api/auth/login', { schoolId: GMIS, loginId: 'S7777', password: 'Password1' });
  const notActivated = await request('POST', '/api/auth/login', { schoolId: GMIS, loginId: 'S1004', password: '' });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownId.status, 401);
  assert.equal(notActivated.status, 401);
  assert.equal(wrongPassword.data.error, unknownId.data.error);     // attacker cannot tell which IDs exist

  const ok = await request('POST', '/api/auth/login', { schoolId: GMIS, loginId: 'S1001', password: 'Password1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.name, 'Aarav Shah');
  assert.equal(ok.data.user.password_hash, undefined);              // hash never sent to the browser

  const stored = db.prepare("SELECT password_hash FROM users WHERE login_id = 'S1001'").get().password_hash;
  assert.notEqual(stored, 'Password1');
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/);              // salt:hash
}));

// ---------------- SC9: role-based access ----------------
test('T17 (SC9) every role can only reach its own features', () => withServer(async ({ request, login, ids }) => {
  assert.equal((await request('GET', '/api/projects')).status, 401);                      // not logged in
  const student = await login(GMIS, 'S1001');
  const teacher = await login(GMIS, 'T200');
  const principal = await login(GMIS, 'P100');
  const admin = await login(null, 'ADMIN');
  assert.equal((await request('GET', '/api/teacher/projects', undefined, student)).status, 403);
  assert.equal((await request('GET', '/api/principal/members', undefined, teacher)).status, 403);
  assert.equal((await request('GET', '/api/admin/schools', undefined, principal)).status, 403);
  assert.equal((await request('POST', '/api/projects', validProject(), teacher)).status, 403);  // only students create
  assert.equal((await request('GET', '/api/projects', undefined, admin)).status, 403);
  // A principal cannot remove someone from ANOTHER school (Bima is at Senayan).
  assert.equal((await request('DELETE', `/api/principal/members/${ids.bima}`, undefined, principal)).status, 404);
  // After logging out, the old cookie no longer works.
  await request('POST', '/api/auth/logout', undefined, student);
  assert.equal((await request('GET', '/api/my/projects', undefined, student)).status, 401);
}));

// ---------------- SC2: search ----------------
test('T18 (SC2) search shows own-school and interschool projects only, with filters', () => withServer(async ({ request, login, ids }) => {
  const rizky = await login(GMIS, 'S1003');
  const all = await request('GET', '/api/projects', undefined, rizky);
  const titles = all.data.map((p) => p.title).sort();
  assert.deepEqual(titles, ['Ancol Beach Clean-Up Drive', 'Batik Mural Painting', 'Inter-school Futsal League']);
  // Not shown: Pencak Silat Mornings (other school, not interschool), Coding Club (pending), Panti Werdha Visit (completed).

  const foot = await request('GET', '/api/projects?q=FUTSAL', undefined, rizky);
  assert.deepEqual(foot.data.map((p) => p.id), [ids.futsal]);
  const service = await request('GET', '/api/projects?strand=Service', undefined, rizky);
  assert.deepEqual(service.data.map((p) => p.id), [ids.beach]);
  const other = await request('GET', '/api/projects?scope=other', undefined, rizky);
  assert.deepEqual(other.data.map((p) => p.id), [ids.futsal]);
  const south = await request('GET', '/api/projects?q=jakarta%20selatan', undefined, rizky);   // search by area
  assert.deepEqual(south.data.map((p) => p.id), [ids.futsal]);
  const none = await request('GET', '/api/projects?q=skydiving', undefined, rizky);
  assert.deepEqual(none.data, []);
  // Places left are reported: the beach project has 1 accepted participant out of 20.
  const beach = all.data.find((p) => p.id === ids.beach);
  assert.deepEqual(beach.places.participant, { taken: 1, total: 20 });
}));

// ---------------- SC3: creating projects ----------------
test('T19 (SC3) a new project waits for approval and bad input is rejected', () => withServer(async ({ request, login }) => {
  const putri = await login(GMIS, 'S1002');
  const rizky = await login(GMIS, 'S1003');
  const teacher = await login(GMIS, 'T200');

  const created = await request('POST', '/api/projects', validProject(), putri);
  assert.equal(created.status, 201);
  const id = created.data.id;
  const search = await request('GET', '/api/projects?q=mangrove', undefined, rizky);
  assert.deepEqual(search.data, []);                                                   // pending → hidden
  assert.equal((await request('GET', `/api/projects/${id}`, undefined, rizky)).status, 404);
  assert.equal((await request('GET', `/api/projects/${id}`, undefined, putri)).data.status, 'pending');
  const queue = await request('GET', '/api/teacher/projects', undefined, teacher);
  assert.equal(queue.data[0].status, 'pending');                                      // pending listed first

  const bad = await request('POST', '/api/projects', validProject({ title: 'Art', hours: 0 }), putri);
  assert.equal(bad.status, 400);
  assert.equal(bad.data.errors.length, 2);                                            // both problems reported
}));

test('T20 (SC3) malformed and oversized requests are rejected safely', () => withServer(async ({ request, login }) => {
  const putri = await login(GMIS, 'S1002');
  const { status } = await request('POST', '/api/projects', validProject({ description: 'x'.repeat(60000) }), putri);
  assert.equal(status, 413);
  const unknown = await request('GET', '/api/does-not-exist', undefined, putri);
  assert.equal(unknown.status, 404);
}));

// ---------------- SC6: teacher approval and progression ----------------
test('T21 (SC6) the teacher approves, rejects and progresses projects through valid stages only', () => withServer(async ({ request, login, ids }) => {
  const teacher = await login(GMIS, 'T200');
  const rizky = await login(GMIS, 'S1003');
  const otherTeacher = await login(SENAYAN, 'T600');

  // Teachers of another school cannot touch GMIS projects.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'approved' }, otherTeacher)).status, 404);
  // Cannot skip from pending straight to completed.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'completed' }, teacher)).status, 409);
  // Rejecting needs a reason.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'rejected', comment: 'no' }, teacher)).status, 400);
  // Approve → the project now appears in student searches.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'approved' }, teacher)).status, 200);
  const found = await request('GET', '/api/projects?q=coding', undefined, rizky);
  assert.deepEqual(found.data.map((p) => p.id), [ids.coding]);
  // approved → ongoing is fine, but completing before the end date is blocked.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'ongoing' }, teacher)).status, 200);
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'completed' }, teacher)).status, 409);

  // Deadlines: must be a real date between today and the start date.
  const deadline = (d) => request('POST', `/api/teacher/projects/${ids.mural}/deadline`, { applyDeadline: d }, teacher);
  assert.equal((await deadline('2026-10-12')).status, 200);
  assert.equal((await deadline('2026-09-01')).status, 400);     // in the past
  assert.equal((await deadline('2026-12-31')).status, 400);     // after the start date
  assert.equal((await deadline('2026-02-30')).status, 400);     // not a real date
}));

// ---------------- SC4 and SC5: joining and managing requests ----------------
test('T22 (SC4) join requests follow every rule, including date-clash detection', () => withServer(async ({ request, login, ids }) => {
  const rizky = await login(GMIS, 'S1003');
  const putri = await login(GMIS, 'S1002');
  const aarav = await login(GMIS, 'S1001');
  const bima = await login(SENAYAN, 'S2001');
  const ayu = await login(SENAYAN, 'S2002');
  const join = (id, role, who) => request('POST', `/api/projects/${id}/join`, { role }, who);

  assert.equal((await join(ids.mural, 'participant', rizky)).status, 201);
  assert.equal((await join(ids.mural, 'volunteer', rizky)).status, 409);               // duplicate
  const clash = await join(ids.futsal, 'participant', putri);                          // Putri is busy at the beach on those dates
  assert.equal(clash.status, 409);
  assert.match(clash.data.error, /Ancol Beach/);
  assert.equal((await join(ids.beach, 'participant', aarav)).status, 409);              // creator
  assert.equal((await join(ids.beach, 'participant', ayu)).status, 201);             // interschool: other school allowed
  assert.equal((await join(ids.mural, 'participant', ayu)).status, 404);             // not interschool
  assert.equal((await join(ids.beach, 'participant', bima)).status, 409);              // clashes with the league he runs
  assert.equal((await join(ids.coding, 'participant', putri)).status, 404);              // pending project is hidden
  assert.equal((await join(ids.oldAge, 'participant', putri)).status, 409);              // completed: closed
  assert.equal((await join(ids.mural, 'captain', putri)).status, 400);                   // invalid role
}));

test('T23 (SC5) the creator accepts/rejects requests and capacity can never be exceeded', () => withServer(async ({ request, login }) => {
  const putri = await login(GMIS, 'S1002');
  const rizky = await login(GMIS, 'S1003');
  const aarav = await login(GMIS, 'S1001');
  const teacher = await login(GMIS, 'T200');

  const { data } = await request('POST', '/api/projects', validProject({ capParticipant: 1 }), putri);
  await request('POST', `/api/teacher/projects/${data.id}/status`, { status: 'approved' }, teacher);
  await request('POST', `/api/projects/${data.id}/join`, { role: 'participant' }, rizky);
  await request('POST', `/api/projects/${data.id}/join`, { role: 'participant' }, aarav);   // both asked while 1 place was free

  const detail = await request('GET', `/api/projects/${data.id}`, undefined, putri);
  const [first, second] = detail.data.requests;
  assert.equal((await request('POST', `/api/memberships/${first.id}/decision`, { decision: 'accepted' }, aarav)).status, 404);  // not the creator
  assert.equal((await request('POST', `/api/memberships/${first.id}/decision`, { decision: 'maybe' }, putri)).status, 400);
  assert.equal((await request('POST', `/api/memberships/${first.id}/decision`, { decision: 'accepted' }, putri)).status, 200);
  assert.equal((await request('POST', `/api/memberships/${first.id}/decision`, { decision: 'rejected' }, putri)).status, 409);  // already decided
  const full = await request('POST', `/api/memberships/${second.id}/decision`, { decision: 'accepted' }, putri);
  assert.equal(full.status, 409);                                                         // capacity re-checked
  assert.equal((await request('POST', `/api/memberships/${second.id}/decision`, { decision: 'rejected' }, putri)).status, 200);

  const after = await request('GET', `/api/projects/${data.id}`, undefined, putri);
  assert.deepEqual(after.data.places.participant, { taken: 1, total: 1 });
}));

// ---------------- SC8: CAS record ----------------
test('T24 (SC8) the CAS record lists all activities and counts only completed hours', () => withServer(async ({ request, login }) => {
  const aarav = await login(GMIS, 'S1001');
  const { data } = await request('GET', '/api/my/cas-record', undefined, aarav);
  assert.deepEqual(data.entries.map((e) => [e.title, e.role]), [
    ['Panti Werdha Visit', 'participant'],          // completed — 3 hours
    ['Inter-school Futsal League', 'organizer'],  // ongoing, other school
    ['Ancol Beach Clean-Up Drive', 'creator'],       // approved, not finished
  ]);
  assert.deepEqual(data.totals, { Creativity: 0, Activity: 0, Service: 3, all: 3 });

  const nadia = await request('POST', '/api/auth/activate', { schoolId: GMIS, loginId: 'S1004', password: 'Nadia2026' });
  assert.equal(nadia.status, 201);
  const empty = await request('GET', '/api/my/cas-record', undefined, await login(GMIS, 'S1004', 'Nadia2026'));
  assert.deepEqual(empty.data.entries, []);         // new student: empty record, no crash
}));

// ---------------- SC7: principal and service provider ----------------
test('T25 (SC7) the principal adds and removes students and teachers of their own school', () => withServer(async ({ request, login, ids }) => {
  const principal = await login(GMIS, 'P100');
  const rizky = await login(GMIS, 'S1003');
  const add = (body) => request('POST', '/api/principal/members', body, principal);

  assert.equal((await add({ loginId: 's1005', name: 'Ishaan Verma', role: 'student' })).status, 201);
  assert.equal((await add({ loginId: 'S1005', name: 'Someone Else', role: 'student' })).status, 409);   // duplicate ID
  assert.equal((await add({ loginId: 'S1-6', name: 'Bad Id', role: 'student' })).status, 400);
  assert.equal((await add({ loginId: 'S1006', name: 'A', role: 'student' })).status, 400);               // name too short
  assert.equal((await add({ loginId: 'S1006', name: 'New Head', role: 'principal' })).status, 400);      // cannot create principals
  assert.equal((await request('POST', '/api/auth/activate', { schoolId: GMIS, loginId: 'S1005', password: 'Ishaan2026' })).status, 201);

  // Remove Rizky: his open session stops working and he can no longer log in.
  assert.equal((await request('DELETE', `/api/principal/members/${ids.rizky}`, undefined, principal)).status, 200);
  assert.equal((await request('GET', '/api/my/projects', undefined, rizky)).status, 401);
  assert.equal((await request('POST', '/api/auth/login', { schoolId: GMIS, loginId: 'S1003', password: 'Password1' })).status, 401);
  const list = await request('GET', '/api/principal/members', undefined, principal);
  assert.equal(list.data.some((m) => m.loginId === 'S1003'), false);
}));

test('T26 (SC7) the service provider adds/removes schools and assigns principals', () => withServer(async ({ request, login }) => {
  const admin = await login(null, 'ADMIN');
  const rizky = await login(GMIS, 'S1003');

  const school = await request('POST', '/api/admin/schools', { name: 'Kelapa Gading World School', city: 'Jakarta Utara' }, admin);
  assert.equal(school.status, 201);
  assert.equal((await request('POST', '/api/admin/schools', { name: 'Mumbai Academy', city: 'Mumbai' }, admin)).status, 400);   // not a Jabodetabek area
  assert.equal((await request('POST', '/api/admin/schools', { name: 'KELAPA GADING world school', city: 'Jakarta Utara' }, admin)).status, 409);
  const assign = (body) => request('POST', `/api/admin/schools/${school.data.id}/principal`, body, admin);
  assert.equal((await assign({ loginId: 'P900', name: 'Pak Hendra' })).status, 201);
  assert.equal((await request('POST', '/api/auth/activate', { schoolId: school.data.id, loginId: 'P900', password: 'Hendra2026' })).status, 201);
  assert.ok(await login(school.data.id, 'P900', 'Hendra2026'));
  // Replacing the principal deactivates the old one.
  assert.equal((await assign({ loginId: 'P901', name: 'Ibu Sari Utami' })).status, 201);
  assert.equal((await request('POST', '/api/auth/login', { schoolId: school.data.id, loginId: 'P900', password: 'Hendra2026' })).status, 401);

  // Removing Senayan hides its interschool futsal project from GMIS students.
  assert.equal((await request('DELETE', `/api/admin/schools/${SENAYAN}`, undefined, admin)).status, 200);
  const titles = (await request('GET', '/api/projects', undefined, rizky)).data.map((p) => p.title);
  assert.equal(titles.includes('Inter-school Futsal League'), false);
  assert.equal((await request('POST', '/api/auth/login', { schoolId: SENAYAN, loginId: 'S2001', password: 'Password1' })).status, 401);
}));
