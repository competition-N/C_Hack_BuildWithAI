const crypto = require("crypto");
const argon2 = require("argon2");

const failures = new Map();

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

function locked(username) {
  const entry = failures.get(username);
  if (!entry) return false;
  if (entry.until > Date.now()) return true;
  failures.delete(username);
  return false;
}

function recordFailure(username) {
  const entry = failures.get(username) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= 5) entry.until = Date.now() + 15 * 60 * 1000;
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
    SELECT users.id, users.username, users.nickname, users.account_public, users.created_at, users.github_login
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
