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

const GREENWOOD = 1;
const LAKESIDE = 2;

// ---------------- SC1: accounts and login ----------------
test('T15 (SC1) a student added by the principal can activate an account exactly once', () => withServer(async ({ request, login }) => {
  const weak = await request('POST', '/api/auth/activate', { schoolId: GREENWOOD, loginId: 'S1004', password: 'short' });
  assert.equal(weak.status, 400);
  const unknown = await request('POST', '/api/auth/activate', { schoolId: GREENWOOD, loginId: 'S9999', password: 'Password1' });
  assert.equal(unknown.status, 404);
  const wrongSchool = await request('POST', '/api/auth/activate', { schoolId: LAKESIDE, loginId: 'S1004', password: 'Password1' });
  assert.equal(wrongSchool.status, 404);
  const ok = await request('POST', '/api/auth/activate', { schoolId: GREENWOOD, loginId: 's1004', password: 'Meera2026' });
  assert.equal(ok.status, 201);
  const again = await request('POST', '/api/auth/activate', { schoolId: GREENWOOD, loginId: 'S1004', password: 'Other2026' });
  assert.equal(again.status, 409);
  assert.ok(await login(GREENWOOD, 'S1004', 'Meera2026'));
}));

test('T16 (SC1) login rejects wrong details with one message and stores only hashed passwords', () => withServer(async ({ request, db }) => {
  const wrongPassword = await request('POST', '/api/auth/login', { schoolId: GREENWOOD, loginId: 'S1001', password: 'Password2' });
  const unknownId = await request('POST', '/api/auth/login', { schoolId: GREENWOOD, loginId: 'S7777', password: 'Password1' });
  const notActivated = await request('POST', '/api/auth/login', { schoolId: GREENWOOD, loginId: 'S1004', password: '' });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownId.status, 401);
  assert.equal(notActivated.status, 401);
  assert.equal(wrongPassword.data.error, unknownId.data.error);     // attacker cannot tell which IDs exist

  const ok = await request('POST', '/api/auth/login', { schoolId: GREENWOOD, loginId: 'S1001', password: 'Password1' });
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
  const student = await login(GREENWOOD, 'S1001');
  const teacher = await login(GREENWOOD, 'T200');
  const principal = await login(GREENWOOD, 'P100');
  const admin = await login(null, 'ADMIN');
  assert.equal((await request('GET', '/api/teacher/projects', undefined, student)).status, 403);
  assert.equal((await request('GET', '/api/principal/members', undefined, teacher)).status, 403);
  assert.equal((await request('GET', '/api/admin/schools', undefined, principal)).status, 403);
  assert.equal((await request('POST', '/api/projects', validProject(), teacher)).status, 403);  // only students create
  assert.equal((await request('GET', '/api/projects', undefined, admin)).status, 403);
  // A principal cannot remove someone from ANOTHER school (Rohan is at Lakeside).
  assert.equal((await request('DELETE', `/api/principal/members/${ids.rohan}`, undefined, principal)).status, 404);
  // After logging out, the old cookie no longer works.
  await request('POST', '/api/auth/logout', undefined, student);
  assert.equal((await request('GET', '/api/my/projects', undefined, student)).status, 401);
}));

// ---------------- SC2: search ----------------
test('T18 (SC2) search shows own-school and interschool projects only, with filters', () => withServer(async ({ request, login, ids }) => {
  const kabir = await login(GREENWOOD, 'S1003');
  const all = await request('GET', '/api/projects', undefined, kabir);
  const titles = all.data.map((p) => p.title).sort();
  assert.deepEqual(titles, ['Inter-school Football League', 'Juhu Beach Clean-Up Drive', 'School Mural Painting']);
  // Not shown: Yoga Mornings (other school, not interschool), Coding Club (pending), Old Age Home Visit (completed).

  const foot = await request('GET', '/api/projects?q=FOOT', undefined, kabir);
  assert.deepEqual(foot.data.map((p) => p.id), [ids.football]);
  const service = await request('GET', '/api/projects?strand=Service', undefined, kabir);
  assert.deepEqual(service.data.map((p) => p.id), [ids.beach]);
  const other = await request('GET', '/api/projects?scope=other', undefined, kabir);
  assert.deepEqual(other.data.map((p) => p.id), [ids.football]);
  const none = await request('GET', '/api/projects?q=skydiving', undefined, kabir);
  assert.deepEqual(none.data, []);
  // Places left are reported: the beach project has 1 accepted participant out of 20.
  const beach = all.data.find((p) => p.id === ids.beach);
  assert.deepEqual(beach.places.participant, { taken: 1, total: 20 });
}));

