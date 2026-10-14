// authRoutes.js — account activation, login, logout and "who am I?".
// Mounted at /api/auth, so router.post('/login') answers POST /api/auth/login.
const express = require('express');
const {
  SESSION_COOKIE, SESSION_HOURS, hashPassword, verifyPassword, createSession, parseCookies, publicUser,
} = require('../auth');
const { passwordProblem, cleanLoginId } = require('../validation');

module.exports = function authRoutes(db) {
  const router = express.Router();

  // Finds a user by school + ID. An empty school means the service provider (admin), who has no school.
  function findUser(schoolId, loginId) {
    if (schoolId) {
      return db.prepare(`SELECT u.*, s.name AS school_name, s.is_active AS school_active
                         FROM users u JOIN schools s ON s.id = u.school_id
                         WHERE u.school_id = ? AND u.login_id = ?`).get(schoolId, loginId);
    }
    return db.prepare("SELECT *, 1 AS school_active FROM users WHERE school_id IS NULL AND login_id = ?").get(loginId);
  }

  // GET /api/auth/schools — list of active schools for the login drop-down (no login needed).
  router.get('/schools', (req, res) => {
    res.json(db.prepare('SELECT id, name, city AS area FROM schools WHERE is_active = 1 ORDER BY name').all());
  });

  // POST /api/auth/activate — a student/teacher whose ID was added by the principal sets a password.
  router.post('/activate', (req, res) => {
    const schoolId = Number(req.body.schoolId);
    const loginId = cleanLoginId(req.body.loginId);
    if (!schoolId || !loginId) return res.status(400).json({ error: 'Choose your school and enter your school ID.' });

    const problem = passwordProblem(req.body.password);          // check password strength first
    if (problem) return res.status(400).json({ error: problem });

    const user = findUser(schoolId, loginId);
    if (!user || !user.is_active || !user.school_active) {
      return res.status(404).json({ error: 'This ID has not been added by your school. Please ask your principal.' });
    }
    if (user.password_hash) return res.status(409).json({ error: 'This account is already activated. Please log in.' });

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), user.id);
    res.status(201).json({ message: 'Account activated. You can now log in.' });
  });

  // POST /api/auth/login — checks the password and, if correct, gives the browser a session cookie.
  router.post('/login', (req, res) => {
    const loginId = cleanLoginId(req.body.loginId);                  // "s1001" → "S1001"
    const user = loginId ? findUser(Number(req.body.schoolId) || null, loginId) : null;
    // The SAME message is used for "no such ID" and "wrong password", so attackers cannot
    // discover which student IDs exist.
    if (!user || !user.is_active || !user.school_active || !verifyPassword(req.body.password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect school, ID or password.' });
    }
    const token = createSession(db, user.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,                                // JavaScript in the page cannot read the cookie
      sameSite: 'strict',                            // other websites cannot send it (protects against CSRF)
      maxAge: SESSION_HOURS * 60 * 60 * 1000,        // the browser forgets it after 8 hours
    });
    res.json({ user: publicUser(user) });
  });

  // POST /api/auth/logout — deletes the session so the cookie stops working.
  router.post('/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ message: 'Logged out.' });
  });

  // GET /api/auth/me — tells the page who is logged in (or null), used when the page first loads.
  router.get('/me', (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  return router;
};
