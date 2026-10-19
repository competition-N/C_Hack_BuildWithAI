document.documentElement.dataset.js = "ran";

const screen = document.querySelector("#screen");
const viewButtons = [...document.querySelectorAll(".side [data-view]")];
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
let notices = {};
let serverDown = false;

const githubNotices = {
  linked: ["GitHub를 연결했습니다.", true],
  taken: ["그 GitHub 계정은 이미 다른 계정에 연결되어 있습니다.", false],
  denied: ["GitHub 연결을 취소했습니다.", false],
  error: ["GitHub 연결에 실패했습니다. 다시 시도해 주세요.", false],
  config: ["서버에 GitHub 연결 설정이 없습니다.", false],
  login: ["먼저 로그인해 주세요.", false],
};

viewButtons.forEach((button) => {
  button.addEventListener("click", () => go(button.dataset.view, { focus: true }));
});

manageToggle.addEventListener("click", () => {
  manageOpen = !manageOpen;
  syncNav();
});

async function go(next, { focus = false } = {}) {
  view = next;
  openedRepoId = null;
  personPage = null;
  notices = {};
  if (me && view === "login") view = "projects";
  if (!me && (view === "projects" || view === "account")) view = "login";
  if (view === "projects" || view === "account") manageOpen = true;
  if (view === "projects") await loadMyProjects();
  if (view === "public") await loadRanking();
  render();
  if (focus) focusHeading();
  if (view === "projects" && me && me.githubLogin && githubRepos === null) {
    await loadGithubRepos();
    if (view === "projects" && !openedRepoId) render();
  }
}