// ---------------- SC3: creating projects ----------------
test('T19 (SC3) a new project waits for approval and bad input is rejected', () => withServer(async ({ request, login }) => {
  const diya = await login(GREENWOOD, 'S1002');
  const kabir = await login(GREENWOOD, 'S1003');
  const teacher = await login(GREENWOOD, 'T200');

  const created = await request('POST', '/api/projects', validProject(), diya);
  assert.equal(created.status, 201);
  const id = created.data.id;
  const search = await request('GET', '/api/projects?q=tree', undefined, kabir);
  assert.deepEqual(search.data, []);                                                   // pending → hidden
  assert.equal((await request('GET', `/api/projects/${id}`, undefined, kabir)).status, 404);
  assert.equal((await request('GET', `/api/projects/${id}`, undefined, diya)).data.status, 'pending');
  const queue = await request('GET', '/api/teacher/projects', undefined, teacher);
  assert.equal(queue.data[0].status, 'pending');                                      // pending listed first

  const bad = await request('POST', '/api/projects', validProject({ title: 'Art', hours: 0 }), diya);
  assert.equal(bad.status, 400);
  assert.equal(bad.data.errors.length, 2);                                            // both problems reported
}));

test('T20 (SC3) malformed and oversized requests are rejected safely', () => withServer(async ({ request, login }) => {
  const diya = await login(GREENWOOD, 'S1002');
  const { status } = await request('POST', '/api/projects', validProject({ description: 'x'.repeat(60000) }), diya);
  assert.equal(status, 413);
  const unknown = await request('GET', '/api/does-not-exist', undefined, diya);
  assert.equal(unknown.status, 404);
}));

// ---------------- SC6: teacher approval and progression ----------------
test('T21 (SC6) the teacher approves, rejects and progresses projects through valid stages only', () => withServer(async ({ request, login, ids }) => {
  const teacher = await login(GREENWOOD, 'T200');
  const kabir = await login(GREENWOOD, 'S1003');
  const otherTeacher = await login(LAKESIDE, 'T600');

  // Teachers of another school cannot touch Greenwood projects.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'approved' }, otherTeacher)).status, 404);
  // Cannot skip from pending straight to completed.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'completed' }, teacher)).status, 409);
  // Rejecting needs a reason.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'rejected', comment: 'no' }, teacher)).status, 400);
  // Approve → the project now appears in student searches.
  assert.equal((await request('POST', `/api/teacher/projects/${ids.coding}/status`, { status: 'approved' }, teacher)).status, 200);
  const found = await request('GET', '/api/projects?q=coding', undefined, kabir);
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
  const kabir = await login(GREENWOOD, 'S1003');
  const diya = await login(GREENWOOD, 'S1002');
  const aarav = await login(GREENWOOD, 'S1001');
  const rohan = await login(LAKESIDE, 'S2001');
  const ananya = await login(LAKESIDE, 'S2002');
  const join = (id, role, who) => request('POST', `/api/projects/${id}/join`, { role }, who);

  assert.equal((await join(ids.mural, 'participant', kabir)).status, 201);
  assert.equal((await join(ids.mural, 'volunteer', kabir)).status, 409);               // duplicate
  const clash = await join(ids.football, 'participant', diya);                          // Diya is busy at the beach on those dates
  assert.equal(clash.status, 409);
  assert.match(clash.data.error, /Juhu Beach/);
  assert.equal((await join(ids.beach, 'participant', aarav)).status, 409);              // creator
  assert.equal((await join(ids.beach, 'participant', ananya)).status, 201);             // interschool: other school allowed
  assert.equal((await join(ids.mural, 'participant', ananya)).status, 404);             // not interschool
  assert.equal((await join(ids.beach, 'participant', rohan)).status, 409);              // clashes with the league he runs
  assert.equal((await join(ids.coding, 'participant', diya)).status, 404);              // pending project is hidden
  assert.equal((await join(ids.oldAge, 'participant', diya)).status, 409);              // completed: closed
  assert.equal((await join(ids.mural, 'captain', diya)).status, 400);                   // invalid role
}));

test('T23 (SC5) the creator accepts/rejects requests and capacity can never be exceeded', () => withServer(async ({ request, login }) => {
  const diya = await login(GREENWOOD, 'S1002');
  const kabir = await login(GREENWOOD, 'S1003');
  const aarav = await login(GREENWOOD, 'S1001');
  const teacher = await login(GREENWOOD, 'T200');

  const { data } = await request('POST', '/api/projects', validProject({ capParticipant: 1 }), diya);
  await request('POST', `/api/teacher/projects/${data.id}/status`, { status: 'approved' }, teacher);
  await request('POST', `/api/projects/${data.id}/join`, { role: 'participant' }, kabir);
  await request('POST', `/api/projects/${data.id}/join`, { role: 'participant' }, aarav);   // both asked while 1 place was free

  const detail = await request('GET', `/api/projects/${data.id}`, undefined, diya);
  const [first, second] = detail.data.requests;
  assert.equal((await request('POST', `/api/memberships/${first.id}/decision`, { decision: 'accepted' }, aarav)).status, 404);  // not the creator
  assert.equal((await request('POST', `/api/memberships/${first.id}/decision`, { decision: 'maybe' }, diya)).status, 400);
  assert.equal((await request('POST', `/api/memberships/${first.id}/decision`, { decision: 'accepted' }, diya)).status, 200);
  assert.equal((await request('POST', `/api/memberships/${first.id}/decision`, { decision: 'rejected' }, diya)).status, 409);  // already decided
  const full = await request('POST', `/api/memberships/${second.id}/decision`, { decision: 'accepted' }, diya);
  assert.equal(full.status, 409);                                                         // capacity re-checked
  assert.equal((await request('POST', `/api/memberships/${second.id}/decision`, { decision: 'rejected' }, diya)).status, 200);

  const after = await request('GET', `/api/projects/${data.id}`, undefined, diya);
  assert.deepEqual(after.data.places.participant, { taken: 1, total: 1 });
}));

