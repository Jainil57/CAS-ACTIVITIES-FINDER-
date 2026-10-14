// db.js — connects to MySQL, creates the database and tables if needed, and gives simple query helpers.
const mysql = require('mysql2/promise');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS schools (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(80) NOT NULL UNIQUE,
    city       VARCHAR(40) NOT NULL,
    is_active  TINYINT NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    school_id      INT NULL,
    login_id       VARCHAR(12) NOT NULL,
    name           VARCHAR(60) NOT NULL,
    role           ENUM('student', 'teacher', 'principal', 'admin') NOT NULL,
    password_hash  VARCHAR(200) NULL,
    is_active      TINYINT NOT NULL DEFAULT 1,
    UNIQUE (school_id, login_id),
    FOREIGN KEY (school_id) REFERENCES schools(id)
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    title            VARCHAR(80) NOT NULL,
    description      TEXT NOT NULL,
    strand           ENUM('Creativity', 'Activity', 'Service') NOT NULL,
    school_id        INT NOT NULL,
    creator_id       INT NOT NULL,
    interschool      TINYINT NOT NULL DEFAULT 0,
    location         VARCHAR(100) NOT NULL,
    start_date       DATE NOT NULL,
    end_date         DATE NOT NULL,
    apply_deadline   DATE NOT NULL,
    hours            INT NOT NULL,
    fee              INT NOT NULL DEFAULT 0,
    cap_participant  INT NOT NULL,
    cap_volunteer    INT NOT NULL,
    cap_organizer    INT NOT NULL,
    status           ENUM('pending', 'approved', 'rejected', 'ongoing', 'completed') NOT NULL DEFAULT 'pending',
    teacher_comment  VARCHAR(300) NOT NULL DEFAULT '',
    created_at       DATE NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (creator_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    project_id    INT NOT NULL,
    user_id       INT NOT NULL,
    role          ENUM('participant', 'volunteer', 'organizer') NOT NULL,
    status        ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
    requested_at  DATE NOT NULL,
    UNIQUE (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token       CHAR(64) PRIMARY KEY,
    user_id     INT NOT NULL,
    expires_at  BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
];

// Adds get / all / run helpers to a pool or a single connection.
function helpers(conn) {
  return {
    async all(sql, ...params) {
      const [rows] = await conn.query(sql, params);
      return rows;
    },
    async get(sql, ...params) {
      const [rows] = await conn.query(sql, params);
      return rows[0];
    },
    async run(sql, ...params) {
      const [result] = await conn.query(sql, params);
      return { insertId: result.insertId, affectedRows: result.affectedRows };
    },
  };
}

// Creates the database if it is missing, creates the tables, and returns the helpers.
async function createDb(config) {
  const setup = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password });
  await setup.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
  await setup.end();

  // dateStrings keeps DATE columns as "YYYY-MM-DD" text instead of JavaScript Date objects.
  const pool = mysql.createPool({ ...config, dateStrings: true, connectionLimit: 10 });
  for (const sql of SCHEMA) await pool.query(sql);

  return {
    pool,
    ...helpers(pool),
    // Runs `work` inside a transaction: everything is saved together, or nothing is if an error happens.
    async transaction(work) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await work(helpers(conn));
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
    close: () => pool.end(),
  };
}

module.exports = { createDb };
