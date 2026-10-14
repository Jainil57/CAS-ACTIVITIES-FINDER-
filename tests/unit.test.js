// unit.test.js — tests the pure algorithm functions directly (no server, no database).
// Run with:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidDate, datesOverlap, addDays } = require('../src/dates');
const { validateProject, passwordProblem, cleanLoginId } = require('../src/validation');
const { normalise, searchProjects } = require('../src/search');
const { checkJoinRequest } = require('../src/joinRules');
const { canMove } = require('../src/statusFlow');
const { buildCasRecord } = require('../src/casRecord');
const { validProject, TODAY } = require('./helpers');

// ---------------- dates ----------------
test('T01 (SC3) date validation: normal, boundary and invalid dates', () => {
  assert.equal(isValidDate('2026-10-14'), true);           // normal
  assert.equal(isValidDate('2028-02-29'), true);           // boundary: leap day exists in 2028
  assert.equal(isValidDate('2026-02-29'), false);          // invalid: 2026 is not a leap year
  assert.equal(isValidDate('2026-02-30'), false);          // invalid: rolls over in JS, must be caught
  assert.equal(isValidDate('14/10/2026'), false);          // invalid: wrong format
  assert.equal(isValidDate(''), false);                    // invalid: empty
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');    // year boundary
});

test('T02 (SC4) date overlap: touching ranges clash, separate ranges do not', () => {
  assert.equal(datesOverlap('2026-11-01', '2026-11-05', '2026-11-03', '2026-11-10'), true);   // partial overlap
  assert.equal(datesOverlap('2026-11-01', '2026-11-05', '2026-11-05', '2026-11-06'), true);   // boundary: same day
  assert.equal(datesOverlap('2026-11-01', '2026-11-05', '2026-11-06', '2026-11-07'), false);  // next day: no clash
  assert.equal(datesOverlap('2026-11-01', '2026-11-30', '2026-11-10', '2026-11-11'), true);   // one inside the other
});

// ---------------- validation ----------------
test('T03 (SC3) project form: a valid form has no errors', () => {
  assert.deepEqual(validateProject(validProject(), TODAY).errors, []);
});

test('T04 (SC3) project form: title length boundaries 5 and 80', () => {
  assert.deepEqual(validateProject(validProject({ title: 'Choir' }), TODAY).errors, []);            // 5 chars OK
  assert.equal(validateProject(validProject({ title: 'Art' }), TODAY).errors.length, 1);            // 3 chars rejected
  assert.deepEqual(validateProject(validProject({ title: 'x'.repeat(80) }), TODAY).errors, []);     // 80 OK
  assert.equal(validateProject(validProject({ title: 'x'.repeat(81) }), TODAY).errors.length, 1);   // 81 rejected
  assert.equal(validateProject(validProject({ title: '     ' }), TODAY).errors.length, 1);          // only spaces
});

test('T05 (SC3) project form: date order today <= deadline <= start <= end', () => {
  const ok = (o) => validateProject(validProject(o), TODAY).errors.length === 0;
  assert.equal(ok({ applyDeadline: TODAY }), true);                                     // boundary: deadline today
  assert.equal(ok({ applyDeadline: '2026-09-30' }), false);                             // deadline yesterday
  assert.equal(ok({ applyDeadline: '2026-11-20' }), true);                              // boundary: deadline = start
  assert.equal(ok({ applyDeadline: '2026-11-21' }), false);                             // deadline after start
  assert.equal(ok({ endDate: '2026-11-19' }), false);                                   // ends before it starts
  assert.equal(ok({ startDate: '2026-02-30' }), false);                                 // impossible date
});

test('T06 (SC3) project form: numbers, strand and places are checked', () => {
  const errorsFor = (o) => validateProject(validProject(o), TODAY).errors.length;
  assert.equal(errorsFor({ hours: 0 }), 1);
  assert.equal(errorsFor({ hours: 200 }), 0);              // boundary maximum
  assert.equal(errorsFor({ hours: 4.5 }), 1);              // not a whole number
  assert.equal(errorsFor({ hours: 'four' }), 1);
  assert.equal(errorsFor({ fee: -1 }), 1);
  assert.equal(errorsFor({ strand: 'Sport' }), 1);
  assert.equal(errorsFor({ capParticipant: 0, capVolunteer: 0, capOrganizer: 0 }), 1);
  assert.equal(validateProject({}, TODAY).errors.length >= 6, true);   // empty form → many errors at once
});

test('T07 (SC1) passwords and school IDs', () => {
  assert.equal(passwordProblem('Password1'), null);
  assert.notEqual(passwordProblem('Pass1'), null);          // too short
  assert.notEqual(passwordProblem('password'), null);       // no digit
  assert.notEqual(passwordProblem('12345678'), null);       // no letter
  assert.equal(passwordProblem('abcdefg1'), null);          // boundary: exactly 8
  assert.equal(cleanLoginId(' s1001 '), 'S1001');           // trimmed and upper-cased
  assert.equal(cleanLoginId('S1-001'), null);               // symbols not allowed
});

// ---------------- search (Algorithm 1) ----------------
const sample = [
  { id: 1, title: 'Juhu Beach Clean-Up Drive', description: 'Collect plastic', location: 'Mumbai', school_name: 'Greenwood', strand: 'Service', school_id: 1, start_date: '2026-10-11', apply_deadline: '2026-10-08' },
  { id: 2, title: 'School Mural Painting', description: 'Paint a wall about clean oceans', location: 'Mumbai', school_name: 'Greenwood', strand: 'Creativity', school_id: 1, start_date: '2026-10-05', apply_deadline: '2026-09-25' },
  { id: 3, title: 'Café Music Night', description: 'Acoustic evening', location: 'Pune', school_name: 'Lakeside', strand: 'Creativity', school_id: 2, start_date: '2026-10-20', apply_deadline: '2026-10-15' },
];

