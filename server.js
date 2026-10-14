// server.js — starts the app: npm start, then open http://localhost:3000
const config = require('./config');
const { createDb } = require('./src/db');
const { createApp } = require('./src/app');
const { seedDemo } = require('./scripts/seed');
const { localToday } = require('./src/dates');

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const db = await createDb(config);

  // On the very first run the database is empty, so fill it with demo data.
  const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
  if (n === 0) {
    await seedDemo(db, localToday());
    console.log('Empty database: demo data added.');
  }
  await db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());

  createApp(db).listen(PORT, () => {
    console.log(`CAS Activities Finder running at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Could not start. Is MySQL running and are the settings in config.js correct?');
  console.error(err.message);
  process.exit(1);
});
