const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3-multiple-ciphers");

function openDatabase() {
  const key = process.env.SQLCIPHER_KEY;
  if (!key) {
    throw new Error("SQLCIPHER_KEY가 없으면 서버를 시작하지 않습니다.");
  }
  const directory = path.join(__dirname, "..", "data");
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, "app.db");
  const db = new Database(filePath);
  db.pragma("cipher = 'sqlcipher'");
  db.pragma("legacy = 4");
  db.pragma(`key = '${key.replace(/'/g, "''")}'`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      repo_url TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL,
      failure_reason TEXT,
      shared INTEGER NOT NULL DEFAULT 0,
      connection_ok INTEGER NOT NULL DEFAULT 0,
      tech_summary TEXT,
      difficulty TEXT,
      algorithms TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contributions (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      score INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      work TEXT NOT NULL
    );
  `);
  return db;
}

module.exports = { openDatabase };
