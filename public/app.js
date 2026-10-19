document.documentElement.dataset.js = "ran";

const screen = document.querySelector("#screen");
const topBar = document.querySelector("#top");
const projectName = document.querySelector("#project-name");
const navButtons = [...document.querySelectorAll(".side button")];
const tabButtons = [...document.querySelectorAll(".tabs button")];

let view = "main";
let tab = "all";
let me = null;
let result = null;
let projects = [];
let publicProjects = [];
let openedId = null;
let serverDown = false;

const serverNotice = `
  <section class="panel fail">
    <h2>서버에 연결되지 않았습니다</h2>
    <p>이 페이지는 파일로 직접 열면 동작하지 않습니다. 프로젝트 폴더에서 <code>node server.js</code>를 실행한 뒤 <code>http://localhost:3000</code>을 열어 주세요.</p>
  </section>
`;

const explanation = `
  <p class="lede">대학생 팀 프로젝트에서 버스와 무임승차를 가려 내는 시스템입니다. 서로 말한 기여가 아니라, 공개 GitHub 저장소에 남은 커밋과 PR로 사람마다 순위, 세부 점수, 한 일을 보여 줍니다. 그 옆에는 기술 요약, 난이도, 알고리즘을 같이 둡니다.</p>
  <p class="muted">로그인 후 프로젝트를 등록하고 설정에서 공유하면, 로그인하지 않은 사람도 공개 프로젝트에서 볼 수 있습니다.</p>
`;

navButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    view = button.dataset.view;
    openedId = null;
    navButtons.forEach((item) => {
      if (item === button) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    if (view === "login" && me) await loadProjects();
    if (view === "public") await loadPublic();
    render();
  });
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tab = button.dataset.tab;
    tabButtons.forEach((item) => {
      item.setAttribute("aria-selected", item.dataset.tab === tab ? "true" : "false");
    });
    render();
  });
});

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rankingTable(rows, includeWork) {
  if (!rows || !rows.length) return "<p>기여자 기록이 없습니다.</p>";
  const body = rows.map((row) => `
    <tr>
      <td>${row.rank}</td>
      <td>${escapeHtml(row.author)}</td>
      <td>${row.score}</td>
      ${includeWork ? `<td><ul class="work">${(row.work || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></td>` : ""}
    </tr>
  `).join("");
  return `<table>
    <thead><tr><th>순위</th><th>사람</th><th>세부 점수</th>${includeWork ? "<th>한 일</th>" : ""}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function docs(data) {
  return `
    <section class="panel"><h2>기술 요약</h2><p>${escapeHtml(data.techSummary)}</p></section>
    <section class="panel"><h2>난이도</h2><p>${escapeHtml(data.difficulty)}</p></section>
    <section class="panel"><h2>알고리즘</h2><p>${escapeHtml(data.algorithms)}</p></section>
  `;
}

function judgeForm(id) {
  return `
    <form class="judge" id="${id}">
      <input name="url" type="url" required placeholder="https://github.com/소유자/저장소" aria-label="공개 저장소 주소">
      <button type="submit">판단하기</button>
    </form>
  `;
}

function resultBody(data) {
  if (!data) return "";
  if (data.status === "실패" || data.ok === false) {
    return `<section class="panel fail"><h2>실패</h2><p>${escapeHtml(data.failureReason)}</p></section>`;
  }
  if (tab === "score") return rankingTable(data.contributions, true);
  if (tab === "doc") return docs(data);
  if (tab === "settings" && data.id) return settings(data);
  return `<p class="muted">${escapeHtml(data.status || "완료")}</p>${rankingTable(data.contributions, true)}${docs(data)}`;
}

function settings(project) {
  return `
    <section class="panel">
      <h2>설정</h2>
      <p>연동 확인: ${project.connectionOk ? "연결됨" : "연결 안 됨"}</p>
      <p>공개: ${project.shared ? "로그인하지 않은 사람도 봅니다" : "공개 프로젝트에 없습니다"}</p>
      <button type="button" id="share">${project.shared ? "비공개로 전환" : "공유하기"}</button>
      <button type="button" id="remove">삭제</button>
    </section>
  `;
}

function accountForms() {
  return `
    <h2>로그인</h2>
    <form class="stack" id="login-form">
      <input name="username" required placeholder="아이디" aria-label="아이디">
      <input name="password" type="password" required placeholder="비밀번호" aria-label="비밀번호">
      <button type="submit">로그인</button>
    </form>
    <h2>가입</h2>
    <form class="stack" id="register-form">
      <input name="username" required placeholder="아이디" aria-label="가입 아이디">
      <input name="password" type="password" required placeholder="비밀번호 8자 이상" aria-label="가입 비밀번호">
      <button type="submit">가입</button>
    </form>
    <p id="auth-message" class="fail"></p>
  `;
}

function projectList() {
  const rows = projects.map((project) => `
    <li>
      <button type="button" data-open="${project.id}">${escapeHtml(project.name || project.repoUrl)}</button>
      <span class="muted">${escapeHtml(project.status)}</span>
    </li>
  `).join("");
  const opened = openedId ? projects.find((project) => project.id === openedId) : null;
  return `
    <div class="row">
      <h2>${escapeHtml(me.username)}의 프로젝트</h2>
      <button type="button" id="logout">로그아웃</button>
    </div>
    ${projects.length ? `<ul class="projects">${rows}</ul>` : "<p>목록이 비어 있습니다. 아래에서 추가하세요.</p>"}
    <h3>추가하기</h3>
    ${judgeForm("login-judge-form")}
    <div id="opened">${opened ? resultBody(opened) : ""}</div>
  `;
}

function currentProject() {
  if (view === "login" && openedId) return projects.find((project) => project.id === openedId) || null;
  if (view === "main" && result && result.name) return result;
  return null;
}

function render() {
  if (serverDown) {
    topBar.hidden = true;
    screen.innerHTML = serverNotice + explanation;
    return;
  }
  const current = currentProject();
  const showChrome = Boolean(current && current.status !== "실패" && current.ok !== false && current.name);
  topBar.hidden = !showChrome;
  if (showChrome) projectName.textContent = current.name;

  if (view === "public") {
    topBar.hidden = true;
    if (!publicProjects.length) {
      screen.innerHTML = "<h2>공개 프로젝트</h2><p>정보 없음</p>";
      return;
    }
    screen.innerHTML = `<h2>공개 프로젝트</h2>${publicProjects.map((project) => `
      <article class="panel">
        <h3>${escapeHtml(project.name)}</h3>
        <p>${escapeHtml(project.techSummary)}</p>
        ${rankingTable(project.contributions, false)}
      </article>
    `).join("")}`;
    return;
  }

  if (view === "login") {
    if (!me) {
      topBar.hidden = true;
      screen.innerHTML = accountForms();
      bindAuth();
      return;
    }
    screen.innerHTML = projectList();
    bindJudge("login-judge-form");
    bindProjectList();
    if (openedId) bindSettings();
    return;
  }

  screen.innerHTML = explanation + judgeForm("judge-form") + resultBody(result);
  bindJudge("judge-form");
}

function bindJudge(formId) {
  const judge = document.querySelector(`#${formId}`);
  if (!judge) return;
  judge.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = new FormData(judge).get("url");
    const pending = document.createElement("p");
    pending.id = "pending";
    pending.textContent = "진행중";
    screen.appendChild(pending);
    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const saved = await response.json();
      result = saved;
      if (me) {
        await loadProjects();
        openedId = saved.id || null;
        view = "login";
        navButtons.forEach((item) => {
          if (item.dataset.view === "login") item.setAttribute("aria-current", "page");
          else item.removeAttribute("aria-current");
        });
      }
      tab = "all";
      tabButtons.forEach((item) => {
        item.setAttribute("aria-selected", item.dataset.tab === "all" ? "true" : "false");
      });
    } catch {
      serverDown = true;
    } finally {
      render();
    }
  });
}

