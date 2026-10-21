const http = require("http");
const fs = require("fs");
const path = require("path");
const argon2 = require("argon2");
const { parseRepoUrl, inspectRepo, listUserRepos } = require("./src/github");
const { analyzePeople, writeBriefing } = require("./src/groq");
const { scorePeople } = require("./src/score");
const { commitAnalysisReader, saveCommitAnalysis } = require("./src/commits");
const { openDatabase } = require("./src/db");
const {
  normalizeUsername,
  validUsername,
  hashPassword,
  locked,
  recordFailure,
  clearFailures,
  createSession,
  sessionIdFromRequest,
  userFromRequest,
} = require("./src/auth");
const {
  saveRepo,
  markRepoFailure,
  rankingRows,
  personProjects,
  myRow,
  userProjects,
  addUserProject,
  ownsProject,
  setProjectShared,
  removeUserProject,
} = require("./src/repos");
const {
  personCode,
  displayNamesFor,
  validNickname,
  validLanguage,
  accountView,
  deleteAccount,
} = require("./src/account");
const { oauthReady, authorizeUrl, takeState, githubIdentity } = require("./src/oauth");
const { langOf, message } = require("./src/messages");

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET가 없으면 서버를 시작하지 않습니다.");
}
const db = openDatabase();
const publicDir = path.join(__dirname, "public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const HTTPS_SITE = /^https:\/\//i.test(process.env.PUBLIC_URL || "");
const JUDGES_PER_HOUR = Number(process.env.JUDGE_LIMIT_PER_HOUR) || 3;
const HOUR_MS = 60 * 60 * 1000;
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  ...(HTTPS_SITE ? { "Strict-Transport-Security": "max-age=15552000" } : {}),
};

function send(response, status, body, type, extraHeaders) {
  response.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": type, ...(extraHeaders || {}) });
  response.end(body);
}

function sendJson(response, status, payload, extraHeaders) {
  send(response, status, JSON.stringify(payload), "application/json; charset=utf-8", {
    "Cache-Control": "no-store",
    ...(extraHeaders || {}),
  });
}

function redirect(response, location) {
  response.writeHead(302, { ...SECURITY_HEADERS, Location: location });
  response.end();
}

class BadRequest extends Error {}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new BadRequest("body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function readJson(request) {
  try {
    return JSON.parse(await readBody(request) || "{}");
  } catch (error) {
    throw error instanceof BadRequest ? error : new BadRequest("invalid json");
  }
}