function focusHeading() {
  const heading = screen.querySelector("h1");
  if (!heading) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus();
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

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setNotice(key, text, ok) {
  notices[key] = { text, ok };
}

function noticeLine(key) {
  const notice = notices[key];
  if (!notice) return `<p class="status" id="status-${key}" role="status"></p>`;
  return `<p class="status ${notice.ok ? "status-ok" : "status-fail"}" id="status-${key}" role="${notice.ok ? "status" : "alert"}">${escapeHtml(notice.text)}</p>`;
}

function pageHead(title, description) {
  return `
    <header class="page-head">
      <h1>${escapeHtml(title)}</h1>
      ${description ? `<p class="muted">${description}</p>` : ""}
    </header>
  `;
}

function featureList(detail) {
  if (!detail || !detail.features || !detail.features.length) return "<p class='muted small'>기능 기록 없음</p>";
  const items = detail.features.map((feature) => `
    <li>
      <span>${escapeHtml(feature.name)}</span>
      <span class="feature-meta">${feature.tech && feature.tech !== "-" ? `${escapeHtml(feature.tech)} · ` : ""}커밋 ${feature.commits} × 난이도 ${feature.difficulty} = <strong>${feature.points}</strong></span>
    </li>
  `).join("");
  return `<ul class="features">${items}</ul>`;
}

function agentTags(detail) {
  if (!detail) return "";
  return [
    detail.agentCommits ? `<span class="tag">AI 에이전트 ${detail.agentCommits}건 포함</span>` : "",
    detail.isAgent ? `<span class="tag">AI 에이전트 · 공동 작성자 없음</span>` : "",
  ].join("");
}

function evidence(detail) {
  if (!detail) return "";
  const lines = [
    `커밋 ${detail.commits}${detail.agentCommits ? ` (AI ${detail.agentCommits})` : ""}`,
    `PR ${detail.prsMerged} 합침 / ${detail.prsOpened} 열음`,
    detail.analyzedCommits ? `기능으로 나눈 커밋 ${detail.analyzedCommits}개` : "모델 분석 안 됨",
    detail.sampledCommits
      ? `코드를 읽은 커밋 ${detail.sampledCommits}개 · 파일 ${detail.filesChanged}개 · +${detail.additions} / −${detail.deletions}줄`
      : "",
  ].filter(Boolean);
  return `<div class="evidence">${lines.map((line) => `<span>${line}</span>`).join("")}</div>`;
}

function rankingTable(rows) {
  if (!rows || !rows.length) return "<p class='muted'>기여자 기록이 없습니다.</p>";
  const body = rows.map((row) => `
    <tr>
      <td class="num">${row.rank}</td>
      <td><div class="person"><span>${escapeHtml(row.author)}</span>${agentTags(row.detail)}</div></td>
      <td class="num score">${row.score}</td>
      <td>${featureList(row.detail)}</td>
      <td>${evidence(row.detail)}</td>
    </tr>
  `).join("");
  return `
    <div class="table-wrap" role="region" aria-label="기여도 표" tabindex="0">
      <table>
        <thead><tr><th class="num" scope="col">순위</th><th scope="col">사람</th><th class="num" scope="col">점수</th><th scope="col">기능별 점수</th><th scope="col">근거</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="footnote">점수는 기능마다 (커밋 수 × 코드 난이도 1~5)를 더한 값입니다. PR 안의 커밋은 이미 점수에 들어 있어서, PR 수는 근거로만 보여 줍니다.</p>
  `;
}

function docs(data) {
  const body = (text) => {
    const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return "<p class='muted'>아직 정리되지 않았습니다.</p>";
    if (lines.every((line) => line.startsWith("- "))) {
      return `<ul class="doc-list">${lines.map((line) => `<li>${escapeHtml(line.slice(2))}</li>`).join("")}</ul>`;
    }
    return `<p class="doc-text">${escapeHtml(text)}</p>`;
  };
  const block = (title, text) => `
    <section class="section">
      <h3>${title}</h3>
      ${body(text)}
    </section>
  `;
  return `
    <div class="doc-grid">
      ${block("기술 요약", data.techSummary)}
      ${block("만든 기능", data.features)}
      ${block("난이도", data.difficulty)}
      ${block("알고리즘", data.algorithms)}
    </div>
  `;
}

function urlForm(id, label, busyLabel) {
  return `
    <form class="inline-form" id="${id}" data-busy="${escapeHtml(busyLabel)}">
      <input name="url" type="url" required placeholder="https://github.com/소유자/저장소" aria-label="공개 저장소 주소" autocomplete="off">
      <button type="submit" class="button button-primary">${label}</button>
    </form>
  `;
}

function mainView() {
  const head = pageHead("저장소 판단", "공개 GitHub 저장소 주소를 넣으면, 사람마다 한 일을 기능으로 나누고 기능마다 코드 난이도로 점수를 매깁니다.");
  const form = `
    <div class="stack">
      ${urlForm("judge-form", "판단하기", "판단하는 중입니다. 팀원이 많으면 1~2분 걸릴 수 있습니다.")}
      ${noticeLine("main")}
    </div>
  `;
  if (!result) return head + form;
  if (result.ok === false) {
    return head + form + `
      <section class="section" aria-labelledby="fail-title">
        <h2 id="fail-title">판단하지 못했습니다</h2>
        <p class="status status-fail">${escapeHtml(result.failureReason)}</p>
      </section>
    `;
  }
  const tabs = [["all", "전체"], ["score", "기여도"], ["doc", "문서"]].map(([key, label]) => `
    <button type="button" data-tab="${key}" aria-pressed="${tab === key ? "true" : "false"}">${label}</button>
  `).join("");
  let body = "";
  if (tab === "score") body = rankingTable(result.contributions);
  else if (tab === "doc") body = docs(result);
  else body = `${rankingTable(result.contributions)}${docs(result)}`;
  return head + form + `
    <section class="stack result" aria-labelledby="result-title">
      <div class="section-head">
        <h2 id="result-title">${escapeHtml(result.name)}</h2>
        <span class="muted small">기여자 ${result.contributions.length}명 · <a href="${escapeHtml(result.repoUrl)}" target="_blank" rel="noopener">GitHub에서 보기</a></span>
      </div>
      <div class="tabs" role="group" aria-label="결과 보기">${tabs}</div>
      ${body}
    </section>
  `;
}

function rankingView() {
  const rows = ranking.map((person) => `
    <tr>
      <td class="num">${person.rank}</td>
      <td><button type="button" class="link-button" data-person="${escapeHtml(person.code)}">${escapeHtml(person.name)}</button></td>
      <td class="num score">${person.total}</td>
      <td class="num">${person.projects}</td>
    </tr>
  `).join("");
  return `
    ${pageHead("기여 순위", "판단된 모든 저장소의 점수를 사람별로 더한 순위입니다. GitHub를 연결하고 계정 공개를 켠 사람만 닉네임으로 보이고, 나머지는 랜덤 닉네임으로 보입니다.")}
    <div class="stack">
      <form class="inline-form" id="ranking-search" role="search">
        <input name="q" type="search" value="${escapeHtml(rankingQuery)}" placeholder="닉네임으로 찾기" aria-label="닉네임으로 찾기">
        <button type="submit" class="button">찾기</button>
      </form>
      ${ranking.length
        ? `<div class="table-wrap" role="region" aria-label="기여 순위 표" tabindex="0">
            <table>
              <thead><tr><th class="num" scope="col">순위</th><th scope="col">닉네임</th><th class="num" scope="col">총점</th><th class="num" scope="col">프로젝트</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
        : `<p class="muted">${rankingQuery ? `"${escapeHtml(rankingQuery)}"(으)로 찾은 사람이 없습니다.` : "아직 판단된 저장소가 없습니다."}</p>`}
    </div>
  `;
}

function personView() {
  const back = `<p><button type="button" class="link-button" id="back-ranking">기여 순위로 돌아가기</button></p>`;
  if (!personPage) return back + pageHead("정보 없음", "이 사람의 기록을 찾지 못했습니다.");
  const { person, projects } = personPage;
  return `
    ${back}
    ${pageHead(person.name, `전체 ${person.rank}위 · 총점 <strong class="num">${person.total}</strong> · 프로젝트 ${person.projects}개`)}
    <div class="stack">
      ${projects.map((project) => `
        <section class="section" aria-label="${escapeHtml(project.name)}">
          <div class="section-head">
            <h2>${escapeHtml(project.name)}</h2>
            <span class="muted small num">${project.score}점 · 저장소 안 ${project.rank}위</span>
          </div>
          ${featureList(project.detail)}
        </section>
      `).join("")}
    </div>
  `;
}

function loginView() {
  return `
    ${pageHead("로그인", "로그인하면 GitHub를 연결하고, 내가 기여한 저장소의 점수를 모아 볼 수 있습니다.")}
    <div class="login-grid">
      <section class="section" aria-labelledby="login-title">
        <h2 id="login-title">로그인</h2>
        <form class="form-grid" id="login-form">
          <div class="field">
            <label for="login-username">아이디</label>
            <input id="login-username" name="username" type="text" required autocomplete="username">
          </div>
          <div class="field">
            <label for="login-password">비밀번호</label>
            <input id="login-password" name="password" type="password" required autocomplete="current-password">
          </div>
          <div><button type="submit" class="button button-primary">로그인</button></div>
          ${noticeLine("login")}
        </form>
      </section>
      <section class="section" aria-labelledby="register-title">
        <h2 id="register-title">가입</h2>
        <form class="form-grid" id="register-form">
          <div class="field">
            <label for="register-username">아이디</label>
            <input id="register-username" name="username" type="text" required autocomplete="username" aria-describedby="register-username-hint">
            <span class="hint" id="register-username-hint">영문, 숫자, 밑줄 3~32자</span>
          </div>
          <div class="field">
            <label for="register-password">비밀번호</label>
            <input id="register-password" name="password" type="password" required minlength="8" autocomplete="new-password" aria-describedby="register-password-hint">
            <span class="hint" id="register-password-hint">8자 이상</span>
          </div>
          <div><button type="submit" class="button">가입</button></div>
          ${noticeLine("register")}
        </form>
      </section>
    </div>
  `;
}

function githubSection() {
  let body;
  if (me.githubLogin) {
    body = `
      <p>연결된 계정: <strong>${escapeHtml(me.githubLogin)}</strong></p>
      <div><button type="button" class="button" id="github-disconnect">연결 해제</button></div>
    `;
  } else if (!me.oauthReady) {
    body = `<p class="status status-fail">서버에 GitHub 연결 설정이 없습니다. <code>.env</code>에 <code>GITHUB_CLIENT_ID</code>와 <code>GITHUB_CLIENT_SECRET</code>를 넣고 서버를 다시 켜 주세요.</p>`;
  } else {
    body = `
      <p class="muted">GitHub에서 로그인한 본인의 아이디만 연결됩니다.</p>
      <div><a class="button button-dark" href="/api/github/connect">GitHub로 연결</a></div>
    `;
  }
  return `
    <section class="section" aria-labelledby="github-title">
      <h2 id="github-title">GitHub 연결</h2>
      ${body}
      ${noticeLine("github")}
    </section>
  `;
}

function accountView() {
  const shownName = me.githubLogin ? (me.accountPublic ? me.nickname : me.randomNickname) : null;
  return `
    ${pageHead("계정 설정", `로그인 아이디 ${escapeHtml(me.username)}`)}
    <div class="stack">
      ${githubSection()}
      <section class="section" aria-labelledby="nickname-title">
        <h2 id="nickname-title">닉네임</h2>
        <p class="muted">${shownName ? `기여 순위에 지금 보이는 이름: <strong>${escapeHtml(shownName)}</strong>` : "GitHub를 연결하면 기여 순위에 나옵니다."}</p>
        <form class="form-grid" id="nickname-form">
          <div class="field">
            <label for="nickname-input">닉네임</label>
            <input id="nickname-input" name="nickname" type="text" required minlength="2" maxlength="20" value="${escapeHtml(me.nickname)}" aria-describedby="nickname-hint">
            <span class="hint" id="nickname-hint">2~20자. &lt; &gt; " ' &amp; # 는 쓸 수 없습니다.</span>
          </div>
          <div><button type="submit" class="button">닉네임 저장</button></div>
          ${noticeLine("nickname")}
        </form>
      </section>
      <section class="section" aria-labelledby="visibility-title">
        <h2 id="visibility-title">계정 공개</h2>
        <p>지금 <strong>${me.accountPublic ? "켜짐" : "꺼짐"}</strong></p>
        <p class="muted">켜면 기여 순위에 "${escapeHtml(me.nickname)}"(으)로 보입니다. 끄면 랜덤 닉네임${me.randomNickname ? ` "${escapeHtml(me.randomNickname)}"` : ""}(으)로 보입니다.</p>
        <div><button type="button" class="button" id="visibility" aria-pressed="${me.accountPublic ? "true" : "false"}">${me.accountPublic ? "계정 공개 끄기" : "계정 공개 켜기"}</button></div>
        ${noticeLine("visibility")}
      </section>
      <section class="section" aria-labelledby="password-title">
        <h2 id="password-title">비밀번호 변경</h2>
        <form class="form-grid" id="password-form">
          <div class="field">
            <label for="current-password">지금 비밀번호</label>
            <input id="current-password" name="currentPassword" type="password" required autocomplete="current-password">
          </div>
          <div class="field">
            <label for="new-password">새 비밀번호</label>
            <input id="new-password" name="newPassword" type="password" required minlength="8" autocomplete="new-password" aria-describedby="new-password-hint">
            <span class="hint" id="new-password-hint">8자 이상. 바꾸면 다른 기기의 로그인이 끊깁니다.</span>
          </div>
          <div><button type="submit" class="button">비밀번호 변경</button></div>
          ${noticeLine("password")}
        </form>
      </section>
      <section class="section" aria-labelledby="session-title">
        <h2 id="session-title">로그아웃</h2>
        <div><button type="button" class="button" id="logout">로그아웃</button></div>
      </section>
      <section class="section section-danger" aria-labelledby="delete-title">
        <h2 id="delete-title">계정 삭제</h2>
        <p class="muted">계정과 프로젝트 관리 목록이 지워지고, 되돌릴 수 없습니다. 판단된 저장소의 GitHub 기록은 남고 순위에는 랜덤 닉네임으로 보입니다.</p>
        <form class="form-grid" id="delete-form">
          <div class="field">
            <label for="delete-password">비밀번호 확인</label>
            <input id="delete-password" name="password" type="password" required autocomplete="current-password">
          </div>
          <div><button type="submit" class="button button-danger">계정 삭제</button></div>
          ${noticeLine("delete")}
        </form>
      </section>
    </div>
  `;
}

const repoSources = { own: "내 저장소", member: "협업자", contributed: "커밋한 저장소" };

function repoPicker() {
  if (githubRepos === null) return `<p class="status status-busy">GitHub 저장소 목록을 불러오는 중입니다.</p>`;
  const query = repoFilter.toLowerCase();
  const shown = githubRepos.filter((repo) => !query || repo.fullName.toLowerCase().includes(query)).slice(0, 50);
  const rows = shown.map((repo) => `
    <li>
      <div class="row-main">
        <span class="row-title">${escapeHtml(repo.fullName)} <span class="tag">${repoSources[repo.source] || ""}</span>${repo.fork ? " <span class='tag'>포크</span>" : ""}</span>
        ${repo.description ? `<span class="muted small">${escapeHtml(repo.description)}</span>` : ""}
      </div>
      ${repo.added
        ? "<span class='muted small'>추가됨</span>"
        : `<button type="button" class="button button-small" data-add-repo="${escapeHtml(repo.url)}" aria-label="${escapeHtml(repo.fullName)} 추가">추가</button>`}
    </li>
  `).join("");
  return `
    ${githubRepos.length
      ? `<div class="field">
          <label for="repo-filter">내 GitHub 저장소 ${githubRepos.length}개</label>
          <input type="search" id="repo-filter" value="${escapeHtml(repoFilter)}" placeholder="저장소 이름으로 찾기">
        </div>
        ${shown.length ? `<ul class="row-list">${rows}</ul>` : "<p class='muted'>찾는 저장소가 없습니다.</p>"}`
      : "<p class='muted'>불러온 공개 저장소가 없습니다.</p>"}
    <details class="manual-add">
      <summary>목록에 없는 저장소를 주소로 추가</summary>
      ${urlForm("projects-judge-form", "추가하기", "판단하는 중입니다. 팀원이 많으면 1~2분 걸릴 수 있습니다.")}
    </details>
  `;
}

function projectDetail(project) {
  const mine = project.me;
  return `
    <section class="stack" aria-labelledby="project-title">
      <div class="section-head">
        <h2 id="project-title">${escapeHtml(project.name)}</h2>
        <a class="small" href="${escapeHtml(project.repoUrl)}" target="_blank" rel="noopener">GitHub에서 보기</a>
      </div>
      <div class="actions">
        <button type="button" class="button button-primary" id="rejudge">재판단하기</button>
        <button type="button" class="button" id="close-project">닫기</button>
      </div>
      ${noticeLine("project")}
      ${project.failureReason ? `<p class="status status-fail">마지막 재판단 실패: ${escapeHtml(project.failureReason)}</p>` : ""}
      ${mine
        ? `<section class="section" aria-labelledby="mine-title">
            <h3 id="mine-title">내 점수</h3>
            <div class="score-summary">
              <span class="score-big">${mine.score}</span>
              <span class="muted num">저장소 안 ${mine.rank}위 / ${project.peopleCount}명</span>
              ${agentTags(mine.detail)}
            </div>
            ${featureList(mine.detail)}
            ${evidence(mine.detail)}
          </section>`
        : "<p class='muted'>이 저장소에 내 기록이 없습니다.</p>"}
      ${docs(project)}
      <section class="section" aria-labelledby="project-settings-title">
        <h3 id="project-settings-title">설정</h3>
        <div class="setting-row">
          <div class="setting-text">
            <p><strong>기여 순위에 공개</strong> · 지금 ${project.shared ? "켜짐" : "꺼짐"}</p>
            <p class="muted small">끄면 이 저장소의 내 점수가 기여 순위와 내 사람 화면에서 빠집니다. 같은 저장소의 다른 팀원 점수는 그대로 남습니다.</p>
          </div>
          <button type="button" class="button" id="share-project" aria-pressed="${project.shared ? "true" : "false"}">${project.shared ? "공개 끄기" : "공개 켜기"}</button>
        </div>
        ${noticeLine("share")}
        <div class="setting-row">
          <div class="setting-text">
            <p><strong>목록에서 빼기</strong></p>
            <p class="muted small">프로젝트 관리 목록에서만 빠집니다. 공개를 꺼 둔 상태였다면, 빼는 순간 내 점수가 기여 순위에 다시 나옵니다.</p>
          </div>
          <button type="button" class="button button-danger" id="remove-project">목록에서 빼기</button>
        </div>
      </section>
    </section>
  `;
}

function projectsView() {
  if (!me.githubLogin) {
    return `
      ${pageHead("프로젝트 관리", "내 GitHub 아이디의 기여만 모아 봅니다.")}
      <section class="section">
        <p>먼저 GitHub를 연결해 주세요.</p>
        <div><button type="button" class="button button-primary" id="to-account">계정 설정으로 가기</button></div>
      </section>
    `;
  }
  const opened = myProjects.find((project) => project.repoId === openedRepoId) || null;
  const list = myProjects.length
    ? `<ul class="project-nav">${myProjects.map((project) => `
        <li>
          <button type="button" data-open="${project.repoId}" aria-current="${project.repoId === openedRepoId ? "true" : "false"}">
            <span>${escapeHtml(project.name)}${project.shared ? "" : " <span class='tag'>비공개</span>"}</span>
            <span class="num">${project.me ? `${project.me.score}점` : "-"}</span>
          </button>
        </li>
      `).join("")}</ul>`
    : "<p class='muted small'>아직 추가한 저장소가 없습니다.</p>";
  const main = opened
    ? projectDetail(opened)
    : `
      <section class="stack" aria-labelledby="add-title">
        <h2 id="add-title">저장소 추가</h2>
        <p class="muted small">고른 저장소 전체를 판단한 뒤, ${escapeHtml(me.githubLogin)}의 기여가 있을 때만 목록에 넣습니다.</p>
        ${noticeLine("projects")}
        ${repoPicker()}
      </section>
    `;
  return `
    ${pageHead("프로젝트 관리", `GitHub ${escapeHtml(me.githubLogin)}의 기여`)}
    <div class="projects-layout">
      <nav aria-label="내 프로젝트">
        <h2 class="nav-title">내 프로젝트 ${myProjects.length}개</h2>
        ${list}
        ${opened ? `<p class="nav-after"><button type="button" class="link-button small" id="show-add">저장소 추가</button></p>` : ""}
      </nav>
      <div>${main}</div>
    </div>
  `;
}

function serverDownView() {
  return `
    ${pageHead("서버에 연결되지 않았습니다", "")}
    <section class="section">
      <p>이 페이지는 파일로 직접 열면 동작하지 않습니다. 프로젝트 폴더에서 <code>node server.js</code>를 실행한 뒤 <code>http://localhost:3000</code>을 열어 주세요.</p>
    </section>
  `;
}

const views = {
  main: [mainView, bindMain],
  public: [rankingView, bindRanking],
  person: [personView, bindPerson],
  login: [loginView, bindAuth],
  account: [accountView, bindAccount],
  projects: [projectsView, bindProjects],
};

function render() {
  syncNav();
  if (serverDown) {
    screen.innerHTML = serverDownView();
    return;
  }
  const [draw, bind] = views[view] || views.main;
  screen.innerHTML = draw();
  bind();
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

function busy(statusKey, text) {
  const line = document.querySelector(`#status-${statusKey}`);
  if (line) {
    line.className = "status status-busy";
    line.setAttribute("role", "status");
    line.textContent = text;
  }
  screen.querySelectorAll("button, input").forEach((control) => { control.disabled = true; });
}

