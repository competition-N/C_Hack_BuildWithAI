const http = require("http");
const fs = require("fs");
const path = require("path");
const argon2 = require("argon2");
const { inspectRepo } = require("./src/github");
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
  saveJudgment,
  listForUser,
  latest,
  listShared,
  listSharedByOwner,
  sharedOwners,
  setShared,
  removeProject,
} = require("./src/projects");
const { ownerCode, displayName, validNickname, accountView, deleteAccount } = require("./src/account");

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

function publicView(project) {
  return {
    id: project.id,
    name: project.name,
    repoUrl: project.repoUrl,
    techSummary: project.techSummary,
    owner: {
      code: ownerCode(project.userId, project.ownerCreatedAt),
      name: displayName(project.userId, project.ownerCreatedAt, project.ownerNickname, project.ownerPublic),
    },
    contributions: (project.contributions || []).map((row) => ({
      author: row.author,
      score: row.score,
      rank: row.rank,
      agentCommits: row.detail ? row.detail.agentCommits : 0,
    })),
  };
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
  return accountView(db.prepare("SELECT id, username, nickname, account_public, created_at FROM users WHERE id = ?").get(userId));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const user = userFromRequest(db, request);
  const secure = Boolean(request.socket.encrypted);

  try {
    if (request.method === "GET" && url.pathname === "/api/me") {
      sendJson(response, 200, { user: user ? accountView(user) : null });
      return;
    }

    if (url.pathname.startsWith("/api/account/") && request.method === "POST") {
      if (!user) {
        sendJson(response, 401, { ok: false, failureReason: "로그인이 필요합니다." });
        return;
      }
      const payload = JSON.parse(await readBody(request) || "{}");

      if (url.pathname === "/api/account/nickname") {
        const nickname = String(payload.nickname || "").trim();
        if (!validNickname(nickname)) {
          sendJson(response, 400, {
            ok: false,
            failureReason: "닉네임은 2~20자이고, 특수문자 < > \" ' & 와 '익명-'으로 시작하는 이름은 쓸 수 없습니다.",
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

      if (url.pathname === "/api/account/password") {
        const next = String(payload.newPassword || "");
        if (next.length < 8) {
          sendJson(response, 400, { ok: false, failureReason: "새 비밀번호는 8자 이상이어야 합니다." });
          return;
        }
        const checked = await verifyPassword(user, payload.currentPassword);
        if (checked !== "ok") {
          passwordFailure(response, checked);
          return;
        }
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(next), user.id);
        db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(user.id, sessionIdFromRequest(request));
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/account/delete") {
        const checked = await verifyPassword(user, payload.password);
        if (checked !== "ok") {
          passwordFailure(response, checked);
          return;
        }
        deleteAccount(db, user.id);
        sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
        return;
      }
    }

    if (request.method === "POST" && url.pathname === "/api/register") {
      const payload = JSON.parse(await readBody(request) || "{}");
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
      const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
      if (existing) {
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
      const payload = JSON.parse(await readBody(request) || "{}");
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || "");
      if (locked(username)) {
        sendJson(response, 429, { ok: false, failureReason: "시도가 너무 많아 15분 동안 로그인할 수 없습니다." });
        return;
      }
      const row = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username);
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

    if (request.method === "GET" && url.pathname === "/api/projects") {
      if (!user) {
        sendJson(response, 401, { ok: false, failureReason: "로그인이 필요합니다." });
        return;
      }
      sendJson(response, 200, { projects: listForUser(db, user.id) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/latest") {
      sendJson(response, 200, { project: latest(db, user ? user.id : null) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/public") {
      sendJson(response, 200, { projects: listShared(db).map(publicView) });
      return;
    }

    const ownerMatch = url.pathname.match(/^\/api\/public\/owners\/([0-9a-f]{16})$/);
    if (request.method === "GET" && ownerMatch) {
      const owner = sharedOwners(db).find((row) => ownerCode(row.id, row.created_at) === ownerMatch[1]);
      const projects = owner ? listSharedByOwner(db, owner.id).map(publicView) : [];
      if (!projects.length) {
        sendJson(response, 404, { ok: false, failureReason: "정보 없음" });
        return;
      }
      sendJson(response, 200, { owner: projects[0].owner, projects });
      return;
    }

    const shareMatch = url.pathname.match(/^\/api\/projects\/(\d+)\/share$/);
    if (request.method === "POST" && shareMatch) {
      if (!user) {
        sendJson(response, 401, { ok: false, failureReason: "로그인이 필요합니다." });
        return;
      }
      const payload = JSON.parse(await readBody(request) || "{}");
      const project = setShared(db, Number(shareMatch[1]), user.id, Boolean(payload.shared));
      if (!project) {
        sendJson(response, 404, { ok: false, failureReason: "프로젝트를 찾지 못했습니다." });
        return;
      }
      sendJson(response, 200, { ok: true, project });
      return;
    }

    const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (request.method === "DELETE" && projectMatch) {
      if (!user) {
        sendJson(response, 401, { ok: false, failureReason: "로그인이 필요합니다." });
        return;
      }
      const removed = removeProject(db, Number(projectMatch[1]), user.id);
      if (!removed) {
        sendJson(response, 404, { ok: false, failureReason: "프로젝트를 찾지 못했습니다." });
        return;
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/judge") {
      const payload = JSON.parse(await readBody(request) || "{}");
      const inspected = await inspectRepo(payload.url);
      if (!inspected.ok) {
        const saved = inspected.repoUrl
          ? saveJudgment(db, { userId: user ? user.id : null, result: inspected })
          : null;
        sendJson(response, 200, saved ? { ...saved, ok: saved.status !== "실패", failureReason: saved.failureReason } : inspected);
        return;
      }
      const analysis = await analyzePeople(inspected.contributions.filter((person) => person.samples.length));
      const contributions = scorePeople(inspected.contributions, analysis);
      const briefing = await writeBriefing({
        ...inspected,
        peopleWork: contributions
          .filter((row) => row.detail.workSource === "code")
          .map((row) => ({ person: row.author, work: row.work })),
      });
      const saved = saveJudgment(db, {
        userId: user ? user.id : null,
        result: {
          ok: true,
          repoUrl: inspected.repoUrl,
          name: inspected.name,
          contributions,
          techSummary: briefing.techSummary,
          difficulty: briefing.difficulty,
          algorithms: briefing.algorithms,
          features: briefing.features,
        },
      });
      sendJson(response, 200, {
        ...saved,
        ok: true,
        briefingSource: briefing.briefingSource,
        analyzedPeople: Object.keys(analysis).length,
      });
      return;
    }
  } catch (error) {
    sendJson(response, 400, { ok: false, failureReason: error.message || "요청을 처리하지 못했습니다." });
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