function sessionCookie(session, secure) {
  const parts = [
    `sid=${session.id}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Expires=${new Date(session.expires).toUTCString()}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(secure) {
  return `sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

function clientAddress(request) {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return request.socket.remoteAddress || "unknown";
}

const judgeLog = new Map();

function takeJudgeSlot(key) {
  const now = Date.now();
  const recent = (judgeLog.get(key) || []).filter((at) => now - at < HOUR_MS);
  if (recent.length >= JUDGES_PER_HOUR) {
    judgeLog.set(key, recent);
    return { ok: false, minutes: Math.max(1, Math.ceil((HOUR_MS - (now - recent[0])) / 60_000)) };
  }
  recent.push(now);
  judgeLog.set(key, recent);
  return { ok: true, left: JUDGES_PER_HOUR - recent.length };
}

async function verifyPassword(user, password) {
  if (locked(user.username)) return "locked";
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
  const matches = row ? await argon2.verify(row.password_hash, String(password || "")) : false;
  if (!matches) {
    recordFailure(user.username);
    return "wrong";
  }
  clearFailures(user.username);
  return "ok";
}

function freshAccount(userId) {
  return accountView(db.prepare(`
    SELECT id, username, nickname, account_public, created_at, github_login, language FROM users WHERE id = ?
  `).get(userId));
}

function accountsByLogin() {
  const map = new Map();
  for (const row of db.prepare(`
    SELECT github_login, nickname, account_public FROM users WHERE github_login IS NOT NULL
  `).all()) {
    map.set(row.github_login.toLowerCase(), row);
  }
  return map;
}

function rankedPeople() {
  const accounts = accountsByLogin();
  return rankingRows(db).map((row, index) => ({
    rank: index + 1,
    login: row.login,
    code: personCode(row.login),
    name: displayNamesFor(row.login, accounts.get(row.login.toLowerCase())),
    total: row.total,
    projects: row.projects,
  }));
}

function anonymousPeople(contributions, user) {
  const accounts = accountsByLogin();
  const mine = user && user.github_login ? user.github_login.toLowerCase() : null;
  return contributions.map(({ author, ...row }) => {
    const isAgent = Boolean(row.detail && row.detail.isAgent);
    return {
      ...row,
      name: isAgent ? { ko: author, en: author } : displayNamesFor(author, accounts.get(author.toLowerCase())),
      code: isAgent ? null : personCode(author),
      isMe: Boolean(mine && author.toLowerCase() === mine),
    };
  });
}

async function judgeRepo(url) {
  const analysis = commitAnalysisReader(db);
  const inspected = await inspectRepo(url, { isCached: analysis.has });
  if (!inspected.ok) {
    if (inspected.repoUrl) markRepoFailure(db, inspected.repoUrl, inspected.failureCode);
    return { ok: false, failureCode: inspected.failureCode };
  }
  const fresh = await analyzePeople(inspected.contributions, analysis);
  if (fresh.length) {
    saveCommitAnalysis(db, fresh, process.env.GROQ_MODEL);
    for (const row of fresh) analysis.remember(row.sha, row);
  }
  const people = scorePeople(inspected.contributions, analysis);
  const briefing = await writeBriefing({
    ...inspected,
    peopleWork: people
      .filter((row) => row.detail.workSource === "code")
      .map((row) => ({ work: row.work })),
  });
  const repo = saveRepo(db, {
    repoUrl: inspected.repoUrl,
    name: inspected.name,
    people,
    techSummary: briefing.techSummary,
    difficulty: briefing.difficulty,
    algorithms: briefing.algorithms,
    features: briefing.features,
  });
  return { ok: true, repo, briefingSource: briefing.briefingSource, newlyAnalyzed: fresh.length };
}

const REPO_LIST_TTL_MS = 5 * 60 * 1000;
const repoListCache = new Map();

async function githubReposFor(login) {
  const key = login.toLowerCase();
  const cached = repoListCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.repos;
  const repos = await listUserRepos(login);
  repoListCache.set(key, { repos, expires: Date.now() + REPO_LIST_TTL_MS });
  return repos;
}

function myProjectView(userId, login, repoId) {
  return userProjects(db, userId, login).find((project) => project.repoId === repoId) || null;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const user = userFromRequest(db, request);
  const lang = langOf(request);
  const secure = Boolean(request.socket.encrypted) || HTTPS_SITE;
  const fail = (status, key, params, extra) => {
    sendJson(response, status, { ok: false, failureCode: key, failureReason: message(lang, key, params), ...(extra || {}) });
  };
  const needUser = () => {
    if (user) return true;
    fail(401, "loginRequired");
    return false;
  };
  const judgeSlot = (repoUrl) => {
    if (!parseRepoUrl(repoUrl)) {
      fail(400, "repoUrlFormat");
      return null;
    }
    const slot = takeJudgeSlot(user ? `user:${user.id}` : `ip:${clientAddress(request)}`);
    if (!slot.ok) {
      fail(429, "tooManyJudges", { limit: JUDGES_PER_HOUR, minutes: slot.minutes });
      return null;
    }
    return slot;
  };

  try {
    if (request.method === "GET" && url.pathname === "/api/me") {
      sendJson(response, 200, { user: user ? accountView(user) : null, judgesPerHour: JUDGES_PER_HOUR });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/github/connect") {
      if (!user) return redirect(response, "/?github=login");
      if (!oauthReady()) return redirect(response, "/?github=config");
      return redirect(response, authorizeUrl(user.id));
    }

    if (request.method === "GET" && url.pathname === "/api/github/callback") {
      if (url.searchParams.get("error")) return redirect(response, "/?github=denied");
      if (!user || !takeState(url.searchParams.get("state"), user.id)) return redirect(response, "/?github=error");
      const identity = await githubIdentity(url.searchParams.get("code"));
      if (!identity) return redirect(response, "/?github=error");
      const taken = db.prepare("SELECT id FROM users WHERE github_id = ? AND id != ?").get(identity.id, user.id);
      if (taken) return redirect(response, "/?github=taken");
      db.prepare("UPDATE users SET github_login = ?, github_id = ? WHERE id = ?").run(identity.login, identity.id, user.id);
      return redirect(response, "/?github=linked");
    }

    if (url.pathname.startsWith("/api/account/") && request.method === "POST") {
      if (!needUser()) return;
      const payload = await readJson(request);

      if (url.pathname === "/api/account/nickname") {
        const nickname = String(payload.nickname || "").trim();
        if (!validNickname(nickname)) return fail(400, "nicknameRule");
        const taken = db.prepare("SELECT id FROM users WHERE lower(nickname) = lower(?) AND id != ?").get(nickname, user.id);
        if (taken) return fail(409, "nicknameTaken");
        db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(nickname, user.id);
        sendJson(response, 200, { ok: true, user: freshAccount(user.id) });
        return;
      }

      if (url.pathname === "/api/account/visibility") {
        db.prepare("UPDATE users SET account_public = ? WHERE id = ?").run(payload.accountPublic ? 1 : 0, user.id);
        sendJson(response, 200, { ok: true, user: freshAccount(user.id) });
        return;
      }

      if (url.pathname === "/api/account/language") {
        if (!validLanguage(payload.language)) return fail(400, "languageRule");
        db.prepare("UPDATE users SET language = ? WHERE id = ?").run(payload.language, user.id);
        sendJson(response, 200, { ok: true, user: freshAccount(user.id) });
        return;
      }

      if (url.pathname === "/api/account/github/disconnect") {
        db.prepare("UPDATE users SET github_login = NULL, github_id = NULL WHERE id = ?").run(user.id);
        sendJson(response, 200, { ok: true, user: freshAccount(user.id) });
        return;
      }

      if (url.pathname === "/api/account/password") {
        if (String(payload.newPassword || "").length < 8) return fail(400, "passwordRule");
        const checked = await verifyPassword(user, payload.currentPassword);
        if (checked === "locked") return fail(429, "actionLocked");
        if (checked !== "ok") return fail(401, "currentPasswordWrong");
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(String(payload.newPassword)), user.id);
        db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(user.id, sessionIdFromRequest(request));
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/account/delete") {
        const checked = await verifyPassword(user, payload.password);
        if (checked === "locked") return fail(429, "actionLocked");
        if (checked !== "ok") return fail(401, "currentPasswordWrong");
        deleteAccount(db, user.id);
        sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(secure) });
        return;
      }
    }

    if (request.method === "POST" && url.pathname === "/api/register") {
      const payload = await readJson(request);
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || "");
      if (!validUsername(username)) return fail(400, "usernameRule");
      if (password.length < 8) return fail(400, "passwordRule");
      if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) return fail(409, "usernameTaken");
      const nicknameTaken = db.prepare("SELECT id FROM users WHERE lower(nickname) = lower(?)").get(username);
      const language = validLanguage(payload.language) ? payload.language : lang;
      const info = db.prepare(`
        INSERT INTO users (username, password_hash, created_at, nickname, account_public, language)
        VALUES (?, ?, ?, ?, 0, ?)
      `).run(username, await hashPassword(password), new Date().toISOString(), username, language);
      if (nicknameTaken) {
        db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(`${username}_${info.lastInsertRowid}`, info.lastInsertRowid);
      }
      const session = createSession(db, info.lastInsertRowid);
      sendJson(response, 200, { ok: true, user: freshAccount(info.lastInsertRowid) }, {
        "Set-Cookie": sessionCookie(session, secure),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/login") {
      const payload = await readJson(request);
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || "");
      if (locked(username)) return fail(429, "loginLocked");
      const row = db.prepare("SELECT id, password_hash FROM users WHERE username = ?").get(username);
      const matches = row ? await argon2.verify(row.password_hash, password) : false;
      if (!matches) {
        recordFailure(username);
        return fail(401, "loginFailed");
      }
      clearFailures(username);
      const session = createSession(db, row.id);
      sendJson(response, 200, { ok: true, user: freshAccount(row.id) }, {
        "Set-Cookie": sessionCookie(session, secure),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/logout") {
      const sid = sessionIdFromRequest(request);
      if (sid) db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
      sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(secure) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/judge") {
      const payload = await readJson(request);
      const slot = judgeSlot(payload.url);
      if (!slot) return;
      const judged = await judgeRepo(payload.url);
      if (!judged.ok) return fail(200, judged.failureCode, {}, { judgesLeft: slot.left });
      sendJson(response, 200, {
        ...judged.repo,
        contributions: anonymousPeople(judged.repo.contributions, user),
        ok: true,
        briefingSource: judged.briefingSource,
        newlyAnalyzed: judged.newlyAnalyzed,
        judgesLeft: slot.left,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ranking") {
      const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const people = rankedPeople()
        .filter((person) => !query || person.name.ko.toLowerCase().includes(query) || person.name.en.toLowerCase().includes(query))
        .slice(0, 100)
        .map(({ login, ...person }) => person);
      sendJson(response, 200, { people });
      return;
    }

    const personMatch = url.pathname.match(/^\/api\/ranking\/([0-9a-f]{16})$/);
    if (request.method === "GET" && personMatch) {
      const person = rankedPeople().find((row) => row.code === personMatch[1]);
      if (!person) return fail(404, "personNotFound");
      const { login, ...shown } = person;
      sendJson(response, 200, { person: shown, projects: personProjects(db, login) });
      return;
    }

    if (url.pathname === "/api/my/projects" || url.pathname.startsWith("/api/my/projects/")) {
      if (!needUser()) return;
      if (!user.github_login) return fail(409, "githubRequired");

      if (request.method === "GET" && url.pathname === "/api/my/projects") {
        sendJson(response, 200, { githubLogin: user.github_login, projects: userProjects(db, user.id, user.github_login) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/my/projects/github-repos") {
        const added = new Set(userProjects(db, user.id, user.github_login).map((project) => project.repoUrl.toLowerCase()));
        const repos = (await githubReposFor(user.github_login)).map((repo) => ({
          ...repo,
          added: added.has(repo.url.toLowerCase()),
        }));
        sendJson(response, 200, { repos });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/my/projects") {
        const payload = await readJson(request);
        const slot = judgeSlot(payload.url);
        if (!slot) return;
        const judged = await judgeRepo(payload.url);
        if (!judged.ok) return fail(200, judged.failureCode, {}, { judgesLeft: slot.left });
        if (!myRow(db, judged.repo.id, user.github_login)) {
          return fail(200, "notContributor", { repo: judged.repo.name, login: user.github_login }, { judgesLeft: slot.left });
        }
        addUserProject(db, user.id, judged.repo.id);
        sendJson(response, 200, {
          ok: true,
          project: myProjectView(user.id, user.github_login, judged.repo.id),
          judgesLeft: slot.left,
        });
        return;
      }

      const rejudgeMatch = url.pathname.match(/^\/api\/my\/projects\/(\d+)\/rejudge$/);
      if (request.method === "POST" && rejudgeMatch) {
        const repoId = Number(rejudgeMatch[1]);
        if (!ownsProject(db, user.id, repoId)) return fail(404, "projectNotFound");
        const repo = db.prepare("SELECT repo_url FROM repos WHERE id = ?").get(repoId);
        const slot = judgeSlot(repo.repo_url);
        if (!slot) return;
        const judged = await judgeRepo(repo.repo_url);
        sendJson(response, 200, {
          ok: judged.ok,
          failureCode: judged.ok ? null : judged.failureCode,
          failureReason: judged.ok ? null : message(lang, judged.failureCode),
          project: myProjectView(user.id, user.github_login, repoId),
          newlyAnalyzed: judged.ok ? judged.newlyAnalyzed : 0,
          judgesLeft: slot.left,
        });
        return;
      }

      const shareMatch = url.pathname.match(/^\/api\/my\/projects\/(\d+)\/share$/);
      if (request.method === "POST" && shareMatch) {
        const repoId = Number(shareMatch[1]);
        const payload = await readJson(request);
        if (!setProjectShared(db, user.id, repoId, Boolean(payload.shared))) return fail(404, "projectNotFound");
        sendJson(response, 200, { ok: true, project: myProjectView(user.id, user.github_login, repoId) });
        return;
      }

      const removeMatch = url.pathname.match(/^\/api\/my\/projects\/(\d+)$/);
      if (request.method === "DELETE" && removeMatch) {
        if (!removeUserProject(db, user.id, Number(removeMatch[1]))) return fail(404, "projectNotFound");
        sendJson(response, 200, { ok: true });
        return;
      }
    }
  } catch (error) {
    if (error instanceof BadRequest) return fail(400, "badRequest");
    console.error(error);
    return fail(500, "serverError");
  }

  if (url.pathname.startsWith("/api/")) return fail(404, "notFound");
  if (request.method !== "GET") {
    send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir + path.sep)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(response, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    send(response, 200, data, types[path.extname(filePath)] || "application/octet-stream");
  });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