function bindMain() {
  const form = document.querySelector("#judge-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = new FormData(form).get("url");
    busy("main", form.dataset.busy);
    try {
      const { payload } = await api("/api/judge", { method: "POST", body: JSON.stringify({ url }) });
      result = payload;
      tab = "all";
      notices = {};
    } catch {
      serverDown = true;
    } finally {
      render();
    }
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      tab = button.dataset.tab;
      render();
      document.querySelector(`[data-tab="${tab}"]`).focus();
    });
  });
}

function bindRanking() {
  document.querySelector("#ranking-search").addEventListener("submit", async (event) => {
    event.preventDefault();
    rankingQuery = String(new FormData(event.currentTarget).get("q") || "").trim();
    await loadRanking();
    render();
    document.querySelector("#ranking-search input").focus();
  });
  document.querySelectorAll("[data-person]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { response, payload } = await api(`/api/ranking/${button.dataset.person}`);
      view = "person";
      personPage = response.ok ? payload : null;
      render();
      focusHeading();
    });
  });
}

function bindPerson() {
  document.querySelector("#back-ranking").addEventListener("click", () => go("public", { focus: true }));
}

function bindAuth() {
  document.querySelector("#login-form").addEventListener("submit", (event) => submitAuth(event, "/api/login", "login"));
  document.querySelector("#register-form").addEventListener("submit", (event) => submitAuth(event, "/api/register", "register"));
}

