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
let ranking = [];
let rankingQuery = "";
let personPage = null;
let myProjects = [];
let githubRepos = null;
let repoFilter = "";
let openedRepoId = null;
let manageOpen = false;
let notice = "";
let serverDown = false;

const serverNotice = `
  <section class="panel fail">
    <h2>서버에 연결되지 않았습니다</h2>
    <p>이 페이지는 파일로 직접 열면 동작하지 않습니다. 프로젝트 폴더에서 <code>node server.js</code>를 실행한 뒤 <code>http://localhost:3000</code>을 열어 주세요.</p>
  </section>
`;

const explanation = `
  <p class="lede">대학생 팀 프로젝트에서 버스와 무임승차를 가려 내는 시스템입니다. 공개 GitHub 저장소를 판단하면, 사람마다 한 일을 기능으로 나누고 기능마다 "커밋 수 × 코드 난이도"로 점수를 매겨 더합니다. 기술 요약, 만든 기능, 난이도, 알고리즘도 여기서 봅니다.</p>
  <p class="muted">한 번 판단된 저장소의 기여자는 공개 프로젝트의 기여 순위에 올라갑니다. GitHub를 연결하고 계정 공개를 켠 사람만 닉네임으로, 나머지는 랜덤 닉네임으로 보입니다.</p>
`;

const githubNotices = {
  linked: "GitHub를 연결했습니다.",
  taken: "그 GitHub 계정은 이미 다른 계정에 연결되어 있습니다.",
  denied: "GitHub 연결을 취소했습니다.",
  error: "GitHub 연결에 실패했습니다. 다시 시도해 주세요.",
  config: "서버에 GitHub OAuth 설정(GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)이 없습니다.",
  login: "먼저 로그인해 주세요.",
};

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
  openedRepoId = null;
  personPage = null;
  notice = "";
  if (me && view === "login") view = "projects";
  if (!me && (view === "projects" || view === "account")) view = "login";
  if (view === "projects" || view === "account") manageOpen = true;
  if (view === "projects") await loadMyProjects();
  if (view === "public") await loadRanking();
  render();
  if (view === "projects" && me && me.githubLogin && githubRepos === null) {
    await loadGithubRepos();
    if (view === "projects" && !openedRepoId) render();
  }
}