// ---------------- SC8: CAS record ----------------
test('T24 (SC8) the CAS record lists all activities and counts only completed hours', () => withServer(async ({ request, login }) => {
  const aarav = await login(GREENWOOD, 'S1001');
  const { data } = await request('GET', '/api/my/cas-record', undefined, aarav);
  assert.deepEqual(data.entries.map((e) => [e.title, e.role]), [
    ['Old Age Home Visit', 'participant'],          // completed — 3 hours
    ['Inter-school Football League', 'organizer'],  // ongoing, other school
    ['Juhu Beach Clean-Up Drive', 'creator'],       // approved, not finished
  ]);
  assert.deepEqual(data.totals, { Creativity: 0, Activity: 0, Service: 3, all: 3 });

  const meera = await request('POST', '/api/auth/activate', { schoolId: GREENWOOD, loginId: 'S1004', password: 'Meera2026' });
  assert.equal(meera.status, 201);
  const empty = await request('GET', '/api/my/cas-record', undefined, await login(GREENWOOD, 'S1004', 'Meera2026'));
  assert.deepEqual(empty.data.entries, []);         // new student: empty record, no crash
}));

// ---------------- SC7: principal and service provider ----------------
test('T25 (SC7) the principal adds and removes students and teachers of their own school', () => withServer(async ({ request, login, ids }) => {
  const principal = await login(GREENWOOD, 'P100');
  const kabir = await login(GREENWOOD, 'S1003');
  const add = (body) => request('POST', '/api/principal/members', body, principal);

  assert.equal((await add({ loginId: 's1005', name: 'Ishaan Verma', role: 'student' })).status, 201);
  assert.equal((await add({ loginId: 'S1005', name: 'Someone Else', role: 'student' })).status, 409);   // duplicate ID
  assert.equal((await add({ loginId: 'S1-6', name: 'Bad Id', role: 'student' })).status, 400);
  assert.equal((await add({ loginId: 'S1006', name: 'A', role: 'student' })).status, 400);               // name too short
  assert.equal((await add({ loginId: 'S1006', name: 'New Head', role: 'principal' })).status, 400);      // cannot create principals
  assert.equal((await request('POST', '/api/auth/activate', { schoolId: GREENWOOD, loginId: 'S1005', password: 'Ishaan2026' })).status, 201);

  // Remove Kabir: his open session stops working and he can no longer log in.
  assert.equal((await request('DELETE', `/api/principal/members/${ids.kabir}`, undefined, principal)).status, 200);
  assert.equal((await request('GET', '/api/my/projects', undefined, kabir)).status, 401);
  assert.equal((await request('POST', '/api/auth/login', { schoolId: GREENWOOD, loginId: 'S1003', password: 'Password1' })).status, 401);
  const list = await request('GET', '/api/principal/members', undefined, principal);
  assert.equal(list.data.some((m) => m.loginId === 'S1003'), false);
}));

test('T26 (SC7) the service provider adds/removes schools and assigns principals', () => withServer(async ({ request, login }) => {
  const admin = await login(null, 'ADMIN');
  const kabir = await login(GREENWOOD, 'S1003');

  const school = await request('POST', '/api/admin/schools', { name: 'Hilltop World School', city: 'Nashik' }, admin);
  assert.equal(school.status, 201);
  assert.equal((await request('POST', '/api/admin/schools', { name: 'HILLTOP world school', city: 'Nashik' }, admin)).status, 409);
  const assign = (body) => request('POST', `/api/admin/schools/${school.data.id}/principal`, body, admin);
  assert.equal((await assign({ loginId: 'P900', name: 'Mr. Joshi' })).status, 201);
  assert.equal((await request('POST', '/api/auth/activate', { schoolId: school.data.id, loginId: 'P900', password: 'Joshi2026' })).status, 201);
  assert.ok(await login(school.data.id, 'P900', 'Joshi2026'));
  // Replacing the principal deactivates the old one.
  assert.equal((await assign({ loginId: 'P901', name: 'Ms. Kulkarni' })).status, 201);
  assert.equal((await request('POST', '/api/auth/login', { schoolId: school.data.id, loginId: 'P900', password: 'Joshi2026' })).status, 401);

  // Removing Lakeside hides its interschool football project from Greenwood students.
  assert.equal((await request('DELETE', `/api/admin/schools/${LAKESIDE}`, undefined, admin)).status, 200);
  const titles = (await request('GET', '/api/projects', undefined, kabir)).data.map((p) => p.title);
  assert.equal(titles.includes('Inter-school Football League'), false);
  assert.equal((await request('POST', '/api/auth/login', { schoolId: LAKESIDE, loginId: 'S2001', password: 'Password1' })).status, 401);
}));