function bindAuth() {
  document.querySelector("#login-form").addEventListener("submit", (event) => submitAuth(event, "/api/login"));
  document.querySelector("#register-form").addEventListener("submit", (event) => submitAuth(event, "/api/register"));
}

async function submitAuth(event, path) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    document.querySelector("#auth-message").textContent = payload.failureReason || "로그인하지 못했습니다.";
    return;
  }
  me = payload.user;
  await loadProjects();
  render();
}

function bindProjectList() {
  const logout = document.querySelector("#logout");
  if (logout) {
    logout.addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST" });
      me = null;
      projects = [];
      openedId = null;
      render();
    });
  }
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openedId = Number(button.dataset.open);
      tab = "all";
      tabButtons.forEach((item) => {
        item.setAttribute("aria-selected", item.dataset.tab === "all" ? "true" : "false");
      });
      render();
    });
  });
}

function bindSettings() {
  const share = document.querySelector("#share");
  const remove = document.querySelector("#remove");
  if (!share || !remove || !openedId) return;
  share.addEventListener("click", async () => {
    const project = projects.find((item) => item.id === openedId);
    const response = await fetch(`/api/projects/${openedId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shared: !project.shared }),
    });
    const payload = await response.json();
    if (payload.project) {
      projects = projects.map((item) => (item.id === payload.project.id ? payload.project : item));
      render();
    }
  });
  remove.addEventListener("click", async () => {
    await fetch(`/api/projects/${openedId}`, { method: "DELETE" });
    openedId = null;
    await loadProjects();
    render();
  });
}

async function loadProjects() {
  try {
    const response = await fetch("/api/projects");
    if (!response.ok) {
      projects = [];
      return;
    }
    const payload = await response.json();
    projects = payload.projects || [];
  } catch {
    projects = [];
    serverDown = true;
  }
}

async function loadPublic() {
  try {
    const response = await fetch("/api/public");
    if (!response.ok) {
      publicProjects = [];
      return;
    }
    const payload = await response.json();
    publicProjects = payload.projects || [];
  } catch {
    publicProjects = [];
    serverDown = true;
  }
}

async function start() {
  try {
    const meResponse = await fetch("/api/me");
    if (!meResponse.ok) throw new Error("no api");
    me = (await meResponse.json()).user;
  } catch {
    me = null;
    serverDown = true;
    render();
    return;
  }
  try {
    const latestResponse = await fetch("/api/latest");
    if (latestResponse.ok) {
      const latestPayload = await latestResponse.json();
      if (latestPayload.project) {
        result = { ...latestPayload.project, ok: latestPayload.project.status !== "실패" };
      }
    }
  } catch {
    result = null;
  }
  render();
}

start();
