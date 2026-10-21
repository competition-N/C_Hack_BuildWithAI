document.documentElement.dataset.js = "ran";

const screen = document.querySelector("#screen");
const viewButtons = [...document.querySelectorAll(".side [data-view]")];
const navLogin = document.querySelector("#nav-login");
const navManage = document.querySelector("#nav-manage");
const manageToggle = document.querySelector("#manage-toggle");
const manageMenu = document.querySelector("#manage-menu");

let lang = "ko";
let view = "main";
let tab = "all";
let me = null;
let judgesPerHour = 3;
let judgesLeft = null;
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

function t(key, params = {}) {
  const text = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.ko[key] || key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

function pick(value) {
  if (value && typeof value === "object") return value[lang] || value.ko || "";
  return value || "";
}

function initialLanguage() {
  const saved = window.localStorage.getItem("lang");
  if (saved === "ko" || saved === "en") return saved;
  return String(navigator.language || "").toLowerCase().startsWith("ko") ? "ko" : "en";
}

function setLanguage(next) {
  lang = next === "en" ? "en" : "ko";
  window.localStorage.setItem("lang", lang);
  document.documentElement.lang = lang;
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelector("#main-nav").setAttribute("aria-label", t("nav.label"));
}

function errorText(code, fallback) {
  if (code && STRINGS.ko[`error.${code}`]) return t(`error.${code}`);
  return fallback || code || t("error.unknown");
}

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

function featureName(feature) {
  if (lang === "en") return feature.nameEn || feature.nameKo || feature.name || "";
  return feature.nameKo || feature.name || "";
}

function featureList(detail) {
  if (!detail || !detail.features || !detail.features.length) return `<p class="muted small">${t("feature.none")}</p>`;
  const items = detail.features.map((feature) => `
    <li>
      <span>${escapeHtml(featureName(feature))}</span>
      <span class="feature-meta">${feature.tech && feature.tech !== "-" ? `${escapeHtml(feature.tech)} · ` : ""}${t("feature.meta", { c: feature.commits, d: feature.difficulty })}<strong>${feature.points}</strong></span>
    </li>
  `).join("");
  return `<ul class="features">${items}</ul>`;
}

function agentTags(detail) {
  if (!detail) return "";
  return [
    detail.agentCommits ? `<span class="tag">${t("tag.agentIncluded", { n: detail.agentCommits })}</span>` : "",
    detail.isAgent ? `<span class="tag">${t("tag.agentOnly")}</span>` : "",
  ].join("");
}

function evidence(detail) {
  if (!detail) return "";
  const lines = [
    `${t("ev.commits", { n: detail.commits })}${detail.agentCommits ? t("ev.ai", { n: detail.agentCommits }) : ""}`,
    t("ev.prs", { m: detail.prsMerged, o: detail.prsOpened }),
    detail.analyzedCommits ? t("ev.analyzed", { n: detail.analyzedCommits }) : t("ev.notAnalyzed"),
    detail.sampledCommits
      ? t("ev.code", { s: detail.sampledCommits, f: detail.filesChanged, a: detail.additions, d: detail.deletions })
      : "",
  ].filter(Boolean);
  return `<div class="evidence">${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>`;
}

function rankingTable(rows) {
  if (!rows || !rows.length) return `<p class="muted">${t("table.empty")}</p>`;
  const body = rows.map((row) => `
    <tr>
      <td class="num">${row.rank}</td>
      <td><div class="person"><span>${escapeHtml(pick(row.name))}</span>${row.isMe ? `<span class="tag">${t("tag.me")}</span>` : ""}${agentTags(row.detail)}</div></td>
      <td class="num score">${row.score}</td>
      <td>${featureList(row.detail)}</td>
      <td>${evidence(row.detail)}</td>
    </tr>
  `).join("");
  return `
    <div class="table-wrap" role="region" aria-label="${t("table.label")}" tabindex="0">
      <table>
        <thead><tr>
          <th class="num" scope="col">${t("th.rank")}</th>
          <th scope="col">${t("th.person")}</th>
          <th class="num" scope="col">${t("th.score")}</th>
          <th scope="col">${t("th.features")}</th>
          <th scope="col">${t("th.evidence")}</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="footnote">${t("table.footnote")}</p>
  `;
}

function docs(data) {
  const body = (value) => {
    const text = pick(value);
    const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return `<p class="muted">${t("docs.empty")}</p>`;
    if (lines.every((line) => line.startsWith("- "))) {
      return `<ul class="doc-list">${lines.map((line) => `<li>${escapeHtml(line.slice(2))}</li>`).join("")}</ul>`;
    }
    return `<p class="doc-text">${escapeHtml(text)}</p>`;
  };
  const block = (title, value) => `
    <section class="section">
      <h3>${title}</h3>
      ${body(value)}
    </section>
  `;
  return `
    <div class="doc-grid">
      ${block(t("docs.summary"), data.techSummary)}
      ${block(t("docs.features"), data.features)}
      ${block(t("docs.difficulty"), data.difficulty)}
      ${block(t("docs.algorithms"), data.algorithms)}
    </div>
  `;
}

function urlForm(id, label) {
  return `
    <form class="inline-form" id="${id}">
      <input name="url" type="url" required placeholder="${t("form.placeholder")}" aria-label="${t("form.url")}" autocomplete="off">
      <button type="submit" class="button button-primary">${label}</button>
    </form>
  `;
}

function privacyNotice() {
  return `
    <div class="notice-box">
      <p>${t("notice.privacy")}</p>
      <p>${t("notice.anonymous")}</p>
      <p>${judgesLeft == null ? t("notice.limit", { n: judgesPerHour }) : t("notice.left", { n: judgesLeft })}</p>
    </div>
  `;
}

function mainView() {
  const head = pageHead(t("main.title"), t("main.lede"));
  const form = `
    <div class="stack">
      ${urlForm("judge-form", t("main.submit"))}
      ${noticeLine("main")}
      ${privacyNotice()}
    </div>
  `;
  if (!result) return head + form;
  if (result.ok === false) {
    return head + form + `
      <section class="section result" aria-labelledby="fail-title">
        <h2 id="fail-title">${t("result.failTitle")}</h2>
        <p class="status status-fail">${escapeHtml(errorText(result.failureCode, result.failureReason))}</p>
      </section>
    `;
  }
  const tabs = [["all", t("tabs.all")], ["score", t("tabs.score")], ["doc", t("tabs.doc")]].map(([key, label]) => `
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
        <span class="muted small">${t("result.people", { n: result.contributions.length })} · <a href="${escapeHtml(result.repoUrl)}" target="_blank" rel="noopener">${t("result.github")}</a></span>
      </div>
      ${result.newlyAnalyzed != null ? `<p class="muted small">${t("notice.cached", { n: result.newlyAnalyzed })}</p>` : ""}
      <div class="tabs" role="group" aria-label="${t("tabs.label")}">${tabs}</div>
      ${body}
    </section>
  `;
}

function rankingView() {
  const rows = ranking.map((person) => `
    <tr>
      <td class="num">${person.rank}</td>
      <td><button type="button" class="link-button" data-person="${escapeHtml(person.code)}">${escapeHtml(pick(person.name))}</button></td>
      <td class="num score">${person.total}</td>
      <td class="num">${person.projects}</td>
    </tr>
  `).join("");
  return `
    ${pageHead(t("ranking.title"), t("ranking.lede"))}
    <div class="stack">
      <form class="inline-form" id="ranking-search" role="search">
        <input name="q" type="search" value="${escapeHtml(rankingQuery)}" placeholder="${t("ranking.search")}" aria-label="${t("ranking.search")}">
        <button type="submit" class="button">${t("ranking.find")}</button>
      </form>
      ${ranking.length
        ? `<div class="table-wrap" role="region" aria-label="${t("ranking.table")}" tabindex="0">
            <table>
              <thead><tr>
                <th class="num" scope="col">${t("th.rank")}</th>
                <th scope="col">${t("th.nickname")}</th>
                <th class="num" scope="col">${t("th.total")}</th>
                <th class="num" scope="col">${t("th.projects")}</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
        : `<p class="muted">${rankingQuery ? escapeHtml(t("ranking.none", { q: rankingQuery })) : t("ranking.empty")}</p>`}
    </div>
  `;
}

function personView() {
  const back = `<p><button type="button" class="link-button" id="back-ranking">${t("person.back")}</button></p>`;
  if (!personPage) return back + pageHead(t("person.notFound"), t("person.notFoundLede"));
  const { person, projects } = personPage;
  return `
    ${back}
    ${pageHead(pick(person.name), escapeHtml(t("person.meta", { r: person.rank, t: person.total, p: person.projects })))}
    <div class="stack">
      ${projects.map((project) => `
        <section class="section" aria-label="${escapeHtml(project.name)}">
          <div class="section-head">
            <h2>${escapeHtml(project.name)}</h2>
            <span class="muted small num">${t("person.project", { s: project.score, r: project.rank })}</span>
          </div>
          ${featureList(project.detail)}
        </section>
      `).join("")}
    </div>
  `;
}

function loginView() {
  return `
    ${pageHead(t("login.title"), t("login.lede"))}
    <div class="login-grid">
      <section class="section" aria-labelledby="login-title">
        <h2 id="login-title">${t("login.heading")}</h2>
        <form class="form-grid" id="login-form">
          <div class="field">
            <label for="login-username">${t("field.username")}</label>
            <input id="login-username" name="username" type="text" required autocomplete="username">
          </div>
          <div class="field">
            <label for="login-password">${t("field.password")}</label>
            <input id="login-password" name="password" type="password" required autocomplete="current-password">
          </div>
          <div><button type="submit" class="button button-primary">${t("login.submit")}</button></div>
          ${noticeLine("login")}
        </form>
      </section>
      <section class="section" aria-labelledby="register-title">
        <h2 id="register-title">${t("register.heading")}</h2>
        <form class="form-grid" id="register-form">
          <div class="field">
            <label for="register-username">${t("field.username")}</label>
            <input id="register-username" name="username" type="text" required autocomplete="username" aria-describedby="register-username-hint">
            <span class="hint" id="register-username-hint">${t("hint.username")}</span>
          </div>
          <div class="field">
            <label for="register-password">${t("field.password")}</label>
            <input id="register-password" name="password" type="password" required minlength="8" autocomplete="new-password" aria-describedby="register-password-hint">
            <span class="hint" id="register-password-hint">${t("hint.password")}</span>
          </div>
          <div><button type="submit" class="button">${t("register.submit")}</button></div>
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
      <p>${escapeHtml(t("github.connected", { l: me.githubLogin }))}</p>
      <div><button type="button" class="button" id="github-disconnect">${t("github.disconnect")}</button></div>
    `;
  } else if (!me.oauthReady) {
    body = `<p class="status status-fail">${t("github.noConfig")}</p>`;
  } else {
    body = `
      <p class="muted">${t("github.hint")}</p>
      <div><a class="button button-dark" href="/api/github/connect">${t("github.connect")}</a></div>
    `;
  }
  return `
    <section class="section" aria-labelledby="github-title">
      <h2 id="github-title">${t("github.title")}</h2>
      ${body}
      ${noticeLine("github")}
    </section>
  `;
}

function languageSection() {
  const option = (value, label) => `
    <label class="choice">
      <input type="radio" name="language" value="${value}" ${lang === value ? "checked" : ""}>
      <span>${label}</span>
    </label>
  `;
  return `
    <section class="section" aria-labelledby="language-title">
      <h2 id="language-title">${t("lang.title")}</h2>
      <fieldset class="choices">
        <legend class="small muted">${t("lang.legend")}</legend>
        ${option("ko", "한국어")}
        ${option("en", "English")}
      </fieldset>
      ${noticeLine("language")}
    </section>
  `;
}

function accountView() {
  const random = pick(me.randomNickname);
  const shownName = me.githubLogin ? (me.accountPublic ? me.nickname : random) : null;
  return `
    ${pageHead(t("account.title"), escapeHtml(t("account.lede", { u: me.username })))}
    <div class="stack">
      ${githubSection()}
      ${languageSection()}
      <section class="section" aria-labelledby="nickname-title">
        <h2 id="nickname-title">${t("nickname.title")}</h2>
        <p class="muted">${shownName ? escapeHtml(t("nickname.shown", { n: shownName })) : t("nickname.noGithub")}</p>
        <form class="form-grid" id="nickname-form">
          <div class="field">
            <label for="nickname-input">${t("nickname.title")}</label>
            <input id="nickname-input" name="nickname" type="text" required minlength="2" maxlength="20" value="${escapeHtml(me.nickname)}" aria-describedby="nickname-hint">
            <span class="hint" id="nickname-hint">${escapeHtml(t("nickname.hint"))}</span>
          </div>
          <div><button type="submit" class="button">${t("nickname.save")}</button></div>
          ${noticeLine("nickname")}
        </form>
      </section>
      <section class="section" aria-labelledby="visibility-title">
        <h2 id="visibility-title">${t("visibility.title")}</h2>
        <p><strong>${t("visibility.now", { s: me.accountPublic ? t("state.on") : t("state.off") })}</strong></p>
        <p class="muted">${escapeHtml(t("visibility.explain", { n: me.nickname, r: random ? ` "${random}"` : "" }))}</p>
        <div><button type="button" class="button" id="visibility" aria-pressed="${me.accountPublic ? "true" : "false"}">${me.accountPublic ? t("visibility.turnOff") : t("visibility.turnOn")}</button></div>
        ${noticeLine("visibility")}
      </section>
      <section class="section" aria-labelledby="password-title">
        <h2 id="password-title">${t("password.title")}</h2>
        <form class="form-grid" id="password-form">
          <div class="field">
            <label for="current-password">${t("field.current")}</label>
            <input id="current-password" name="currentPassword" type="password" required autocomplete="current-password">
          </div>
          <div class="field">
            <label for="new-password">${t("field.new")}</label>
            <input id="new-password" name="newPassword" type="password" required minlength="8" autocomplete="new-password" aria-describedby="new-password-hint">
            <span class="hint" id="new-password-hint">${t("hint.new")}</span>
          </div>
          <div><button type="submit" class="button">${t("password.submit")}</button></div>
          ${noticeLine("password")}
        </form>
      </section>
      <section class="section" aria-labelledby="session-title">
        <h2 id="session-title">${t("logout.title")}</h2>
        <div><button type="button" class="button" id="logout">${t("logout.button")}</button></div>
      </section>
      <section class="section section-danger" aria-labelledby="delete-title">
        <h2 id="delete-title">${t("delete.title")}</h2>
        <p class="muted">${t("delete.explain")}</p>
        <form class="form-grid" id="delete-form">
          <div class="field">
            <label for="delete-password">${t("field.confirmPassword")}</label>
            <input id="delete-password" name="password" type="password" required autocomplete="current-password">
          </div>
          <div><button type="submit" class="button button-danger">${t("delete.button")}</button></div>
          ${noticeLine("delete")}
        </form>
      </section>
    </div>
  `;
}

function repoPicker() {
  if (githubRepos === null) return `<p class="status status-busy">${t("repos.loading")}</p>`;
  const query = repoFilter.toLowerCase();
  const shown = githubRepos.filter((repo) => !query || repo.fullName.toLowerCase().includes(query)).slice(0, 50);
  const rows = shown.map((repo) => `
    <li>
      <div class="row-main">
        <span class="row-title">${escapeHtml(repo.fullName)} <span class="tag">${t(`source.${repo.source}`)}</span>${repo.fork ? ` <span class="tag">${t("source.fork")}</span>` : ""}</span>
        ${repo.description ? `<span class="muted small">${escapeHtml(repo.description)}</span>` : ""}
      </div>
      ${repo.added
        ? `<span class="muted small">${t("repos.added")}</span>`
        : `<button type="button" class="button button-small" data-add-repo="${escapeHtml(repo.url)}" aria-label="${escapeHtml(t("repos.addLabel", { n: repo.fullName }))}">${t("repos.add")}</button>`}
    </li>
  `).join("");
  return `
    ${githubRepos.length
      ? `<div class="field">
          <label for="repo-filter">${t("repos.label", { n: githubRepos.length })}</label>
          <input type="search" id="repo-filter" value="${escapeHtml(repoFilter)}" placeholder="${t("repos.filter")}">
        </div>
        ${shown.length ? `<ul class="row-list">${rows}</ul>` : `<p class="muted">${t("repos.none")}</p>`}`
      : `<p class="muted">${t("repos.empty")}</p>`}
    <details class="manual-add">
      <summary>${t("repos.manual")}</summary>
      ${urlForm("projects-judge-form", t("repos.submit"))}
    </details>
  `;
}

function projectDetail(project) {
  const mine = project.me;
  return `
    <section class="stack" aria-labelledby="project-title">
      <div class="section-head">
        <h2 id="project-title">${escapeHtml(project.name)}</h2>
        <a class="small" href="${escapeHtml(project.repoUrl)}" target="_blank" rel="noopener">${t("result.github")}</a>
      </div>
      <div class="actions">
        <button type="button" class="button button-primary" id="rejudge">${t("detail.rejudge")}</button>
        <button type="button" class="button" id="close-project">${t("detail.close")}</button>
      </div>
      ${noticeLine("project")}
      ${project.failureCode ? `<p class="status status-fail">${escapeHtml(t("detail.lastFail", { r: errorText(project.failureCode) }))}</p>` : ""}
      ${mine
        ? `<section class="section" aria-labelledby="mine-title">
            <h3 id="mine-title">${t("detail.mine")}</h3>
            <div class="score-summary">
              <span class="score-big">${mine.score}</span>
              <span class="muted num">${t("detail.rank", { r: mine.rank, n: project.peopleCount })}</span>
              ${agentTags(mine.detail)}
            </div>
            ${featureList(mine.detail)}
            ${evidence(mine.detail)}
          </section>`
        : `<p class="muted">${t("detail.noRecord")}</p>`}
      ${docs(project)}
      <section class="section" aria-labelledby="project-settings-title">
        <h3 id="project-settings-title">${t("settings.title")}</h3>
        <div class="setting-row">
          <div class="setting-text">
            <p><strong>${t("share.label")}</strong> · ${t("visibility.now", { s: project.shared ? t("state.on") : t("state.off") })}</p>
            <p class="muted small">${t("share.explain")}</p>
          </div>
          <button type="button" class="button" id="share-project" aria-pressed="${project.shared ? "true" : "false"}">${project.shared ? t("share.off") : t("share.on")}</button>
        </div>
        ${noticeLine("share")}
        <div class="setting-row">
          <div class="setting-text">
            <p><strong>${t("remove.label")}</strong></p>
            <p class="muted small">${t("remove.explain")}</p>
          </div>
          <button type="button" class="button button-danger" id="remove-project">${t("remove.label")}</button>
        </div>
      </section>
    </section>
  `;
}

function projectsView() {
  if (!me.githubLogin) {
    return `
      ${pageHead(t("projects.title"), t("projects.needGithubLede"))}
      <section class="section">
        <p>${t("projects.needGithub")}</p>
        <div><button type="button" class="button button-primary" id="to-account">${t("projects.toAccount")}</button></div>
      </section>
    `;
  }
  const opened = myProjects.find((project) => project.repoId === openedRepoId) || null;
  const list = myProjects.length
    ? `<ul class="project-nav">${myProjects.map((project) => `
        <li>
          <button type="button" data-open="${project.repoId}" aria-current="${project.repoId === openedRepoId ? "true" : "false"}">
            <span>${escapeHtml(project.name)}${project.shared ? "" : ` <span class="tag">${t("projects.private")}</span>`}</span>
            <span class="num">${project.me ? t("projects.points", { n: project.me.score }) : "-"}</span>
          </button>
        </li>
      `).join("")}</ul>`
    : `<p class="muted small">${t("projects.empty")}</p>`;
  const main = opened
    ? projectDetail(opened)
    : `
      <section class="stack" aria-labelledby="add-title">
        <h2 id="add-title">${t("add.title")}</h2>
        <p class="muted small">${escapeHtml(t("add.explain", { l: me.githubLogin }))}</p>
        ${noticeLine("projects")}
        ${privacyNotice()}
        ${repoPicker()}
      </section>
    `;
  return `
    ${pageHead(t("projects.title"), escapeHtml(t("projects.lede", { l: me.githubLogin })))}
    <div class="projects-layout">
      <nav aria-label="${t("projects.navLabel")}">
        <h2 class="nav-title">${t("projects.listTitle", { n: myProjects.length })}</h2>
        ${list}
        ${opened ? `<p class="nav-after"><button type="button" class="link-button small" id="show-add">${t("projects.showAdd")}</button></p>` : ""}
      </nav>
      <div>${main}</div>
    </div>
  `;
}

function serverDownView() {
  return `
    ${pageHead(t("server.title"), "")}
    <section class="section">
      <p>${t("server.body")}</p>
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
    headers: { "Content-Type": "application/json", "X-Lang": lang },
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (typeof payload.judgesLeft === "number") judgesLeft = payload.judgesLeft;
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
    busy("main", t("busy.judge"));
    try {
      const { response, payload } = await api("/api/judge", { method: "POST", body: JSON.stringify({ url }) });
      notices = {};
      if (response.status === 429 || response.status === 400) {
        setNotice("main", payload.failureReason || errorText(payload.failureCode), false);
      } else {
        result = payload;
        tab = "all";
      }
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
  const body = { ...Object.fromEntries(new FormData(event.currentTarget).entries()), language: lang };
  const { response, payload } = await api(path, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) {
    const line = document.querySelector(`#status-${key}`);
    line.className = "status status-fail";
    line.setAttribute("role", "alert");
    line.textContent = payload.failureReason || t("login.failed");
    return;
  }
  me = payload.user;
  if (me.language && me.language !== lang) setLanguage(me.language);
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

  const addRepo = async (url) => {
    busy("projects", t("busy.judge"));
    const { payload } = await api("/api/my/projects", { method: "POST", body: JSON.stringify({ url }) });
    await loadMyProjects();
    notices = {};
    if (payload.ok && payload.project) {
      openedRepoId = payload.project.repoId;
      setNotice("project", t("add.done"), true);
      githubRepos = (githubRepos || []).map((repo) => (repo.url.toLowerCase() === payload.project.repoUrl.toLowerCase() ? { ...repo, added: true } : repo));
    } else {
      setNotice("projects", payload.failureReason || errorText(payload.failureCode, t("add.failed")), false);
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
    busy("project", t("rejudge.busy"));
    const { payload } = await api(`/api/my/projects/${openedRepoId}/rejudge`, { method: "POST" });
    await loadMyProjects();
    notices = {};
    if (payload.ok) setNotice("project", `${t("rejudge.done")} ${t("notice.cached", { n: payload.newlyAnalyzed || 0 })}`, true);
    else setNotice("project", t("rejudge.failed", { r: payload.failureReason || errorText(payload.failureCode) }), false);
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
      setNotice("share", payload.project.shared ? t("share.savedOn") : t("share.savedOff"), true);
    } else {
      setNotice("share", payload.failureReason || t("generic.failed"), false);
    }
    render();
    document.querySelector("#share-project").focus();
  });
  document.querySelector("#remove-project").addEventListener("click", async () => {
    if (!window.confirm(t("remove.confirm"))) return;
    await api(`/api/my/projects/${openedRepoId}`, { method: "DELETE" });
    openedRepoId = null;
    await loadMyProjects();
    notices = {};
    setNotice("projects", t("remove.done"), true);
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
      accountNotice("github", t("github.disconnected"), true);
    });
  }

  document.querySelectorAll("input[name='language']").forEach((input) => {
    input.addEventListener("change", async () => {
      const { response, payload } = await api("/api/account/language", {
        method: "POST",
        body: JSON.stringify({ language: input.value }),
      });
      if (!response.ok) return accountNotice("language", payload.failureReason || t("generic.failed"), false);
      me = payload.user;
      setLanguage(me.language);
      accountNotice("language", t("lang.saved"), true);
      document.querySelector(`input[name='language'][value='${lang}']`).focus();
    });
  });

  document.querySelector("#nickname-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = new FormData(event.currentTarget).get("nickname");
    const { response, payload } = await api("/api/account/nickname", { method: "POST", body: JSON.stringify({ nickname }) });
    if (!response.ok) return accountNotice("nickname", payload.failureReason || t("generic.failed"), false);
    me = payload.user;
    accountNotice("nickname", t("nickname.saved"), true);
  });

  document.querySelector("#visibility").addEventListener("click", async () => {
    const { response, payload } = await api("/api/account/visibility", {
      method: "POST",
      body: JSON.stringify({ accountPublic: !me.accountPublic }),
    });
    if (!response.ok) return accountNotice("visibility", payload.failureReason || t("generic.failed"), false);
    me = payload.user;
    accountNotice("visibility", me.accountPublic ? t("visibility.savedOn") : t("visibility.savedOff"), true);
  });

  document.querySelector("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const { response, payload } = await api("/api/account/password", { method: "POST", body: JSON.stringify(body) });
    if (!response.ok) return accountNotice("password", payload.failureReason || t("generic.failed"), false);
    accountNotice("password", t("password.saved"), true);
  });

  document.querySelector("#delete-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.confirm(t("delete.confirm"))) return;
    const password = new FormData(event.currentTarget).get("password");
    const { response, payload } = await api("/api/account/delete", { method: "POST", body: JSON.stringify({ password }) });
    if (!response.ok) return accountNotice("delete", payload.failureReason || t("generic.failed"), false);
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
  setLanguage(initialLanguage());
  try {
    const meResponse = await fetch("/api/me", { headers: { "X-Lang": lang } });
    if (!meResponse.ok) throw new Error("no api");
    const payload = await meResponse.json();
    me = payload.user;
    judgesPerHour = payload.judgesPerHour || judgesPerHour;
  } catch {
    me = null;
    serverDown = true;
    render();
    return;
  }
  if (me && me.language && me.language !== lang) setLanguage(me.language);
  manageOpen = Boolean(me);
  const githubResult = new URLSearchParams(window.location.search).get("github");
  if (githubResult) {
    window.history.replaceState(null, "", "/");
    await go(me ? "account" : "login");
    const key = `githubNotice.${githubResult}`;
    if (STRINGS.ko[key]) {
      setNotice(me ? "github" : "login", t(key), githubResult === "linked");
      render();
    }
    return;
  }
  render();
}

start();
