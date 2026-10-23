const crypto = require("crypto");

const STATE_TTL_MS = 10 * 60 * 1000;
const states = new Map();

function oauthReady() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function callbackUrl() {
  const base = (process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/+$/, "");
  return `${base}/api/github/callback`;
}

function authorizeUrl(userId) {
  const now = Date.now();
  for (const [key, entry] of states) {
    if (entry.expires < now) states.delete(key);
  }
  const state = crypto.randomBytes(24).toString("hex");
  states.set(state, { userId, expires: now + STATE_TTL_MS });
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: callbackUrl(),
    state,
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

function takeState(state, userId) {
  const entry = states.get(String(state || ""));
  states.delete(String(state || ""));
  return Boolean(entry && entry.expires > Date.now() && entry.userId === userId);
}

async function githubIdentity(code) {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(),
    }),
  });
  const token = await tokenResponse.json();
  if (!token.access_token) return null;
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "team-contribution",
    },
  });
  if (!userResponse.ok) return null;
  const profile = await userResponse.json();
  return profile && profile.login && profile.id ? { login: profile.login, id: profile.id } : null;
}

module.exports = { oauthReady, callbackUrl, authorizeUrl, takeState, githubIdentity };