function syncNav() {
  navLogin.hidden = Boolean(me);
  navManage.hidden = !me;
  manageToggle.setAttribute("aria-expanded", manageOpen ? "true" : "false");
  manageMenu.hidden = !manageOpen;
  const highlighted = view === "person" ? "public" : view;
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
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function noticeLine() {
  return notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : "";
}

function featureList(detail) {
  if (!detail || !detail.features || !detail.features.length) return "<p class='muted small'>기능 기록 없음</p>";
  const items = detail.features.map((feature) => `
    <li>
      ${escapeHtml(feature.name)} <span class="muted">(${escapeHtml(feature.tech)})</span>
      <span class="small">커밋 ${feature.commits} × 난이도 ${feature.difficulty} = <strong>${feature.points}</strong></span>
    </li>
  `).join("");
  return `<ul class="work">${items}</ul>`;
}

function agentBadges(detail) {
  if (!detail) return "";
  const badges = [
    detail.agentCommits ? `<span class="badge">AI 에이전트 ${detail.agentCommits}건 포함</span>` : "",
    detail.isAgent ? `<span class="badge">AI 에이전트 · 공동 작성자 없음</span>` : "",
  ].join("");
  return badges ? `<div>${badges}</div>` : "";
}

function evidence(detail) {
  if (!detail) return "";
  const lines = [
    `커밋 ${detail.commits}${detail.agentCommits ? ` (AI ${detail.agentCommits})` : ""} · PR ${detail.prsMerged} 합침 / ${detail.prsOpened} 열음`,
    detail.analyzedCommits ? `모델이 기능으로 나눈 커밋 ${detail.analyzedCommits}개` : "모델 분석 안 됨",
    detail.sampledCommits
      ? `코드를 읽은 커밋 ${detail.sampledCommits}개: 파일 ${detail.filesChanged}개, +${detail.additions} / −${detail.deletions}줄`
      : "",
  ].filter(Boolean);
  return `<div class="small">${lines.join("<br>")}</div>`;
}

function rankingTable(rows) {
  if (!rows || !rows.length) return "<p>기여자 기록이 없습니다.</p>";
  const body = rows.map((row) => `
    <tr>
      <td>${row.rank}</td>
      <td>${escapeHtml(row.author)}${agentBadges(row.detail)}</td>
      <td><strong>${row.score}</strong></td>
      <td>${featureList(row.detail)}</td>
      <td>${evidence(row.detail)}</td>
    </tr>
  `).join("");
  return `<table>
    <thead><tr><th>순위</th><th>사람</th><th>점수</th><th>기능별 점수</th><th>근거</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <p class="muted small">점수 = 기능마다 (그 기능의 커밋 수 × 코드 난이도 1~5)를 더한 값입니다. PR은 안의 커밋이 이미 점수에 들어가 있어 근거로만 보여 줍니다.</p>`;
}

function docs(data) {
  return `
    <section class="panel"><h2>기술 요약</h2><p>${escapeHtml(data.techSummary)}</p></section>
    <section class="panel"><h2>만든 기능</h2><p>${escapeHtml(data.features || "아직 정리되지 않았습니다.")}</p></section>
    <section class="panel"><h2>난이도</h2><p>${escapeHtml(data.difficulty)}</p></section>
    <section class="panel"><h2>알고리즘</h2><p>${escapeHtml(data.algorithms)}</p></section>
  `;
}

function judgeForm(id, label) {
  return `
    <form class="judge" id="${id}">
      <input name="url" type="url" required placeholder="https://github.com/소유자/저장소" aria-label="공개 저장소 주소">
      <button type="submit">${label}</button>
    </form>
  `;
}

function mainResult() {
  if (!result) return "";
  if (result.ok === false) {
    return `<section class="panel fail"><h2>실패</h2><p>${escapeHtml(result.failureReason)}</p></section>`;
  }
  if (tab === "score") return rankingTable(result.contributions);
  if (tab === "doc") return docs(result);
  return `<p class="muted">완료</p>${rankingTable(result.contributions)}${docs(result)}`;
}

function rankingView() {
  const rows = ranking.map((person) => `
    <tr>
      <td>${person.rank}</td>
      <td><button type="button" class="link" data-person="${escapeHtml(person.code)}">${escapeHtml(person.name)}</button></td>
      <td><strong>${person.total}</strong></td>
      <td>${person.projects}</td>
    </tr>
  `).join("");
  return `
    <h2>기여 순위</h2>
    <p class="muted">판단된 모든 저장소의 점수를 사람별로 더한 순위입니다. 이름을 누르면 그 사람이 한 프로젝트가 나옵니다.</p>
    <form class="judge" id="ranking-search" role="search">
      <input name="q" type="search" value="${escapeHtml(rankingQuery)}" placeholder="닉네임 검색" aria-label="닉네임 검색">
      <button type="submit">검색</button>
    </form>
    ${ranking.length
      ? `<table><thead><tr><th>순위</th><th>닉네임</th><th>총점</th><th>프로젝트</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p>${rankingQuery ? "검색 결과가 없습니다." : "정보 없음"}</p>`}
  `;
}

function personView() {
  if (!personPage) return `<button type="button" class="link" id="back-ranking">← 기여 순위</button><p>정보 없음</p>`;
  const { person, projects } = personPage;
  return `
    <button type="button" class="link" id="back-ranking">← 기여 순위</button>
    <h2>${escapeHtml(person.name)}</h2>
    <p class="muted">전체 ${person.rank}위 · 총점 <strong>${person.total}</strong> · 프로젝트 ${person.projects}개</p>
    <ul class="owner-projects">
      ${projects.map((project) => `
        <li class="panel">
          <h3>${escapeHtml(project.name)} <span class="muted small">${project.score}점 · 저장소 안 ${project.rank}위</span></h3>
          ${featureList(project.detail)}
        </li>
      `).join("")}
    </ul>
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

function githubSection() {
  if (me.githubLogin) {
    return `
      <p>연결됨: <strong>${escapeHtml(me.githubLogin)}</strong></p>
      <button type="button" id="github-disconnect">연결 해제</button>
    `;
  }
  if (!me.oauthReady) {
    return `<p class="fail">서버에 GitHub OAuth 설정이 없어 연결할 수 없습니다. <code>.env</code>에 <code>GITHUB_CLIENT_ID</code>와 <code>GITHUB_CLIENT_SECRET</code>를 넣고 서버를 다시 켜 주세요.</p>`;
  }
  return `
    <p class="muted">연결하면 GitHub가 로그인한 본인의 아이디만 알려 줍니다. 남의 아이디는 연결할 수 없습니다.</p>
    <a class="button-link" href="/api/github/connect">GitHub로 연결</a>
  `;
}

function accountSettings() {
  const shownName = me.githubLogin ? (me.accountPublic ? me.nickname : me.randomNickname) : null;
  return `
    <h2>계정 설정</h2>
    ${noticeLine()}
    <section class="panel">
      <h3>GitHub 연결</h3>
      ${githubSection()}
    </section>
    <section class="panel">
      <h3>닉네임</h3>
      <p>${shownName ? `기여 순위에 보이는 이름: <strong>${escapeHtml(shownName)}</strong>` : "GitHub를 연결하면 기여 순위에 나옵니다."}</p>
      <form class="stack" id="nickname-form">
        <input name="nickname" required minlength="2" maxlength="20" value="${escapeHtml(me.nickname)}" aria-label="닉네임">
        <button type="submit">닉네임 변경</button>
      </form>
    </section>
    <section class="panel">
      <h3>계정 공개</h3>
      <p>지금: <strong>${me.accountPublic ? "켜짐" : "꺼짐"}</strong></p>
      <p class="muted">켜면 기여 순위에 닉네임 "${escapeHtml(me.nickname)}"(으)로 보입니다. 끄면 랜덤 닉네임${me.randomNickname ? ` "${escapeHtml(me.randomNickname)}"` : ""}(으)로 보입니다.</p>
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
      <p class="muted">계정과 프로젝트 관리 목록이 지워집니다. 판단된 저장소의 GitHub 기록은 남고, 순위에는 랜덤 닉네임으로 보입니다.</p>
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

function myProjectCard(project) {
  if (!project.me) return "<p>이 저장소에 내 기록이 없습니다.</p>";
  return `
    <section class="panel">
      <h3>내 점수 <strong>${project.me.score}</strong> <span class="muted small">저장소 안 ${project.me.rank}위 / ${project.peopleCount}명</span></h3>
      ${agentBadges(project.me.detail)}
      ${featureList(project.me.detail)}
      ${evidence(project.me.detail)}
    </section>
    <p class="muted small">기술 요약, 만든 기능, 다른 팀원의 점수는 메인에서 이 저장소를 판단하면 볼 수 있습니다.</p>
  `;
}

const repoSources = { own: "내 저장소", member: "협업자", contributed: "커밋한 저장소" };

function repoPicker() {
  if (githubRepos === null) return "<p class='muted'>GitHub 저장소 목록을 불러오는 중입니다.</p>";
  if (!githubRepos.length) return "<p class='muted'>불러온 공개 저장소가 없습니다. 아래에서 주소로 추가할 수 있습니다.</p>";
  const query = repoFilter.toLowerCase();
  const shown = githubRepos.filter((repo) => !query || repo.fullName.toLowerCase().includes(query)).slice(0, 50);
  const rows = shown.map((repo) => `
    <li>
      <div>
        <strong>${escapeHtml(repo.fullName)}</strong>
        <span class="badge">${repoSources[repo.source] || ""}</span>${repo.fork ? "<span class='badge'>포크</span>" : ""}
        ${repo.description ? `<div class="muted small">${escapeHtml(repo.description)}</div>` : ""}
      </div>
      ${repo.added
        ? "<span class='muted small'>추가됨</span>"
        : `<button type="button" data-add-repo="${escapeHtml(repo.url)}">추가</button>`}
    </li>
  `).join("");
  return `
    <p class="muted small">${escapeHtml(me.githubLogin)}의 공개 저장소와 커밋한 공개 저장소 ${githubRepos.length}개</p>
    <input type="search" id="repo-filter" class="filter" value="${escapeHtml(repoFilter)}" placeholder="저장소 이름으로 찾기" aria-label="저장소 이름으로 찾기">
    ${shown.length ? `<ul class="repo-list">${rows}</ul>` : "<p class='muted'>찾는 저장소가 없습니다.</p>"}
  `;
}

function projectsView() {
  if (!me.githubLogin) {
    return `
      <h2>프로젝트 관리</h2>
      <p>프로젝트 관리는 내 GitHub 아이디의 기여만 모아 봅니다. 먼저 GitHub를 연결해 주세요.</p>
      <button type="button" class="link" id="to-account">관리 > 설정으로 가기</button>
    `;
  }
  const rows = myProjects.map((project) => `
    <li>
      <button type="button" data-open="${project.repoId}">${escapeHtml(project.name)}</button>
      <span class="muted">${project.me ? `${project.me.score}점` : "기록 없음"}${project.failureReason ? " · 마지막 재판단 실패" : ""}</span>
    </li>
  `).join("");
  const opened = myProjects.find((project) => project.repoId === openedRepoId) || null;
  const action = opened
    ? `
      <div class="row-actions">
        <button type="button" id="rejudge" class="primary">재판단하기</button>
        <button type="button" id="remove-project">목록에서 빼기</button>
        <button type="button" id="close-project">닫기</button>
      </div>
      <p class="muted small">${escapeHtml(opened.repoUrl)}</p>
    `
    : `<h3>추가하기</h3>${repoPicker()}
       <details class="manual-add">
         <summary>목록에 없는 저장소는 주소로 추가</summary>
         <p class="muted small">${escapeHtml(me.githubLogin)}이(가) 기여한 공개 저장소만 추가됩니다.</p>
         ${judgeForm("projects-judge-form", "추가하기")}
       </details>`;
  return `
    <h2>프로젝트 관리</h2>
    <p class="muted">${escapeHtml(me.githubLogin)}의 기여</p>
    ${noticeLine()}
    ${myProjects.length ? `<ul class="projects">${rows}</ul>` : "<p>목록이 비어 있습니다.</p>"}
    ${action}
    ${opened ? myProjectCard(opened) : ""}
  `;
}

function render() {
  syncNav();
  if (serverDown) {
    topBar.hidden = true;
    screen.innerHTML = serverNotice + explanation;
    return;
  }
  const showChrome = view === "main" && result && result.ok !== false && result.name;
  topBar.hidden = !showChrome;
  if (showChrome) projectName.textContent = result.name;

  if (view === "public") {
    screen.innerHTML = rankingView();
    bindRanking();
    return;
  }
  if (view === "person") {
    screen.innerHTML = personView();
    document.querySelector("#back-ranking").addEventListener("click", () => go("public"));
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
    screen.innerHTML = projectsView();
    bindProjects();
    return;
  }

  screen.innerHTML = explanation + judgeForm("judge-form", "판단하기") + mainResult();
  bindMainJudge();
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

function pending(text) {
  const line = document.createElement("p");
  line.className = "notice";
  line.textContent = text;
  screen.appendChild(line);
  screen.querySelectorAll("button").forEach((button) => { button.disabled = true; });
}

function bindMainJudge() {
  const form = document.querySelector("#judge-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = new FormData(form).get("url");
    pending("진행중 — 코드를 읽고 기능별로 나눕니다. 팀원이 많으면 1~2분 걸릴 수 있습니다.");
    try {
      const { payload } = await api("/api/judge", { method: "POST", body: JSON.stringify({ url }) });
      result = payload;
      tab = "all";
      syncTabs();
    } catch {
      serverDown = true;
    } finally {
      render();
    }
  });
}

function bindRanking() {
  document.querySelector("#ranking-search").addEventListener("submit", async (event) => {
    event.preventDefault();
    rankingQuery = String(new FormData(event.currentTarget).get("q") || "").trim();
    await loadRanking();
    render();
  });
  document.querySelectorAll("[data-person]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { response, payload } = await api(`/api/ranking/${button.dataset.person}`);
      view = "person";
      personPage = response.ok ? payload : null;
      render();
    });
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
  await go(me.githubLogin ? "projects" : "account");
}

function bindProjects() {
  const toAccount = document.querySelector("#to-account");
  if (toAccount) {
    toAccount.addEventListener("click", () => go("account"));
    return;
  }
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openedRepoId = Number(button.dataset.open);
      notice = "";
      render();
    });
  });
  const addRepo = async (url) => {
    pending("진행중 — 저장소 전체를 판단한 뒤 내 기여만 가져옵니다. 팀원이 많으면 1~2분 걸릴 수 있습니다.");
    const { payload } = await api("/api/my/projects", { method: "POST", body: JSON.stringify({ url }) });
    await loadMyProjects();
    if (payload.ok && payload.project) {
      openedRepoId = payload.project.repoId;
      notice = "추가했습니다.";
      githubRepos = (githubRepos || []).map((repo) => (repo.url.toLowerCase() === payload.project.repoUrl.toLowerCase() ? { ...repo, added: true } : repo));
    } else {
      notice = payload.failureReason || "추가하지 못했습니다.";
    }
    render();
  };
  const filter = document.querySelector("#repo-filter");
  if (filter) {
    filter.addEventListener("input", () => {
      repoFilter = filter.value;
      const position = filter.selectionStart;
      render();
      const next = document.querySelector("#repo-filter");
      next.focus();
      next.setSelectionRange(position, position);
    });
  }
  document.querySelectorAll("[data-add-repo]").forEach((button) => {
    button.addEventListener("click", () => addRepo(button.dataset.addRepo));
  });
  const add = document.querySelector("#projects-judge-form");
  if (add) {
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      addRepo(new FormData(add).get("url"));
    });
  }
  const rejudge = document.querySelector("#rejudge");
  if (!rejudge) return;
  rejudge.addEventListener("click", async () => {
    pending("진행중 — 다시 판단하고 있습니다.");
    const { payload } = await api(`/api/my/projects/${openedRepoId}/rejudge`, { method: "POST" });
    await loadMyProjects();
    notice = payload.ok ? "다시 판단했습니다." : `재판단 실패: ${payload.failureReason || "이유를 받지 못했습니다."} 이전 결과를 보여 줍니다.`;
    render();
  });
  document.querySelector("#remove-project").addEventListener("click", async () => {
    await api(`/api/my/projects/${openedRepoId}`, { method: "DELETE" });
    openedRepoId = null;
    notice = "목록에서 뺐습니다. 기여 순위의 GitHub 기록은 그대로입니다.";
    await loadMyProjects();
    render();
  });
  document.querySelector("#close-project").addEventListener("click", () => {
    openedRepoId = null;
    notice = "";
    render();
  });
}

