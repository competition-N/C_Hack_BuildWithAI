document.documentElement.dataset.js = "ran";

const screen = document.querySelector("#screen");
const topBar = document.querySelector("#top");
const projectName = document.querySelector("#project-name");
const viewButtons = [...document.querySelectorAll(".side [data-view]")];
const tabButtons = [...document.querySelectorAll(".tabs button")];
const navLogin = document.querySelector("#nav-login");
const navManage = document.querySelector("#nav-manage");
const manageToggle = document.querySelector("#manage-toggle");
const manageMenu = document.querySelector("#manage-menu");

let view = "main";
let tab = "all";
let me = null;
let result = null;
let projects = [];
let publicProjects = [];
let ownerPage = null;
let openedId = null;
let manageOpen = false;
let rejudgeMessage = "";
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

viewButtons.forEach((button) => {
  button.addEventListener("click", () => go(button.dataset.view));
});

manageToggle.addEventListener("click", () => {
  manageOpen = !manageOpen;
  syncNav();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tab = button.dataset.tab;
    syncTabs();
    render();
  });
});

async function go(next) {
  view = next;
  openedId = null;
  ownerPage = null;
  if (me && view === "login") view = "projects";
  if (!me && (view === "projects" || view === "account")) view = "login";
  if (view === "projects" || view === "account") manageOpen = true;
  if (view === "projects") await loadProjects();
  if (view === "public") await loadPublic();
  render();
}