async function submitAuth(event, path, key) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  const { response, payload } = await api(path, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) {
    const line = document.querySelector(`#status-${key}`);
    line.className = "status status-fail";
    line.setAttribute("role", "alert");
    line.textContent = payload.failureReason || "로그인하지 못했습니다.";
    return;
  }
  me = payload.user;
  manageOpen = true;
  await go(me.githubLogin ? "projects" : "account", { focus: true });
}

function bindProjects() {
  const toAccount = document.querySelector("#to-account");
  if (toAccount) {
    toAccount.addEventListener("click", () => go("account", { focus: true }));
    return;
  }
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      openedRepoId = Number(button.dataset.open);
      notices = {};
      render();
      document.querySelector("#project-title").setAttribute("tabindex", "-1");
      document.querySelector("#project-title").focus();
    });
  });
  const showAdd = document.querySelector("#show-add");
  if (showAdd) {
    showAdd.addEventListener("click", () => {
      openedRepoId = null;
      notices = {};
      render();
    });
  }

  const addRepo = async (url, busyText) => {
    busy("projects", busyText);
    const { payload } = await api("/api/my/projects", { method: "POST", body: JSON.stringify({ url }) });
    await loadMyProjects();
    notices = {};
    if (payload.ok && payload.project) {
      openedRepoId = payload.project.repoId;
      setNotice("project", "추가했습니다.", true);
      githubRepos = (githubRepos || []).map((repo) => (repo.url.toLowerCase() === payload.project.repoUrl.toLowerCase() ? { ...repo, added: true } : repo));
    } else {
      setNotice("projects", payload.failureReason || "추가하지 못했습니다.", false);
    }
    render();
  };
  const busyText = "판단하는 중입니다. 팀원이 많으면 1~2분 걸릴 수 있습니다.";
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
    button.addEventListener("click", () => addRepo(button.dataset.addRepo, busyText));
  });
  const add = document.querySelector("#projects-judge-form");
  if (add) {
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      addRepo(new FormData(add).get("url"), busyText);
    });
  }

  const rejudge = document.querySelector("#rejudge");
  if (!rejudge) return;
  rejudge.addEventListener("click", async () => {
    busy("project", "다시 판단하는 중입니다.");
    const { payload } = await api(`/api/my/projects/${openedRepoId}/rejudge`, { method: "POST" });
    await loadMyProjects();
    notices = {};
    if (payload.ok) setNotice("project", "다시 판단했습니다.", true);
    else setNotice("project", `재판단하지 못했습니다: ${payload.failureReason || "이유를 받지 못했습니다."} 이전 결과를 보여 줍니다.`, false);
    render();
  });
  document.querySelector("#share-project").addEventListener("click", async () => {
    const project = myProjects.find((item) => item.repoId === openedRepoId);
    const { response, payload } = await api(`/api/my/projects/${openedRepoId}/share`, {
      method: "POST",
      body: JSON.stringify({ shared: !project.shared }),
    });
    notices = {};
    if (response.ok && payload.project) {
      myProjects = myProjects.map((item) => (item.repoId === openedRepoId ? payload.project : item));
      setNotice("share", payload.project.shared ? "기여 순위에 다시 공개했습니다." : "기여 순위에서 이 저장소의 내 점수를 뺐습니다.", true);
    } else {
      setNotice("share", payload.failureReason || "바꾸지 못했습니다.", false);
    }
    render();
    document.querySelector("#share-project").focus();
  });
  document.querySelector("#remove-project").addEventListener("click", async () => {
    if (!window.confirm("이 저장소를 프로젝트 관리 목록에서 뺄까요? 기여 순위의 기록은 그대로 남습니다.")) return;
    await api(`/api/my/projects/${openedRepoId}`, { method: "DELETE" });
    openedRepoId = null;
    await loadMyProjects();
    notices = {};
    setNotice("projects", "목록에서 뺐습니다.", true);
    githubRepos = null;
    render();
    await loadGithubRepos();
    if (view === "projects" && !openedRepoId) render();
  });
  document.querySelector("#close-project").addEventListener("click", () => {
    openedRepoId = null;
    notices = {};
    render();
  });
}

