// principalRoutes.js — principal adds and removes students and teachers of their school.
const express = require('express');
const { requireRole } = require('../auth');
const { cleanText, cleanLoginId } = require('../validation');

module.exports = function principalRoutes(db) {
  const router = express.Router();
  router.use(requireRole('principal'));

  // GET /api/principal/members — active students and teachers of the principal's school.
  router.get('/members', async (req, res) => {
    res.json(await db.all(`
      SELECT id, login_id AS loginId, name, role, password_hash IS NOT NULL AS activated
      FROM users WHERE school_id = ? AND role IN ('student', 'teacher') AND is_active = 1
      ORDER BY role, login_id`, req.user.school_id));
  });

  // POST /api/principal/members  { loginId, name, role } — add a student or teacher to the roster.
  router.post('/members', async (req, res) => {
    const loginId = cleanLoginId(req.body.loginId);
    const name = cleanText(req.body.name, 2, 60);
    const role = req.body.role;
    if (!loginId) return res.status(400).json({ error: 'ID must be 3-12 letters or digits.' });
    if (!name) return res.status(400).json({ error: 'Name must be 2-60 characters.' });
    if (!['student', 'teacher'].includes(role)) return res.status(400).json({ error: 'Role must be student or teacher.' });

    const taken = await db.get('SELECT id FROM users WHERE school_id = ? AND login_id = ?', req.user.school_id, loginId);
    if (taken) return res.status(409).json({ error: `ID ${loginId} is already used in your school.` });

    await db.run('INSERT INTO users (school_id, login_id, name, role) VALUES (?, ?, ?, ?)', req.user.school_id, loginId, name, role);
    res.status(201).json({ message: `${name} added. They can now activate their account with ID ${loginId}.` });
  });

  // DELETE /api/principal/members/:id — remove a student/teacher who has left.
  router.delete('/members/:id', async (req, res) => {
    const member = await db.get(`SELECT id, name FROM users WHERE id = ? AND school_id = ?
                               AND role IN ('student', 'teacher') AND is_active = 1`, Number(req.params.id), req.user.school_id);
    if (!member) return res.status(404).json({ error: 'Member not found in your school.' });
    await db.run('UPDATE users SET is_active = 0 WHERE id = ?', member.id);
    await db.run('DELETE FROM sessions WHERE user_id = ?', member.id);
    res.json({ message: `${member.name} removed.` });
  });

  return router;
};
