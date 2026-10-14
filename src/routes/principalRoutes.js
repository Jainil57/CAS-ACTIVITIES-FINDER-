// principalRoutes.js — the principal / Head of CAS adds and removes students and teachers
// of THEIR OWN school (database modification). Mounted at /api/principal.
const express = require('express');
const { requireRole } = require('../auth');
const { cleanText, cleanLoginId } = require('../validation');

module.exports = function principalRoutes(db) {
  const router = express.Router();
  router.use(requireRole('principal'));

  // GET /api/principal/members — active students and teachers of the principal's school.
  router.get('/members', (req, res) => {
    res.json(db.prepare(`
      SELECT id, login_id AS loginId, name, role, password_hash IS NOT NULL AS activated
      FROM users WHERE school_id = ? AND role IN ('student', 'teacher') AND is_active = 1
      ORDER BY role, login_id`).all(req.user.school_id));
  });

  // POST /api/principal/members  { loginId, name, role } — add a student or teacher to the roster.
  router.post('/members', (req, res) => {
    const loginId = cleanLoginId(req.body.loginId);
    const name = cleanText(req.body.name, 2, 60);
    const role = req.body.role;
    if (!loginId) return res.status(400).json({ error: 'ID must be 3-12 letters or digits.' });
    if (!name) return res.status(400).json({ error: 'Name must be 2-60 characters.' });
    if (!['student', 'teacher'].includes(role)) return res.status(400).json({ error: 'Role must be student or teacher.' });

    const taken = db.prepare('SELECT id FROM users WHERE school_id = ? AND login_id = ?').get(req.user.school_id, loginId);
    if (taken) return res.status(409).json({ error: `ID ${loginId} is already used in your school.` });

    db.prepare('INSERT INTO users (school_id, login_id, name, role) VALUES (?, ?, ?, ?)').run(req.user.school_id, loginId, name, role);
    res.status(201).json({ message: `${name} added. They can now activate their account with ID ${loginId}.` });
  });

  // DELETE /api/principal/members/:id — remove a student/teacher who has left.
  // This is a SOFT delete: the row is kept (is_active = 0) so past CAS records stay correct.
  router.delete('/members/:id', (req, res) => {
    const member = db.prepare(`SELECT id, name FROM users WHERE id = ? AND school_id = ?
                               AND role IN ('student', 'teacher') AND is_active = 1`).get(Number(req.params.id), req.user.school_id);
    if (!member) return res.status(404).json({ error: 'Member not found in your school.' });
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(member.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(member.id);   // log them out immediately
    res.json({ message: `${member.name} removed.` });
  });

  return router;
};