function syncNav() {
  navLogin.hidden = Boolean(me);
  navManage.hidden = !me;
  manageToggle.setAttribute("aria-expanded", manageOpen ? "true" : "false");
  manageMenu.hidden = !manageOpen;
  const highlighted = view === "owner" ? "public" : view;
  viewButtons.forEach((button) => {
    if (button.dataset.view === highlighted) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function syncTabs() {
  tabButtons.forEach((item) => {
    item.setAttribute("aria-selected", item.dataset.tab === tab ? "true" : "false");
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function personCell(row) {
  const detail = row.detail || {};
  const agentCommits = detail.agentCommits || row.agentCommits || 0;
  const badges = [
    agentCommits ? `<span class="badge">AI 에이전트 ${agentCommits}건 포함</span>` : "",
    detail.isAgent ? `<span class="badge">AI 에이전트 · 공동 작성자 없음</span>` : "",
  ].join("");
  return `${escapeHtml(row.author)}${badges ? `<div>${badges}</div>` : ""}`;
}

function scoreCell(row) {
  const detail = row.detail;
  if (!detail) return `${row.score}`;
  const formula = detail.difficulty
    ? `작업량 ${detail.workload} × 난이도 ${detail.difficulty}`
    : `작업량 ${detail.workload} · 난이도 분석 안 됨`;
  return `<strong>${row.score}</strong><div class="muted small">${formula}</div>`;
}

function evidenceCell(row) {
  const detail = row.detail;
  if (!detail) return "";
  const lines = [
    `커밋 ${detail.commits}${detail.agentCommits ? ` (AI ${detail.agentCommits})` : ""} · PR ${detail.prsMerged} 합침 / ${detail.prsOpened} 열음`,
    detail.sampledCommits
      ? `최근 커밋 ${detail.sampledCommits}개: 파일 ${detail.filesChanged}개, +${detail.additions} / −${detail.deletions}줄`
      : "코드 변경 표본 없음",
  ];
  if (detail.difficultyReason) lines.push(`난이도 이유: ${escapeHtml(detail.difficultyReason)}`);
  return `<div class="small">${lines.join("<br>")}</div>`;
}

function rankingTable(rows, includeWork) {
  if (!rows || !rows.length) return "<p>기여자 기록이 없습니다.</p>";
  const body = rows.map((row) => `
    <tr>
      <td>${row.rank}</td>
      <td>${personCell(row)}</td>
      <td>${scoreCell(row)}</td>
      ${includeWork ? `<td>${evidenceCell(row)}</td>` : ""}
      ${includeWork ? `<td>
        <ul class="work">${(row.work || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        ${row.detail && row.detail.workSource === "code" ? "<div class='muted small'>코드 변경을 읽고 요약</div>" : "<div class='muted small'>커밋 메시지</div>"}
      </td>` : ""}
    </tr>
  `).join("");
  return `<table>
    <thead><tr><th>순위</th><th>사람</th><th>점수</th>${includeWork ? "<th>근거</th><th>한 일</th>" : ""}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function docs(data) {
  return `
    <section class="panel"><h2>기술 요약</h2><p>${escapeHtml(data.techSummary)}</p></section>
    <section class="panel"><h2>만든 기능</h2><p>${escapeHtml(data.features || "아직 정리되지 않았습니다. 다시 판단하면 나옵니다.")}</p></section>
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
  if (tab === "settings" && data.id && view === "projects") return projectSettings(data);
  return `<p class="muted">${escapeHtml(data.status || "완료")}</p>${rankingTable(data.contributions, true)}${docs(data)}`;
}

function projectSettings(project) {
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

function loginForms() {
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
      <span class="muted">${escapeHtml(project.status)}${project.shared ? " · 공유 중" : ""}</span>
    </li>
  `).join("");
  const opened = openedId ? projects.find((project) => project.id === openedId) : null;
  const action = opened
    ? `
      <div class="row-actions">
        <button type="button" id="rejudge" class="primary">재판단하기</button>
        <button type="button" id="close-project">닫기</button>
        <span id="rejudge-status" class="muted" role="status">${escapeHtml(rejudgeMessage)}</span>
      </div>
      <p class="muted small">${escapeHtml(opened.repoUrl)}을 다시 판단합니다. 실패하면 이전 결과는 그대로 남습니다.</p>
    `
    : `<h3>추가하기</h3>${judgeForm("projects-judge-form")}`;
  return `
    <h2>프로젝트 관리</h2>
    ${projects.length ? `<ul class="projects">${rows}</ul>` : "<p>목록이 비어 있습니다. 아래에서 추가하세요.</p>"}
    ${action}
    <div id="opened">${opened ? resultBody(opened) : ""}</div>
  `;
}

function accountSettings() {
  const shownName = me.accountPublic ? me.nickname : me.tempNickname;
  return `
    <h2>계정 설정</h2>
    <p id="account-message" class="muted" role="status"></p>
    <section class="panel">
      <h3>닉네임</h3>
      <p>지금 다른 사람에게 보이는 이름: <strong>${escapeHtml(shownName)}</strong></p>
      <form class="stack" id="nickname-form">
        <input name="nickname" required minlength="2" maxlength="20" value="${escapeHtml(me.nickname)}" aria-label="닉네임">
        <button type="submit">닉네임 변경</button>
      </form>
    </section>
    <section class="panel">
      <h3>계정 공개</h3>
      <p>지금: <strong>${me.accountPublic ? "켜짐" : "꺼짐"}</strong></p>
      <p class="muted">켜면 공개 프로젝트에 닉네임 "${escapeHtml(me.nickname)}"(으)로 보입니다. 끄면 임시 닉네임 "${escapeHtml(me.tempNickname)}"(으)로 보입니다.</p>
      <button type="button" id="visibility">${me.accountPublic ? "계정 공개 끄기" : "계정 공개 켜기"}</button>
    </section>
    <section class="panel">
      <h3>비밀번호 변경</h3>
      <form class="stack" id="password-form">
        <input name="currentPassword" type="password" required placeholder="지금 비밀번호" aria-label="지금 비밀번호">
        <input name="newPassword" type="password" required minlength="8" placeholder="새 비밀번호 8자 이상" aria-label="새 비밀번호">
        <button type="submit">비밀번호 변경</button>
      </form>
    </section>
    <section class="panel">
      <h3>계정 삭제</h3>
      <p class="muted">계정과 등록한 프로젝트가 모두 지워집니다. 되돌릴 수 없습니다.</p>
      <form class="stack" id="delete-form">
        <input name="password" type="password" required placeholder="비밀번호 확인" aria-label="계정 삭제 비밀번호 확인">
        <button type="submit" class="danger">계정 삭제</button>
      </form>
    </section>
    <section class="panel">
      <button type="button" id="logout">로그아웃</button>
    </section>
  `;
}

function ownerButton(owner) {
  return `<button type="button" class="link" data-owner="${escapeHtml(owner.code)}">${escapeHtml(owner.name)}</button>`;
}

function publicList() {
  if (!publicProjects.length) return "<h2>공개 프로젝트</h2><p>정보 없음</p>";
  return `<h2>공개 프로젝트</h2>${publicProjects.map((project) => `
    <article class="panel">
      <h3>${escapeHtml(project.name)}</h3>
      <p class="muted">등록한 사람: ${ownerButton(project.owner)}</p>
      <p>${escapeHtml(project.techSummary)}</p>
      ${rankingTable(project.contributions, false)}
    </article>
  `).join("")}`;
}

function ownerList() {
  if (!ownerPage) return `<button type="button" class="link" id="back-public">← 공개 프로젝트</button><p>정보 없음</p>`;
  return `
    <button type="button" class="link" id="back-public">← 공개 프로젝트</button>
    <h2>${escapeHtml(ownerPage.owner.name)}의 프로젝트</h2>
    <p class="muted">공유된 프로젝트 ${ownerPage.projects.length}개</p>
    <ul class="owner-projects">
      ${ownerPage.projects.map((project) => `
        <li class="panel">
          <h3>${escapeHtml(project.name)}</h3>
          <p>${escapeHtml(project.techSummary)}</p>
          <p class="muted">기여자 ${project.contributions.length}명 · 1위 ${escapeHtml(project.contributions[0] ? project.contributions[0].author : "없음")}</p>
        </li>
      `).join("")}
    </ul>
  `;
}

function currentProject() {
  if (view === "projects" && openedId) return projects.find((project) => project.id === openedId) || null;
  if (view === "main" && result && result.name) return result;
  return null;
}

function render() {
  syncNav();
  if (serverDown) {
    topBar.hidden = true;
    screen.innerHTML = serverNotice + explanation;
    return;
  }
  const current = currentProject();
  const showChrome = Boolean(current && current.status !== "실패" && current.ok !== false && current.name);
  topBar.hidden = !showChrome;
  if (showChrome) projectName.textContent = current.name;
  tabButtons.forEach((button) => {
    if (button.dataset.tab === "settings") button.hidden = view !== "projects";
  });

  if (view === "public") {
    screen.innerHTML = publicList();
    bindOwnerLinks();
    return;
  }
  if (view === "owner") {
    screen.innerHTML = ownerList();
    document.querySelector("#back-public").addEventListener("click", () => go("public"));
    return;
  }
  if (view === "login") {
    screen.innerHTML = loginForms();
    bindAuth();
    return;
  }
  if (view === "account") {
    screen.innerHTML = accountSettings();
    bindAccount();
    return;
  }
  if (view === "projects") {
    screen.innerHTML = projectList();
    bindJudge("projects-judge-form");
    bindProjectList();
    if (openedId) {
      bindProjectSettings();
      bindRejudge();
    }
    return;
  }

  screen.innerHTML = explanation + judgeForm("judge-form") + resultBody(result);
  bindJudge("judge-form");
}

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return { response, payload };
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
      const { payload } = await api("/api/judge", { method: "POST", body: JSON.stringify({ url }) });
      result = payload;
      if (me) {
        await loadProjects();
        openedId = payload.id || null;
        view = "projects";
        manageOpen = true;
      }
      tab = "all";
      syncTabs();
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
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  const { response, payload } = await api(path, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) {
    document.querySelector("#auth-message").textContent = payload.failureReason || "로그인하지 못했습니다.";
    return;
  }
  me = payload.user;
  manageOpen = true;
  await go("projects");
}

function bindProjectList() {
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openedId = Number(button.dataset.open);
      rejudgeMessage = "";
      tab = "all";
      syncTabs();
      render();
    });
  });
}

function bindRejudge() {
  const rejudge = document.querySelector("#rejudge");
  const close = document.querySelector("#close-project");
  if (!rejudge || !close) return;
  close.addEventListener("click", () => {
    openedId = null;
    rejudgeMessage = "";
    render();
  });
  rejudge.addEventListener("click", async () => {
    const project = projects.find((item) => item.id === openedId);
    if (!project) return;
    rejudge.disabled = true;
    close.disabled = true;
    document.querySelector("#rejudge-status").textContent = "진행중";
    try {
      const { payload } = await api("/api/judge", { method: "POST", body: JSON.stringify({ url: project.repoUrl }) });
      await loadProjects();
      openedId = payload.id || project.id;
      if (payload.status === "실패") rejudgeMessage = `재판단 실패: ${payload.failureReason || "이유를 받지 못했습니다."}`;
      else if (payload.failureReason) rejudgeMessage = `재판단 실패: ${payload.failureReason} 이전 결과를 보여 줍니다.`;
      else rejudgeMessage = "다시 판단했습니다.";
      tab = "all";
      syncTabs();
    } catch {
      serverDown = true;
    } finally {
      render();
    }
  });
}

function bindProjectSettings() {
  const share = document.querySelector("#share");
  const remove = document.querySelector("#remove");
  if (!share || !remove) return;
  share.addEventListener("click", async () => {
    const project = projects.find((item) => item.id === openedId);
    const { payload } = await api(`/api/projects/${openedId}/share`, {
      method: "POST",
      body: JSON.stringify({ shared: !project.shared }),
    });
    if (payload.project) {
      projects = projects.map((item) => (item.id === payload.project.id ? payload.project : item));
      render();
    }
  });
  remove.addEventListener("click", async () => {
    await api(`/api/projects/${openedId}`, { method: "DELETE" });
    openedId = null;
    await loadProjects();
    render();
  });
}

function accountMessage(text, ok) {
  const message = document.querySelector("#account-message");
  if (!message) return;
  message.textContent = text;
  message.className = ok ? "ok" : "fail";
}

function bindAccount() {
  document.querySelector("#nickname-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = new FormData(event.currentTarget).get("nickname");
    const { response, payload } = await api("/api/account/nickname", { method: "POST", body: JSON.stringify({ nickname }) });
    if (!response.ok) return accountMessage(payload.failureReason || "닉네임을 바꾸지 못했습니다.", false);
    me = payload.user;
    render();
    accountMessage("닉네임을 바꿨습니다.", true);
  });

  document.querySelector("#visibility").addEventListener("click", async () => {
    const { response, payload } = await api("/api/account/visibility", {
      method: "POST",
      body: JSON.stringify({ accountPublic: !me.accountPublic }),
    });
    if (!response.ok) return accountMessage(payload.failureReason || "바꾸지 못했습니다.", false);
    me = payload.user;
    render();
    accountMessage(me.accountPublic ? "계정 공개를 켰습니다." : "계정 공개를 껐습니다.", true);
  });

  document.querySelector("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const { response, payload } = await api("/api/account/password", { method: "POST", body: JSON.stringify(body) });
    if (!response.ok) return accountMessage(payload.failureReason || "비밀번호를 바꾸지 못했습니다.", false);
    form.reset();
    accountMessage("비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.", true);
  });

  document.querySelector("#delete-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.confirm("계정과 등록한 프로젝트가 모두 지워집니다. 정말 삭제할까요?")) return;
    const password = new FormData(event.currentTarget).get("password");
    const { response, payload } = await api("/api/account/delete", { method: "POST", body: JSON.stringify({ password }) });
    if (!response.ok) return accountMessage(payload.failureReason || "계정을 삭제하지 못했습니다.", false);
    signedOut();
    await go("main");
  });

  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    signedOut();
    await go("login");
  });
}

function signedOut() {
  me = null;
  projects = [];
  openedId = null;
  manageOpen = false;
}

function bindOwnerLinks() {
  document.querySelectorAll("[data-owner]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { response, payload } = await api(`/api/public/owners/${button.dataset.owner}`);
      view = "owner";
      ownerPage = response.ok ? payload : null;
      render();
    });
  });
}

async function loadProjects() {
  try {
    const { response, payload } = await api("/api/projects");
    projects = response.ok ? payload.projects || [] : [];
  } catch {
    projects = [];
    serverDown = true;
  }
}

async function loadPublic() {
  try {
    const { response, payload } = await api("/api/public");
    publicProjects = response.ok ? payload.projects || [] : [];
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
  manageOpen = Boolean(me);
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
