// performance.test.js — SC2: search must stay fast with a realistic amount of data.
// 2,000 approved projects is far more than a group of schools would have at once.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');
const { searchProjects } = require('../src/search');

const WORDS = ['beach', 'mural', 'robotics', 'football', 'tutoring', 'choir', 'garden', 'charity', 'drama', 'yoga'];
const STRANDS = ['Creativity', 'Activity', 'Service'];

test('T28 (SC2) search over 2,000 projects responds in under 1 second', async () => {
  const t = await startTestServer();
  try {
    const insert = t.db.prepare(`INSERT INTO projects (title, description, strand, school_id, creator_id, interschool, location,
      start_date, end_date, apply_deadline, hours, cap_participant, cap_volunteer, cap_organizer, status, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'Mumbai', '2026-12-01', '2026-12-02', '2026-11-20', 5, 10, 2, 1, 'approved', '2026-10-01')`);
    t.db.exec('BEGIN');
    for (let i = 0; i < 2000; i += 1) {
      const word = WORDS[i % WORDS.length];
      insert.run(`${word} project ${i}`, `A ${word} activity for IB students number ${i}`, STRANDS[i % 3], (i % 2) + 1, t.ids.aarav);
    }
    t.db.exec('COMMIT');
    const cookie = await t.login(1, 'S1003');

    const started = performance.now();
    const res = await t.request('GET', '/api/projects?q=robotics&openOnly=1', undefined, cookie);
    const ms = performance.now() - started;
    console.log(`    search over ${2000 + 6} projects returned ${res.data.length} results in ${ms.toFixed(1)} ms`);
    assert.equal(res.status, 200);
    assert.equal(res.data.length, 200);                 // every 10th project mentions robotics
    assert.ok(ms < 1000, `took ${ms} ms`);
  } finally {
    t.close();
  }
});

test('T29 (SC2) the search algorithm alone handles 20,000 projects in under 0.5 seconds', () => {
  const projects = Array.from({ length: 20000 }, (_, i) => ({
    id: i, title: `${WORDS[i % 10]} ${i}`, description: 'x', location: 'y', school_name: 'z',
    strand: STRANDS[i % 3], school_id: 1, start_date: '2026-12-01', apply_deadline: '2026-11-01',
  }));
  const started = performance.now();
  const results = searchProjects(projects, { query: 'Garden', schoolId: 1, today: '2026-10-01' });
  const ms = performance.now() - started;
  console.log(`    pure search over 20,000 projects: ${ms.toFixed(1)} ms`);
  assert.equal(results.length, 2000);
  assert.ok(ms < 500, `took ${ms} ms`);
});
