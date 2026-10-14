// seed.js — fills a database with realistic demo data (schools, people, projects, sign-ups).
// Used automatically on the first `npm start`, by the automated tests, and by `npm run seed`
// (which deletes data/cas.db and starts again from fresh demo data).
const { hashPassword } = require('../src/auth');
const { addDays } = require('../src/dates');

const DEMO_PASSWORD = 'Password1';

// `today` is "YYYY-MM-DD". Project dates are worked out relative to it, so the demo always looks current.
function seedDemo(db, today) {
  const hash = hashPassword(DEMO_PASSWORD);   // hash once and reuse (scrypt is deliberately slow)
  const d = (days) => addDays(today, days);   // short helper: d(7) = one week from today

  // Inserts a row and returns its new id.
  const addSchool = (name, city) => Number(db.prepare('INSERT INTO schools (name, city) VALUES (?, ?)').run(name, city).lastInsertRowid);
  const addUser = (schoolId, loginId, name, role, activated = true) => Number(db.prepare(
    'INSERT INTO users (school_id, login_id, name, role, password_hash) VALUES (?, ?, ?, ?, ?)',
  ).run(schoolId, loginId, name, role, activated ? hash : null).lastInsertRowid);

  // A transaction makes all inserts happen together: either everything is saved or nothing is.
  db.exec('BEGIN');
  try {
    const gmis = addSchool('Gandhi Memorial International School', 'Jakarta Pusat');
    const senayan = addSchool('Senayan IB Academy', 'Jakarta Selatan');

    addUser(null, 'ADMIN', 'Service Provider', 'admin');
    const ids = {
      gmis, senayan,
      principal: addUser(gmis, 'P100', 'Ibu Ratna Dewi', 'principal'),
      teacher: addUser(gmis, 'T200', 'Mr. Vikram Mehta', 'teacher'),
      aarav: addUser(gmis, 'S1001', 'Aarav Shah', 'student'),
      putri: addUser(gmis, 'S1002', 'Putri Wijaya', 'student'),
      rizky: addUser(gmis, 'S1003', 'Rizky Pratama', 'student'),
      nadia: addUser(gmis, 'S1004', 'Nadia Kusuma', 'student', false),   // added but not yet activated
      senayanPrincipal: addUser(senayan, 'P500', 'Pak Budi Hartono', 'principal'),
      senayanTeacher: addUser(senayan, 'T600', 'Ibu Maya Sari', 'teacher'),
      bima: addUser(senayan, 'S2001', 'Bima Santoso', 'student'),
      ayu: addUser(senayan, 'S2002', 'Ayu Lestari', 'student'),
    };

    const addProject = (p) => Number(db.prepare(`
      INSERT INTO projects (title, description, strand, school_id, creator_id, interschool, location, start_date,
        end_date, apply_deadline, hours, fee, cap_participant, cap_volunteer, cap_organizer, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      p.title, p.description, p.strand, p.school, p.creator, p.interschool ? 1 : 0, p.location, p.start, p.end,
      p.deadline, p.hours, p.fee || 0, p.caps[0], p.caps[1], p.caps[2], p.status, d(-60)).lastInsertRowid);

    ids.beach = addProject({ title: 'Ancol Beach Clean-Up Drive', strand: 'Service', school: gmis, creator: ids.aarav,
      interschool: true, location: 'Pantai Ancol, Jakarta Utara', start: d(10), end: d(10), deadline: d(7), hours: 4,
      caps: [20, 5, 2], status: 'approved',
      description: 'Collect and sort plastic waste along Ancol beach with a local environmental NGO. Gloves and bags provided.' });
    ids.mural = addProject({ title: 'Batik Mural Painting', strand: 'Creativity', school: gmis, creator: ids.putri,
      location: 'GMIS main corridor, Kemayoran', start: d(14), end: d(28), deadline: d(10), hours: 15, fee: 50000,
      caps: [10, 2, 1], status: 'approved',
      description: 'Design and paint a batik-inspired mural about Jakarta and sustainability on the main corridor wall.' });
    ids.futsal = addProject({ title: 'Inter-school Futsal League', strand: 'Activity', school: senayan, creator: ids.bima,
      interschool: true, location: 'Senayan IB sports hall, Jakarta Selatan', start: d(-5), end: d(30), deadline: d(3), hours: 20,
      caps: [40, 6, 3], status: 'ongoing',
      description: 'Weekly 5-a-side futsal fixtures between IBDP schools in Jakarta, ending with a finals day.' });
    ids.coding = addProject({ title: 'Coding Club for Juniors', strand: 'Creativity', school: gmis, creator: ids.rizky,
      location: 'Computer lab 2', start: d(20), end: d(50), deadline: d(15), hours: 12,
      caps: [15, 3, 2], status: 'pending',
      description: 'Teach grade 6 and 7 students the basics of Scratch and Python every Friday afternoon.' });
    ids.oldAge = addProject({ title: 'Panti Werdha Visit', strand: 'Service', school: gmis, creator: ids.putri,
      location: 'Panti Werdha Kasih, Jakarta Pusat', start: d(-40), end: d(-40), deadline: d(-45), hours: 3,
      caps: [12, 0, 1], status: 'completed',
      description: 'Spend an afternoon at an elderly home (panti werdha) reading, singing and playing games with residents.' });
    ids.silat = addProject({ title: 'Pencak Silat Mornings', strand: 'Activity', school: senayan, creator: ids.bima,
      location: 'Senayan IB courtyard', start: d(5), end: d(35), deadline: d(4), hours: 10,
      caps: [25, 0, 1], status: 'approved',
      description: 'Learn pencak silat basics before school, three mornings a week. Senayan IB students only.' });

    const addMember = (project, user, role, status) => db.prepare(`
      INSERT INTO memberships (project_id, user_id, role, status, requested_at) VALUES (?, ?, ?, ?, ?)`)
      .run(project, user, role, status, d(-50));
    addMember(ids.beach, ids.putri, 'participant', 'accepted');
    addMember(ids.beach, ids.rizky, 'volunteer', 'pending');
    addMember(ids.oldAge, ids.aarav, 'participant', 'accepted');
    addMember(ids.oldAge, ids.rizky, 'participant', 'accepted');
    addMember(ids.futsal, ids.aarav, 'organizer', 'accepted');

    db.exec('COMMIT');                         // save everything
    return ids;
  } catch (err) {
    db.exec('ROLLBACK');                       // something failed: undo every insert
    throw err;
  }
}

// This block only runs for `npm run seed` (not when another file requires this one).
if (require.main === module) {
  const fs = require('node:fs');
  const path = require('node:path');
  const { createDb } = require('../src/db');
  const { localToday } = require('../src/dates');
  const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'cas.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.rmSync(file, { force: true });            // start from an empty database
  seedDemo(createDb(file), localToday());
  console.log(`Demo data written to ${file}`);
}

module.exports = { seedDemo, DEMO_PASSWORD };
