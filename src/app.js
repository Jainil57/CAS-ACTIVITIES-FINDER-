// app.js — builds the Express web application by plugging all the pieces together.
const path = require('node:path');
const express = require('express');
const { loadUser } = require('./auth');
const { localToday } = require('./dates');

function createApp(db, options = {}) {
  // `today` is a function returning "YYYY-MM-DD". Tests pass a fixed date so results never change.
  const today = options.today || localToday;
  const app = express();

  app.use(express.json({ limit: '50kb' }));
  app.use(loadUser(db));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Each group of API routes lives in its own file (modular design).
  app.use('/api/auth', require('./routes/authRoutes')(db));
  app.use('/api/teacher', require('./routes/teacherRoutes')(db, today));
  app.use('/api/principal', require('./routes/principalRoutes')(db));
  app.use('/api/admin', require('./routes/adminRoutes')(db));
  app.use('/api', require('./routes/projectRoutes')(db, today));

  // Any other /api address does not exist.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Error handler: Express calls this (4 parameters) whenever a route throws an error.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

module.exports = { createApp };
