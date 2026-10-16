const http = require("http");
const fs = require("fs");
const path = require("path");
const argon2 = require("argon2");
const { inspectRepo } = require("./src/github");
const { writeBriefing } = require("./src/groq");
const { openDatabase } = require("./src/db");
const {
  normalizeUsername,
  validUsername,
  hashPassword,
  locked,
  recordFailure,
  clearFailures,
  createSession,
  userFromRequest,
} = require("./src/auth");
const {
  saveJudgment,
  listForUser,
  latest,
  listShared,
  setShared,
  removeProject,
} = require("./src/projects");

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
    contributions: (project.contributions || []).map((row) => ({
      author: row.author,
      score: row.score,
      rank: row.rank,
    })),
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const user = userFromRequest(db, request);
  const secure = Boolean(request.socket.encrypted);

  try {
    if (request.method === "GET" && url.pathname === "/api/me") {
      sendJson(response, 200, { user });
      return;
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
      const info = db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
        .run(username, await hashPassword(password), new Date().toISOString());
      const session = createSession(db, info.lastInsertRowid);
      sendJson(response, 200, { ok: true, user: { id: info.lastInsertRowid, username } }, {
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
      sendJson(response, 200, { ok: true, user: { id: row.id, username: row.username } }, {
        "Set-Cookie": sessionCookie(session, secure),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/logout") {
      const header = request.headers.cookie || "";
      const sid = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("sid="));
      if (sid) db.prepare("DELETE FROM sessions WHERE id = ?").run(decodeURIComponent(sid.slice(4)));
      sendJson(response, 200, { ok: true }, {
        "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      });
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
      const briefing = await writeBriefing(inspected);
      const saved = saveJudgment(db, {
        userId: user ? user.id : null,
        result: {
          ok: true,
          repoUrl: inspected.repoUrl,
          name: inspected.name,
          contributions: inspected.contributions,
          techSummary: briefing.techSummary,
          difficulty: briefing.difficulty,
          algorithms: briefing.algorithms,
        },
      });
      sendJson(response, 200, { ...saved, ok: true, briefingSource: briefing.briefingSource });
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
