const http = require("http");
const fs = require("fs");
const path = require("path");
const argon2 = require("argon2");
const { inspectRepo, listUserRepos } = require("./src/github");
const { analyzePeople, writeBriefing } = require("./src/groq");
const { scorePeople } = require("./src/score");
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
  removeUserProject,
} = require("./src/repos");
const { personCode, displayNameFor, validNickname, accountView, deleteAccount } = require("./src/account");
const { oauthReady, authorizeUrl, takeState, githubIdentity } = require("./src/oauth");

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

function send(response, status, body, type, extraHeaders) {
  response.writeHead(status, { "Content-Type": type, ...(extraHeaders || {}) });
  response.end(body);
}

function sendJson(response, status, payload, extraHeaders) {
  send(response, status, JSON.stringify(payload), "application/json; charset=utf-8", extraHeaders);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("요청이 너무 큽니다."));
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
  return JSON.parse(await readBody(request) || "{}");
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

function clearSessionCookie() {
  return "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
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

function passwordFailure(response, result) {
  if (result === "locked") {
    sendJson(response, 429, { ok: false, failureReason: "시도가 너무 많아 15분 동안 할 수 없습니다." });
  } else {
    sendJson(response, 401, { ok: false, failureReason: "지금 비밀번호가 맞지 않습니다." });
  }
}

function freshAccount(userId) {
  return accountView(db.prepare(`
    SELECT id, username, nickname, account_public, created_at, github_login FROM users WHERE id = ?
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
    name: displayNameFor(row.login, accounts.get(row.login.toLowerCase())),
    total: row.total,
    projects: row.projects,
  }));
}

async function judgeRepo(url) {
  const inspected = await inspectRepo(url);
  if (!inspected.ok) {
    const previous = inspected.repoUrl ? markRepoFailure(db, inspected.repoUrl, inspected.failureReason) : null;
    return { ok: false, failureReason: inspected.failureReason, previous };
  }
  const analysis = await analyzePeople(inspected.contributions);
  const people = scorePeople(inspected.contributions, analysis);
  const briefing = await writeBriefing({
    ...inspected,
    peopleWork: people
      .filter((row) => row.detail.workSource === "code")
      .map((row) => ({ person: row.author, work: row.work })),
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
  return {
    ok: true,
    repo,
    briefingSource: briefing.briefingSource,
    analyzedPeople: Object.keys(analysis).length,
  };
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
  const secure = Boolean(request.socket.encrypted);
  const needUser = () => {
    if (user) return true;
    sendJson(response, 401, { ok: false, failureReason: "로그인이 필요합니다." });
    return false;
  };

  try {
    if (request.method === "GET" && url.pathname === "/api/me") {
      sendJson(response, 200, { user: user ? accountView(user) : null });
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
        if (!validNickname(nickname)) {
          sendJson(response, 400, {
            ok: false,
            failureReason: "닉네임은 2~20자이고, 특수문자 < > \" ' & # 는 쓸 수 없습니다.",
          });
          return;
        }
        const taken = db.prepare("SELECT id FROM users WHERE lower(nickname) = lower(?) AND id != ?").get(nickname, user.id);
        if (taken) {
          sendJson(response, 409, { ok: false, failureReason: "이미 쓰는 닉네임입니다." });
          return;
        }
        db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(nickname, user.id);
        sendJson(response, 200, { ok: true, user: freshAccount(user.id) });
        return;
      }

      if (url.pathname === "/api/account/visibility") {
        db.prepare("UPDATE users SET account_public = ? WHERE id = ?").run(payload.accountPublic ? 1 : 0, user.id);
        sendJson(response, 200, { ok: true, user: freshAccount(user.id) });
        return;
      }

      if (url.pathname === "/api/account/github/disconnect") {
        db.prepare("UPDATE users SET github_login = NULL, github_id = NULL WHERE id = ?").run(user.id);
        sendJson(response, 200, { ok: true, user: freshAccount(user.id) });
        return;
      }

      if (url.pathname === "/api/account/password") {
        const next = String(payload.newPassword || "");
        if (next.length < 8) {
          sendJson(response, 400, { ok: false, failureReason: "새 비밀번호는 8자 이상이어야 합니다." });
          return;
        }
        const checked = await verifyPassword(user, payload.currentPassword);
        if (checked !== "ok") return passwordFailure(response, checked);
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(next), user.id);
        db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(user.id, sessionIdFromRequest(request));
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/account/delete") {
        const checked = await verifyPassword(user, payload.password);
        if (checked !== "ok") return passwordFailure(response, checked);
        deleteAccount(db, user.id);
        sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
        return;
      }
    }

    if (request.method === "POST" && url.pathname === "/api/register") {
      const payload = await readJson(request);
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || "");
      if (!validUsername(username)) {
        sendJson(response, 400, { ok: false, failureReason: "아이디는 영문, 숫자, 밑줄 3자 이상이어야 합니다." });
        return;
      }
      if (password.length < 8) {
        sendJson(response, 400, { ok: false, failureReason: "비밀번호는 8자 이상이어야 합니다." });
        return;
      }
      if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
        sendJson(response, 409, { ok: false, failureReason: "이미 있는 아이디입니다." });
        return;
      }
      const nicknameTaken = db.prepare("SELECT id FROM users WHERE lower(nickname) = lower(?)").get(username);
      const info = db.prepare(`
        INSERT INTO users (username, password_hash, created_at, nickname, account_public)
        VALUES (?, ?, ?, ?, 0)
      `).run(username, await hashPassword(password), new Date().toISOString(), username);
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
      if (locked(username)) {
        sendJson(response, 429, { ok: false, failureReason: "시도가 너무 많아 15분 동안 로그인할 수 없습니다." });
        return;
      }
      const row = db.prepare("SELECT id, password_hash FROM users WHERE username = ?").get(username);
      const matches = row ? await argon2.verify(row.password_hash, password) : false;
      if (!matches) {
        recordFailure(username);
        sendJson(response, 401, { ok: false, failureReason: "아이디 또는 비밀번호가 맞지 않습니다." });
        return;
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
      sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/judge") {
      const payload = await readJson(request);
      const judged = await judgeRepo(payload.url);
      if (!judged.ok) {
        sendJson(response, 200, { ok: false, status: "실패", failureReason: judged.failureReason });
        return;
      }
      sendJson(response, 200, {
        ...judged.repo,
        ok: true,
        briefingSource: judged.briefingSource,
        analyzedPeople: judged.analyzedPeople,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/ranking") {
      const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const people = rankedPeople()
        .filter((person) => !query || person.name.toLowerCase().includes(query))
        .slice(0, 100)
        .map(({ login, ...person }) => person);
      sendJson(response, 200, { people });
      return;
    }

    const personMatch = url.pathname.match(/^\/api\/ranking\/([0-9a-f]{16})$/);
    if (request.method === "GET" && personMatch) {
      const person = rankedPeople().find((row) => row.code === personMatch[1]);
      if (!person) {
        sendJson(response, 404, { ok: false, failureReason: "정보 없음" });
        return;
      }
      const { login, ...shown } = person;
      sendJson(response, 200, { person: shown, projects: personProjects(db, login) });
      return;
    }

    if (url.pathname === "/api/my/projects" || url.pathname.startsWith("/api/my/projects/")) {
      if (!needUser()) return;
      if (!user.github_login) {
        sendJson(response, 409, { ok: false, failureReason: "먼저 관리 > 설정에서 GitHub를 연결해 주세요." });
        return;
      }

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
        const judged = await judgeRepo(payload.url);
        if (!judged.ok) {
          sendJson(response, 200, { ok: false, failureReason: judged.failureReason });
          return;
        }
        if (!myRow(db, judged.repo.id, user.github_login)) {
          sendJson(response, 200, {
            ok: false,
            failureReason: `${judged.repo.name}의 기여자 중에 ${user.github_login}이(가) 없어서 추가하지 않았습니다.`,
          });
          return;
        }
        addUserProject(db, user.id, judged.repo.id);
        sendJson(response, 200, { ok: true, project: myProjectView(user.id, user.github_login, judged.repo.id) });
        return;
      }

      const rejudgeMatch = url.pathname.match(/^\/api\/my\/projects\/(\d+)\/rejudge$/);
      if (request.method === "POST" && rejudgeMatch) {
        const repoId = Number(rejudgeMatch[1]);
        if (!ownsProject(db, user.id, repoId)) {
          sendJson(response, 404, { ok: false, failureReason: "프로젝트를 찾지 못했습니다." });
          return;
        }
        const repo = db.prepare("SELECT repo_url FROM repos WHERE id = ?").get(repoId);
        const judged = await judgeRepo(repo.repo_url);
        sendJson(response, 200, {
          ok: judged.ok,
          failureReason: judged.ok ? null : judged.failureReason,
          project: myProjectView(user.id, user.github_login, repoId),
        });
        return;
      }

      const removeMatch = url.pathname.match(/^\/api\/my\/projects\/(\d+)$/);
      if (request.method === "DELETE" && removeMatch) {
        const removed = removeUserProject(db, user.id, Number(removeMatch[1]));
        sendJson(response, removed ? 200 : 404, removed ? { ok: true } : { ok: false, failureReason: "프로젝트를 찾지 못했습니다." });
        return;
      }
    }
  } catch (error) {
    sendJson(response, 400, { ok: false, failureReason: error.message || "요청을 처리하지 못했습니다." });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { ok: false, failureReason: "없는 주소입니다." });
    return;
  }
  if (request.method !== "GET") {
    send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
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
