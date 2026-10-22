const crypto = require("crypto");
const argon2 = require("argon2");

const failures = new Map();
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

function normalizeUsername(username) {
  return String(username || "").trim();
}

function validUsername(username) {
  return /^[A-Za-z0-9_]{3,32}$/.test(username);
}

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });
}

function currentFailures(username) {
  const entry = failures.get(username);
  if (!entry) return null;
  const now = Date.now();
  const lockExpired = entry.until && entry.until <= now;
  const attemptsStale = !entry.until && now - entry.firstAt > LOCK_MS;
  if (lockExpired || attemptsStale) {
    failures.delete(username);
    return null;
  }
  return entry;
}

function locked(username) {
  const entry = currentFailures(username);
  return Boolean(entry && entry.until);
}

function recordFailure(username) {
  const entry = currentFailures(username) || { count: 0, until: 0, firstAt: Date.now() };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.until = Date.now() + LOCK_MS;
  failures.set(username, entry);
}

function clearFailures(username) {
  failures.delete(username);
}

function createSession(db, userId) {
  const id = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expires);
  return { id, expires };
}

function sessionIdFromRequest(request) {
  const header = request.headers.cookie || "";
  const sid = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("sid="));
  return sid ? decodeURIComponent(sid.slice(4)) : null;
}

function userFromRequest(db, request) {
  const id = sessionIdFromRequest(request);
  if (!id) return null;
  const row = db.prepare(`
    SELECT users.id, users.username, users.nickname, users.account_public, users.created_at, users.github_login, users.language
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ?
  `).get(id, new Date().toISOString());
  return row || null;
}

module.exports = {
  normalizeUsername,
  validUsername,
  hashPassword,
  locked,
  recordFailure,
  clearFailures,
  createSession,
  sessionIdFromRequest,
  userFromRequest,
};
