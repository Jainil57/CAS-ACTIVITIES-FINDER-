// auth.js — passwords, login sessions and "who is allowed to do what" (role-based access).
const crypto = require('node:crypto');   // Node's built-in cryptography library

const SESSION_COOKIE = 'cas_session';    // name of the cookie that holds the login token
const SESSION_HOURS = 8;                 // a login lasts one school day, then the user must log in again

// Turns a plain password into "salt:hash" so the real password is never stored.
function hashPassword(password) {
  // A salt is 16 random bytes. Two students with the same password still get different hashes.
  const salt = crypto.randomBytes(16).toString('hex');
  // scrypt is a deliberately slow hashing function, which makes guessing passwords very expensive.
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;              // store both parts together in one text column
}

// Checks a typed password against the stored "salt:hash". Returns true or false.
function verifyPassword(password, stored) {
  if (!stored || typeof password !== 'string') return false;   // account not activated / bad input
  const [salt, hash] = stored.split(':');                       // separate the two stored parts
  const expected = Buffer.from(hash, 'hex');                    // the stored hash as raw bytes
  const actual = crypto.scryptSync(password, salt, 64);         // hash the typed password the same way
  // timingSafeEqual takes the same time whether the first or last byte differs,
  // so an attacker cannot learn anything by measuring how long the check takes.
  return crypto.timingSafeEqual(actual, expected);
}

// Creates a login session for a user and returns its random token.
function createSession(db, userId, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('hex');         // 64 random hex characters — unguessable
  const expiresAt = now + SESSION_HOURS * 60 * 60 * 1000;       // hours → milliseconds
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt);                             // the ? marks are filled in safely
  return token;
}

// Reads the "Cookie" header (e.g. "a=1; cas_session=abc") into an object { a: '1', cas_session: 'abc' }.
function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {              // each cookie is separated by ";"
    const index = part.indexOf('=');                   // find where the name ends
    if (index === -1) continue;                        // skip broken pieces with no "="
    const name = part.slice(0, index).trim();
    cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

// Express "middleware": runs before every request and sets req.user if a valid session cookie is sent.
function loadUser(db) {
  // Finds the logged-in user, but only if the session has not expired, the account is active
  // and (for everyone except the admin) their school has not been removed.
  const findSession = db.prepare(`
    SELECT u.id, u.name, u.role, u.login_id, u.school_id, s.name AS school_name
    FROM sessions se
    JOIN users u ON u.id = se.user_id
    LEFT JOIN schools s ON s.id = u.school_id
    WHERE se.token = ? AND se.expires_at > ? AND u.is_active = 1
      AND (u.school_id IS NULL OR s.is_active = 1)
  `);
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];   // the token from the browser
    req.user = token ? findSession.get(token, Date.now()) || null : null;
    next();                                                          // continue to the actual route
  };
}

// Builds middleware that only lets in logged-in users whose role is in `roles`.
// Example: requireRole('teacher') protects the teacher-only routes.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Your role is not allowed to do this.' });
    }
    next();                                                          // allowed — run the route
  };
}

// The safe subset of user information that is sent to the browser (never the password hash).
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    loginId: user.login_id,
    schoolId: user.school_id,
    schoolName: user.school_name || null,
  };
}

module.exports = {
  SESSION_COOKIE, SESSION_HOURS, hashPassword, verifyPassword, createSession,
  parseCookies, loadUser, requireRole, publicUser,
};
