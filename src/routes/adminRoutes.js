// adminRoutes.js — service provider adds/removes schools and assigns principals.
const express = require('express');
const { requireRole } = require('../auth');
const { cleanText, cleanLoginId, AREAS } = require('../validation');

module.exports = function adminRoutes(db) {
  const router = express.Router();
  router.use(requireRole('admin'));

  // GET /api/admin/schools — every active school with its principal and number of students.
  router.get('/schools', async (req, res) => {
    res.json(await db.all(`
      SELECT s.id, s.name, s.city,
        (SELECT name FROM users WHERE school_id = s.id AND role = 'principal' AND is_active = 1) AS principal,
        (SELECT COUNT(*) FROM users WHERE school_id = s.id AND role = 'student' AND is_active = 1) AS students
      FROM schools s WHERE s.is_active = 1 ORDER BY s.name`));
  });

  // POST /api/admin/schools  { name, city } — register a new IBDP school in Jakarta / Jabodetabek.
  router.post('/schools', async (req, res) => {
    const name = cleanText(req.body.name, 3, 80);
    const city = AREAS.includes(req.body.city) ? req.body.city : null;
    if (!name) return res.status(400).json({ error: 'School name must be 3-80 characters.' });
    if (!city) return res.status(400).json({ error: `Area must be one of: ${AREAS.join(', ')}.` });
    // "COLLATE NOCASE" makes "Senayan IB Academy" and "SENAYAN ib academy" count as the same name.
    if (await db.get('SELECT id FROM schools WHERE name = ?', name)) {
      return res.status(409).json({ error: 'A school with this name already exists.' });
    }
    const info = await db.run('INSERT INTO schools (name, city) VALUES (?, ?)', name, city);
    res.status(201).json({ id: Number(info.insertId), message: `${name} added.` });
  });

  // DELETE /api/admin/schools/:id — soft delete; its users can no longer log in.
  router.delete('/schools/:id', async (req, res) => {
    const school = await db.get('SELECT id, name FROM schools WHERE id = ? AND is_active = 1', Number(req.params.id));
    if (!school) return res.status(404).json({ error: 'School not found.' });
    await db.run('UPDATE schools SET is_active = 0 WHERE id = ?', school.id);
    await db.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE school_id = ?)', school.id);
    res.json({ message: `${school.name} removed.` });
  });

  // POST /api/admin/schools/:id/principal  { loginId, name } — assign (or replace) the principal.
  router.post('/schools/:id/principal', async (req, res) => {
    const school = await db.get('SELECT id FROM schools WHERE id = ? AND is_active = 1', Number(req.params.id));
    if (!school) return res.status(404).json({ error: 'School not found.' });
    const loginId = cleanLoginId(req.body.loginId);
    const name = cleanText(req.body.name, 2, 60);
    if (!loginId || !name) return res.status(400).json({ error: 'Enter a 3-12 character ID and a name.' });
    if (await db.get('SELECT id FROM users WHERE school_id = ? AND login_id = ?', school.id, loginId)) {
      return res.status(409).json({ error: `ID ${loginId} is already used in this school.` });
    }
    // A school has exactly one principal, so the previous one (if any) is deactivated first.
    const old = await db.get("SELECT id FROM users WHERE school_id = ? AND role = 'principal' AND is_active = 1", school.id);
    if (old) {
      await db.run('UPDATE users SET is_active = 0 WHERE id = ?', old.id);
      await db.run('DELETE FROM sessions WHERE user_id = ?', old.id);
    }
    await db.run("INSERT INTO users (school_id, login_id, name, role) VALUES (?, ?, ?, 'principal')", school.id, loginId, name);
    res.status(201).json({ message: `${name} is now the principal. They activate their account with ID ${loginId}.` });
  });

  return router;
};