function accountMessage(text, ok) {
  notice = text;
  render();
  const line = screen.querySelector(".notice");
  if (line) line.classList.toggle("fail", !ok);
}

function bindAccount() {
  const disconnect = document.querySelector("#github-disconnect");
  if (disconnect) {
    disconnect.addEventListener("click", async () => {
      const { payload } = await api("/api/account/github/disconnect", { method: "POST" });
      if (payload.user) me = payload.user;
      githubRepos = null;
      myProjects = [];
      accountMessage("GitHub 연결을 해제했습니다.", true);
    });
  }

  document.querySelector("#nickname-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = new FormData(event.currentTarget).get("nickname");
    const { response, payload } = await api("/api/account/nickname", { method: "POST", body: JSON.stringify({ nickname }) });
    if (!response.ok) return accountMessage(payload.failureReason || "닉네임을 바꾸지 못했습니다.", false);
    me = payload.user;
    accountMessage("닉네임을 바꿨습니다.", true);
  });

  document.querySelector("#visibility").addEventListener("click", async () => {
    const { response, payload } = await api("/api/account/visibility", {
      method: "POST",
      body: JSON.stringify({ accountPublic: !me.accountPublic }),
    });
    if (!response.ok) return accountMessage(payload.failureReason || "바꾸지 못했습니다.", false);
    me = payload.user;
    accountMessage(me.accountPublic ? "계정 공개를 켰습니다." : "계정 공개를 껐습니다.", true);
  });

  document.querySelector("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const { response, payload } = await api("/api/account/password", { method: "POST", body: JSON.stringify(body) });
    if (!response.ok) return accountMessage(payload.failureReason || "비밀번호를 바꾸지 못했습니다.", false);
    accountMessage("비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.", true);
  });

  document.querySelector("#delete-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.confirm("계정과 프로젝트 관리 목록이 지워집니다. 정말 삭제할까요?")) return;
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
  myProjects = [];
  githubRepos = null;
  repoFilter = "";
  openedRepoId = null;
  manageOpen = false;
}

async function loadGithubRepos() {
  try {
    const { response, payload } = await api("/api/my/projects/github-repos");
    githubRepos = response.ok ? payload.repos || [] : [];
  } catch {
    githubRepos = [];
  }
}

async function loadMyProjects() {
  if (!me || !me.githubLogin) {
    myProjects = [];
    return;
  }
  try {
    const { response, payload } = await api("/api/my/projects");
    myProjects = response.ok ? payload.projects || [] : [];
  } catch {
    myProjects = [];
    serverDown = true;
  }
}

async function loadRanking() {
  try {
    const { response, payload } = await api(`/api/ranking?q=${encodeURIComponent(rankingQuery)}`);
    ranking = response.ok ? payload.people || [] : [];
  } catch {
    ranking = [];
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
  const githubResult = new URLSearchParams(window.location.search).get("github");
  if (githubResult) {
    window.history.replaceState(null, "", "/");
    await go(me ? "account" : "login");
    notice = githubNotices[githubResult] || "";
    render();
    return;
  }
  render();
}

start();
