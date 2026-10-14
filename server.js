// server.js — the starting point. Run it with:  npm start   then open http://localhost:3000
const fs = require('node:fs');
const path = require('node:path');
const { createDb } = require('./src/db');
const { createApp } = require('./src/app');
const { seedDemo } = require('./scripts/seed');
const { localToday } = require('./src/dates');

const PORT = Number(process.env.PORT) || 3000;                         // web address port (3000 by default)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'cas.db');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });              // make sure the data/ folder exists
const db = createDb(DB_FILE);                                          // open (or create) the database file

// On the very first run the database is empty, so fill it with demo schools, users and projects.
if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
  seedDemo(db, localToday());
  console.log('Empty database: demo data added (see README for the demo logins).');
}

// Delete expired login sessions so the table does not grow for ever.
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

createApp(db).listen(PORT, () => {
  console.log(`CAS Activities Finder running at http://localhost:${PORT}`);
});