test('T08 (SC2) search: case-insensitive partial matching ranks title matches first', () => {
  const results = searchProjects(sample, { query: 'CLEAN', schoolId: 1, today: TODAY });
  assert.deepEqual(results.map((p) => p.id), [1, 2]);       // title match (3 pts) beats description match (1 pt)
  assert.deepEqual(searchProjects(sample, { query: 'cafe', schoolId: 1, today: TODAY }).map((p) => p.id), [3]);   // accent ignored
  assert.deepEqual(searchProjects(sample, { query: 'clean-up!!', schoolId: 1, today: TODAY }).map((p) => p.id), [1]);
});

test('T09 (SC2) search: filters by strand, school scope and open deadline', () => {
  assert.deepEqual(searchProjects(sample, { strand: 'Creativity', schoolId: 1, today: TODAY }).map((p) => p.id), [2, 3]);
  assert.deepEqual(searchProjects(sample, { scope: 'other', schoolId: 1, today: TODAY }).map((p) => p.id), [3]);
  assert.deepEqual(searchProjects(sample, { scope: 'mine', schoolId: 1, today: TODAY }).map((p) => p.id), [2, 1]);
  assert.deepEqual(searchProjects(sample, { openOnly: true, schoolId: 1, today: TODAY }).map((p) => p.id), [1, 3]);
});

test('T10 (SC2) search: no match, empty list and odd input are handled safely', () => {
  assert.deepEqual(searchProjects(sample, { query: 'skydiving', schoolId: 1, today: TODAY }), []);
  assert.deepEqual(searchProjects([], { query: 'beach', schoolId: 1, today: TODAY }), []);
  assert.equal(searchProjects(sample, { query: '   ', schoolId: 1, today: TODAY }).length, 3);   // blank = everything
  assert.equal(normalise(null), '');
});

// ---------------- join rules (Algorithm 2) ----------------
const project = { id: 9, school_id: 1, interschool: 0, status: 'approved', creator_id: 50, apply_deadline: '2026-10-10',
  start_date: '2026-10-20', end_date: '2026-10-22', cap_participant: 2, cap_volunteer: 0, cap_organizer: 1 };
const student = { id: 7, school_id: 1 };
const base = { project, user: student, role: 'participant', existing: undefined,
  counts: { participant: 0, volunteer: 0, organizer: 0 }, schedule: [], today: TODAY };

test('T11 (SC4) join rules: a valid request passes', () => {
  assert.deepEqual(checkJoinRequest(base), { ok: true });
});

test('T12 (SC4) join rules: each rule rejects the right case', () => {
  const reason = (changes) => checkJoinRequest({ ...base, ...changes }).reason;
  assert.match(reason({ role: 'captain' }), /Choose/);
  assert.match(reason({ user: { id: 7, school_id: 2 } }), /not found/);                    // other school, not interschool
  assert.match(reason({ project: { ...project, status: 'pending' } }), /not found/);        // hidden
  assert.match(reason({ project: { ...project, status: 'completed' } }), /not open/);      // closed
  assert.match(reason({ user: { id: 50, school_id: 1 } }), /created/);
  assert.match(reason({ existing: { status: 'pending' } }), /already/);
  assert.match(reason({ today: '2026-10-11' }), /deadline/);                               // one day late
  assert.equal(checkJoinRequest({ ...base, today: '2026-10-10' }).ok, true);               // boundary: on the deadline
  assert.match(reason({ counts: { participant: 2 } }), /no participant places/);           // full
  assert.equal(checkJoinRequest({ ...base, counts: { participant: 1 } }).ok, true);        // boundary: last place
  assert.match(reason({ role: 'volunteer' }), /no volunteer places/);                      // role has 0 places
  assert.match(reason({ schedule: [{ id: 4, title: 'Band practice', start_date: '2026-10-22', end_date: '2026-10-25' }] }), /clash/);
});

// ---------------- status flow (Algorithm 3) ----------------
test('T13 (SC6) project life-cycle only allows valid moves', () => {
  assert.equal(canMove('pending', 'approved'), true);
  assert.equal(canMove('pending', 'rejected'), true);
  assert.equal(canMove('approved', 'ongoing'), true);
  assert.equal(canMove('ongoing', 'completed'), true);
  assert.equal(canMove('pending', 'completed'), false);     // cannot skip steps
  assert.equal(canMove('completed', 'pending'), false);     // cannot go backwards
  assert.equal(canMove('rejected', 'approved'), false);
  assert.equal(canMove('banana', 'approved'), false);       // unknown status
});

// ---------------- CAS record (Algorithm 4) ----------------
test('T14 (SC8) CAS record totals only count completed projects', () => {
  const record = buildCasRecord([
    { title: 'B', strand: 'Service', hours: 4, status: 'completed', start_date: '2026-09-01' },
    { title: 'A', strand: 'Activity', hours: 10, status: 'ongoing', start_date: '2026-08-01' },
    { title: 'C', strand: 'Service', hours: 3, status: 'completed', start_date: '2026-09-10' },
  ]);
  assert.deepEqual(record.totals, { Creativity: 0, Activity: 0, Service: 7, all: 7 });
  assert.equal(record.completed, 2);
  assert.deepEqual(record.entries.map((e) => e.title), ['A', 'B', 'C']);    // sorted by start date
  assert.deepEqual(buildCasRecord([]).totals, { Creativity: 0, Activity: 0, Service: 0, all: 0 });   // empty record
});
