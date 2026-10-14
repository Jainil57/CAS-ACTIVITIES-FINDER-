// db.js — opens the SQLite database file and makes sure every table exists.
// SQLite keeps the whole database in ONE file on disk, so data survives when the server restarts.
// `node:sqlite` is built into Node.js (version 22.5 and later), so nothing extra has to be installed.
const { DatabaseSync } = require('node:sqlite');

// The database design (see the ERD in Criterion C). Each CREATE TABLE describes one kind of record.
// "IF NOT EXISTS" means running this again on an existing database does nothing harmful.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS schools (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,   -- unique number given automatically
    name       TEXT    NOT NULL UNIQUE,             -- two schools cannot have the same name
    city       TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1           -- 1 = active, 0 = removed (soft delete)
  );

  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id      INTEGER REFERENCES schools(id),  -- NULL only for the service provider (admin)
    login_id       TEXT    NOT NULL,                -- the school student/staff ID, e.g. "S1001"
    name           TEXT    NOT NULL,
    role           TEXT    NOT NULL CHECK (role IN ('student', 'teacher', 'principal', 'admin')),
    password_hash  TEXT,                            -- NULL until the person activates the account
    is_active      INTEGER NOT NULL DEFAULT 1,
    UNIQUE (school_id, login_id)                    -- an ID can repeat in different schools, not in one
  );

  CREATE TABLE IF NOT EXISTS projects (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT    NOT NULL,
    description      TEXT    NOT NULL,
    strand           TEXT    NOT NULL CHECK (strand IN ('Creativity', 'Activity', 'Service')),
    school_id        INTEGER NOT NULL REFERENCES schools(id),
    creator_id       INTEGER NOT NULL REFERENCES users(id),
    interschool      INTEGER NOT NULL DEFAULT 0,    -- 1 = students of other schools may join
    location         TEXT    NOT NULL,
    start_date       TEXT    NOT NULL,              -- "YYYY-MM-DD"
    end_date         TEXT    NOT NULL,
    apply_deadline   TEXT    NOT NULL,
    hours            INTEGER NOT NULL,              -- CAS hours a member earns
    fee              INTEGER NOT NULL DEFAULT 0,    -- participation fee in rupees (0 = free)
    cap_participant  INTEGER NOT NULL,              -- how many of each role are needed
    cap_volunteer    INTEGER NOT NULL,
    cap_organizer    INTEGER NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'ongoing', 'completed')),
    teacher_comment  TEXT    NOT NULL DEFAULT '',
    created_at       TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memberships (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER NOT NULL REFERENCES projects(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    role          TEXT    NOT NULL CHECK (role IN ('participant', 'volunteer', 'organizer')),
    status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    requested_at  TEXT    NOT NULL,
    UNIQUE (project_id, user_id)                    -- one request per student per project
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT    PRIMARY KEY,                -- long random string stored in the browser cookie
    user_id     INTEGER NOT NULL REFERENCES users(id),
    expires_at  INTEGER NOT NULL                    -- milliseconds since 1970 when the login expires
  );
`;

// Opens (or creates) the database. `filename` is a path such as "data/cas.db",
// or ":memory:" for a temporary database that only lives in RAM (used by the automated tests).
function createDb(filename) {
  const db = new DatabaseSync(filename);   // open the file (SQLite creates it if it is missing)
  db.exec('PRAGMA foreign_keys = ON');     // make SQLite enforce the REFERENCES rules above
  db.exec(SCHEMA);                         // create any tables that do not exist yet
  return db;                               // give the open database back to the caller
}

module.exports = { createDb };
