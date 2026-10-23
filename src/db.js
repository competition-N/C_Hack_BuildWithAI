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
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!userColumns.includes("nickname")) db.exec("ALTER TABLE users ADD COLUMN nickname TEXT");
  if (!userColumns.includes("account_public")) {
    db.exec("ALTER TABLE users ADD COLUMN account_public INTEGER NOT NULL DEFAULT 0");
  }
  db.exec("UPDATE users SET nickname = username WHERE nickname IS NULL");
  const contributionColumns = db.prepare("PRAGMA table_info(contributions)").all().map((column) => column.name);
  if (!contributionColumns.includes("detail")) db.exec("ALTER TABLE contributions ADD COLUMN detail TEXT");
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all().map((column) => column.name);
  if (!projectColumns.includes("features")) db.exec("ALTER TABLE projects ADD COLUMN features TEXT");
  const refreshedUserColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!refreshedUserColumns.includes("github_login")) db.exec("ALTER TABLE users ADD COLUMN github_login TEXT");
  if (!refreshedUserColumns.includes("github_id")) db.exec("ALTER TABLE users ADD COLUMN github_id INTEGER");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_github_id ON users(github_id) WHERE github_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY,
      repo_url TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT,
      status TEXT NOT NULL,
      failure_reason TEXT,
      tech_summary TEXT,
      difficulty TEXT,
      algorithms TEXT,
      features TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repo_people (
      id INTEGER PRIMARY KEY,
      repo_id INTEGER NOT NULL,
      github_login TEXT NOT NULL COLLATE NOCASE,
      score INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      work TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS repo_people_login ON repo_people(github_login);
    CREATE INDEX IF NOT EXISTS repo_people_repo ON repo_people(repo_id);
    CREATE TABLE IF NOT EXISTS user_projects (
      user_id INTEGER NOT NULL,
      repo_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, repo_id)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS commit_analysis (
      sha TEXT PRIMARY KEY,
      github_login TEXT,
      feature_ko TEXT NOT NULL,
      feature_en TEXT NOT NULL,
      tech TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      model TEXT,
      analyzed_at TEXT NOT NULL
    );
  `);
  const commitColumns = db.prepare("PRAGMA table_info(commit_analysis)").all().map((column) => column.name);
  if (!commitColumns.includes("lines")) db.exec("ALTER TABLE commit_analysis ADD COLUMN lines INTEGER");
  if (!commitColumns.includes("doc_only")) db.exec("ALTER TABLE commit_analysis ADD COLUMN doc_only INTEGER");
  const latestUserColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!latestUserColumns.includes("language")) db.exec("ALTER TABLE users ADD COLUMN language TEXT");
  const userProjectColumns = db.prepare("PRAGMA table_info(user_projects)").all().map((column) => column.name);
  if (!userProjectColumns.includes("shared")) {
    db.exec("ALTER TABLE user_projects ADD COLUMN shared INTEGER NOT NULL DEFAULT 1");
  }
  return db;
}

module.exports = { openDatabase };
