// authRoutes.js — account activation, login, logout and "who am I?".
const express = require('express');
const {
  SESSION_COOKIE, SESSION_HOURS, hashPassword, verifyPassword, createSession, parseCookies, publicUser,
} = require('../auth');
const { passwordProblem, cleanLoginId } = require('../validation');

module.exports = function authRoutes(db) {
  const router = express.Router();

  // Finds a user by school + ID. An empty school means the service provider (admin), who has no school.
  async function findUser(schoolId, loginId) {
    if (schoolId) {
      return db.get(`SELECT u.*, s.name AS school_name, s.is_active AS school_active
                         FROM users u JOIN schools s ON s.id = u.school_id
                         WHERE u.school_id = ? AND u.login_id = ?`, schoolId, loginId);
    }
    return db.get("SELECT *, 1 AS school_active FROM users WHERE school_id IS NULL AND login_id = ?", loginId);
  }

  // GET /api/auth/schools — list of active schools for the login drop-down (no login needed).
  router.get('/schools', async (req, res) => {
    res.json(await db.all('SELECT id, name, city AS area FROM schools WHERE is_active = 1 ORDER BY name'));
  });

  // POST /api/auth/activate — a student/teacher whose ID was added by the principal sets a password.
  router.post('/activate', async (req, res) => {
    const schoolId = Number(req.body.schoolId);
    const loginId = cleanLoginId(req.body.loginId);
    if (!schoolId || !loginId) return res.status(400).json({ error: 'Choose your school and enter your school ID.' });

    const problem = passwordProblem(req.body.password);
    if (problem) return res.status(400).json({ error: problem });

    const user = await findUser(schoolId, loginId);
    if (!user || !user.is_active || !user.school_active) {
      return res.status(404).json({ error: 'This ID has not been added by your school. Please ask your principal.' });
    }
    if (user.password_hash) return res.status(409).json({ error: 'This account is already activated. Please log in.' });

    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(req.body.password), user.id);
    res.status(201).json({ message: 'Account activated. You can now log in.' });
  });

  // POST /api/auth/login — checks the password and, if correct, gives the browser a session cookie.
  router.post('/login', async (req, res) => {
    const loginId = cleanLoginId(req.body.loginId);
    const user = loginId ? await findUser(Number(req.body.schoolId) || null, loginId) : null;
    // Same message for unknown ID and wrong password, so IDs cannot be guessed.
    if (!user || !user.is_active || !user.school_active || !verifyPassword(req.body.password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect school, ID or password.' });
    }
    const token = await createSession(db, user.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
    });
    res.json({ user: publicUser(user) });
  });

  // POST /api/auth/logout — deletes the session so the cookie stops working.
  router.post('/logout', async (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await db.run('DELETE FROM sessions WHERE token = ?', token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ message: 'Logged out.' });
  });

  // GET /api/auth/me — tells the page who is logged in (or null), used when the page first loads.
  router.get('/me', async (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  return router;
};