function accountNotice(key, text, ok) {
  notices = {};
  setNotice(key, text, ok);
  render();
  const line = document.querySelector(`#status-${key}`);
  if (line && line.closest("section")) line.closest("section").scrollIntoView({ block: "nearest" });
}

function bindAccount() {
  const disconnect = document.querySelector("#github-disconnect");
  if (disconnect) {
    disconnect.addEventListener("click", async () => {
      const { payload } = await api("/api/account/github/disconnect", { method: "POST" });
      if (payload.user) me = payload.user;
      githubRepos = null;
      myProjects = [];
      accountNotice("github", "GitHub 연결을 해제했습니다.", true);
    });
  }

  document.querySelector("#nickname-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = new FormData(event.currentTarget).get("nickname");
    const { response, payload } = await api("/api/account/nickname", { method: "POST", body: JSON.stringify({ nickname }) });
    if (!response.ok) return accountNotice("nickname", payload.failureReason || "닉네임을 바꾸지 못했습니다.", false);
    me = payload.user;
    accountNotice("nickname", "닉네임을 저장했습니다.", true);
  });

  document.querySelector("#visibility").addEventListener("click", async () => {
    const { response, payload } = await api("/api/account/visibility", {
      method: "POST",
      body: JSON.stringify({ accountPublic: !me.accountPublic }),
    });
    if (!response.ok) return accountNotice("visibility", payload.failureReason || "바꾸지 못했습니다.", false);
    me = payload.user;
    accountNotice("visibility", me.accountPublic ? "계정 공개를 켰습니다." : "계정 공개를 껐습니다.", true);
  });

  document.querySelector("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const { response, payload } = await api("/api/account/password", { method: "POST", body: JSON.stringify(body) });
    if (!response.ok) return accountNotice("password", payload.failureReason || "비밀번호를 바꾸지 못했습니다.", false);
    accountNotice("password", "비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.", true);
  });

  document.querySelector("#delete-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.confirm("계정과 프로젝트 관리 목록이 지워집니다. 정말 삭제할까요?")) return;
    const password = new FormData(event.currentTarget).get("password");
    const { response, payload } = await api("/api/account/delete", { method: "POST", body: JSON.stringify({ password }) });
    if (!response.ok) return accountNotice("delete", payload.failureReason || "계정을 삭제하지 못했습니다.", false);
    signedOut();
    await go("main", { focus: true });
  });

  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    signedOut();
    await go("login", { focus: true });
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
    const [text, ok] = githubNotices[githubResult] || ["", true];
    if (text) {
      setNotice(me ? "github" : "login", text, ok);
      render();
    }
    return;
  }
  render();
}

start();
