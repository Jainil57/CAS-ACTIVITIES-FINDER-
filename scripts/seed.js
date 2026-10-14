// seed.js — fills a database with realistic demo data (schools, people, projects, sign-ups).
const { hashPassword } = require('../src/auth');
const { addDays } = require('../src/dates');

const DEMO_PASSWORD = 'Password1';

// `today` is "YYYY-MM-DD". Project dates are worked out relative to it, so the demo always looks current.
async function seedDemo(db, today) {
  const hash = hashPassword(DEMO_PASSWORD);
  const d = (days) => addDays(today, days);

  // A transaction makes all inserts happen together: either everything is saved or nothing is.
  return db.transaction(async (tx) => {
    const addSchool = async (name, city) => (await tx.run('INSERT INTO schools (name, city) VALUES (?, ?)', name, city)).insertId;
    const addUser = async (schoolId, loginId, name, role, activated = true) => (await tx.run(
      'INSERT INTO users (school_id, login_id, name, role, password_hash) VALUES (?, ?, ?, ?, ?)',
      schoolId, loginId, name, role, activated ? hash : null)).insertId;
    const gmis = await addSchool('Gandhi Memorial International School', 'Jakarta Pusat');
    const senayan = await addSchool('Senayan IB Academy', 'Jakarta Selatan');

    await addUser(null, 'ADMIN', 'Service Provider', 'admin');
    const ids = {
      gmis, senayan,
      principal: await addUser(gmis, 'P100', 'Dr. Manish Semwal', 'principal'),
      teacher: await addUser(gmis, 'T200', 'Mr. Vikram Mehta', 'teacher'),
      aarav: await addUser(gmis, 'S1001', 'Aarav Shah', 'student'),
      putri: await addUser(gmis, 'S1002', 'Putri Wijaya', 'student'),
      rizky: await addUser(gmis, 'S1003', 'Rizky Pratama', 'student'),
      nadia: await addUser(gmis, 'S1004', 'Nadia Kusuma', 'student', false),
      senayanPrincipal: await addUser(senayan, 'P500', 'Pak Budi Hartono', 'principal'),
      senayanTeacher: await addUser(senayan, 'T600', 'Ibu Maya Sari', 'teacher'),
      bima: await addUser(senayan, 'S2001', 'Bima Santoso', 'student'),
      ayu: await addUser(senayan, 'S2002', 'Ayu Lestari', 'student'),
    };

    const addProject = async (p) => (await tx.run(`
      INSERT INTO projects (title, description, strand, school_id, creator_id, interschool, location, start_date,
        end_date, apply_deadline, hours, fee, cap_participant, cap_volunteer, cap_organizer, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.title, p.description, p.strand, p.school, p.creator, p.interschool ? 1 : 0, p.location, p.start, p.end,
      p.deadline, p.hours, p.fee || 0, p.caps[0], p.caps[1], p.caps[2], p.status, d(-60))).insertId;

    ids.beach = await addProject({ title: 'Ancol Beach Clean-Up Drive', strand: 'Service', school: gmis, creator: ids.aarav,
      interschool: true, location: 'Pantai Ancol, Jakarta Utara', start: d(10), end: d(10), deadline: d(7), hours: 4,
      caps: [20, 5, 2], status: 'approved',
      description: 'Collect and sort plastic waste along Ancol beach with a local environmental NGO. Gloves and bags provided.' });
    ids.mural = await addProject({ title: 'Batik Mural Painting', strand: 'Creativity', school: gmis, creator: ids.putri,
      location: 'GMIS main corridor, Kemayoran', start: d(14), end: d(28), deadline: d(10), hours: 15, fee: 50000,
      caps: [10, 2, 1], status: 'approved',
      description: 'Design and paint a batik-inspired mural about Jakarta and sustainability on the main corridor wall.' });
    ids.futsal = await addProject({ title: 'Inter-school Futsal League', strand: 'Activity', school: senayan, creator: ids.bima,
      interschool: true, location: 'Senayan IB sports hall, Jakarta Selatan', start: d(-5), end: d(30), deadline: d(3), hours: 20,
      caps: [40, 6, 3], status: 'ongoing',
      description: 'Weekly 5-a-side futsal fixtures between IBDP schools in Jakarta, ending with a finals day.' });
    ids.coding = await addProject({ title: 'Coding Club for Juniors', strand: 'Creativity', school: gmis, creator: ids.rizky,
      location: 'Computer lab 2', start: d(20), end: d(50), deadline: d(15), hours: 12,
      caps: [15, 3, 2], status: 'pending',
      description: 'Teach grade 6 and 7 students the basics of Scratch and Python every Friday afternoon.' });
    ids.oldAge = await addProject({ title: 'Panti Werdha Visit', strand: 'Service', school: gmis, creator: ids.putri,
      location: 'Panti Werdha Kasih, Jakarta Pusat', start: d(-40), end: d(-40), deadline: d(-45), hours: 3,
      caps: [12, 0, 1], status: 'completed',
      description: 'Spend an afternoon at an elderly home (panti werdha) reading, singing and playing games with residents.' });
    ids.silat = await addProject({ title: 'Pencak Silat Mornings', strand: 'Activity', school: senayan, creator: ids.bima,
      location: 'Senayan IB courtyard', start: d(5), end: d(35), deadline: d(4), hours: 10,
      caps: [25, 0, 1], status: 'approved',
      description: 'Learn pencak silat basics before school, three mornings a week. Senayan IB students only.' });

    const addMember = (project, user, role, status) => tx.run(`
      INSERT INTO memberships (project_id, user_id, role, status, requested_at) VALUES (?, ?, ?, ?, ?)`,
      project, user, role, status, d(-50));
    await addMember(ids.beach, ids.putri, 'participant', 'accepted');
    await addMember(ids.beach, ids.rizky, 'volunteer', 'pending');
    await addMember(ids.oldAge, ids.aarav, 'participant', 'accepted');
    await addMember(ids.oldAge, ids.rizky, 'participant', 'accepted');
    await addMember(ids.futsal, ids.aarav, 'organizer', 'accepted');

    return ids;
  });
}

// This block only runs for `npm run seed` (not when another file requires this one).
if (require.main === module) {
  const mysql = require('mysql2/promise');
  const config = require('../config');
  const { createDb } = require('../src/db');
  const { localToday } = require('../src/dates');
  (async () => {
    const conn = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password });
    await conn.query(`DROP DATABASE IF EXISTS \`${config.database}\``);
    await conn.end();
    const db = await createDb(config);
    await seedDemo(db, localToday());
    await db.close();
    console.log(`Demo data written to MySQL database "${config.database}".`);
  })();
}

module.exports = { seedDemo, DEMO_PASSWORD };
