// adminRoutes.js — the service provider (the company running the platform) adds and removes
// schools and assigns each school's principal. Mounted at /api/admin.
const express = require('express');
const { requireRole } = require('../auth');
const { cleanText, cleanLoginId, AREAS } = require('../validation');

module.exports = function adminRoutes(db) {
  const router = express.Router();
  router.use(requireRole('admin'));

  // GET /api/admin/schools — every active school with its principal and number of students.
  router.get('/schools', (req, res) => {
    res.json(db.prepare(`
      SELECT s.id, s.name, s.city,
        (SELECT name FROM users WHERE school_id = s.id AND role = 'principal' AND is_active = 1) AS principal,
        (SELECT COUNT(*) FROM users WHERE school_id = s.id AND role = 'student' AND is_active = 1) AS students
      FROM schools s WHERE s.is_active = 1 ORDER BY s.name`).all());
  });

  // POST /api/admin/schools  { name, city } — register a new IBDP school in Jakarta / Jabodetabek.
  router.post('/schools', (req, res) => {
    const name = cleanText(req.body.name, 3, 80);
    const city = AREAS.includes(req.body.city) ? req.body.city : null;     // must be one of the listed areas
    if (!name) return res.status(400).json({ error: 'School name must be 3-80 characters.' });
    if (!city) return res.status(400).json({ error: `Area must be one of: ${AREAS.join(', ')}.` });
    // "COLLATE NOCASE" makes "Senayan IB Academy" and "SENAYAN ib academy" count as the same name.
    if (db.prepare('SELECT id FROM schools WHERE name = ? COLLATE NOCASE').get(name)) {
      return res.status(409).json({ error: 'A school with this name already exists.' });
    }
    const info = db.prepare('INSERT INTO schools (name, city) VALUES (?, ?)').run(name, city);
    res.status(201).json({ id: Number(info.lastInsertRowid), message: `${name} added.` });
  });

  // DELETE /api/admin/schools/:id — remove a school (soft delete). Its users can no longer log in
  // and its projects disappear from searches, but nothing is lost permanently.
  router.delete('/schools/:id', (req, res) => {
    const school = db.prepare('SELECT id, name FROM schools WHERE id = ? AND is_active = 1').get(Number(req.params.id));
    if (!school) return res.status(404).json({ error: 'School not found.' });
    db.prepare('UPDATE schools SET is_active = 0 WHERE id = ?').run(school.id);
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE school_id = ?)').run(school.id);
    res.json({ message: `${school.name} removed.` });
  });

  // POST /api/admin/schools/:id/principal  { loginId, name } — assign (or replace) the principal.
  router.post('/schools/:id/principal', (req, res) => {
    const school = db.prepare('SELECT id FROM schools WHERE id = ? AND is_active = 1').get(Number(req.params.id));
    if (!school) return res.status(404).json({ error: 'School not found.' });
    const loginId = cleanLoginId(req.body.loginId);
    const name = cleanText(req.body.name, 2, 60);
    if (!loginId || !name) return res.status(400).json({ error: 'Enter a 3-12 character ID and a name.' });
    if (db.prepare('SELECT id FROM users WHERE school_id = ? AND login_id = ?').get(school.id, loginId)) {
      return res.status(409).json({ error: `ID ${loginId} is already used in this school.` });
    }
    // A school has exactly one principal, so the previous one (if any) is deactivated first.
    const old = db.prepare("SELECT id FROM users WHERE school_id = ? AND role = 'principal' AND is_active = 1").get(school.id);
    if (old) {
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(old.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(old.id);
    }
    db.prepare("INSERT INTO users (school_id, login_id, name, role) VALUES (?, ?, ?, 'principal')").run(school.id, loginId, name);
    res.status(201).json({ message: `${name} is now the principal. They activate their account with ID ${loginId}.` });
  });

  return router;
};
