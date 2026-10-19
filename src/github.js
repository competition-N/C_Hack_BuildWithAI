const AGENT_LOGIN = /^(cursoragent|copilot.*|claude.*|codex.*|devin.*|openhands.*|sweep.*)$|\[bot\]$/i;
const SAMPLED_PEOPLE = 6;
const LISTED_PER_PERSON = 40;
const SAMPLES_PER_PERSON = 3;
const FILES_PER_SAMPLE = 4;
const PATCH_CHARS = 250;

function parseRepoUrl(input) {
  const trimmed = String(input || "")
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const match = trimmed.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function github(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "team-contribution",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(`https://api.github.com${path}`, { headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const error = new Error(body && body.message ? body.message : `GitHub ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function isAgent(login, type) {
  return type === "Bot" || AGENT_LOGIN.test(String(login || ""));
}

function firstLine(message) {
  return String(message || "").split("\n")[0].trim();
}

function coAuthors(message) {
  return [...String(message || "").matchAll(/^co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/gim)]
    .map((match) => ({ name: match[1].trim(), email: match[2].trim().toLowerCase() }));
}

function loginFromCoAuthor(coAuthor, knownLogins) {
  const noreply = coAuthor.email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  const candidates = [noreply && noreply[1], coAuthor.name, coAuthor.email.split("@")[0]].filter(Boolean);
  for (const candidate of candidates) {
    const hit = knownLogins.find((login) => login.toLowerCase() === candidate.toLowerCase());
    if (hit) return hit;
  }
  return noreply ? noreply[1] : null;
}

function humanFor(commit, knownLogins) {
  const login = commit.author && commit.author.login;
  if (login && !isAgent(login, commit.author.type)) return { login, viaAgent: null };
  for (const coAuthor of coAuthors(commit.commit && commit.commit.message)) {
    const human = loginFromCoAuthor(coAuthor, knownLogins);
    if (human && !isAgent(human)) return { login: human, viaAgent: login || "agent" };
  }
  return login ? { login, viaAgent: null } : null;
}

function decodeReadme(payload) {
  if (!payload || !payload.content) return "";
  return Buffer.from(payload.content, "base64").toString("utf8");
}

async function inspectRepo(url) {
  const parsed = parseRepoUrl(url);
  if (!parsed) {
    return {
      ok: false,
      status: "실패",
      failureReason: "주소는 https://github.com/소유자/저장소 형태여야 합니다.",
    };
  }
  const base = `/repos/${parsed.owner}/${parsed.repo}`;
  try {
    const [repo, contributors, languages, readme, commits, pulls, contents] = await Promise.all([
      github(base),
      github(`${base}/contributors?per_page=100`),
      github(`${base}/languages`),
      github(`${base}/readme`).catch(() => null),
      github(`${base}/commits?per_page=100`),
      github(`${base}/pulls?state=all&per_page=100`),
      github(`${base}/contents`).catch(() => []),
    ]);

    const people = new Map();
    const ensure = (login) => {
      if (!people.has(login)) {
        people.set(login, {
          author: login,
          isAgent: isAgent(login),
          commits: 0,
          agentCommits: 0,
          agentLogins: new Set(),
          prsOpened: 0,
          prsMerged: 0,
          additions: 0,
          deletions: 0,
          files: new Set(),
          listed: [],
          seen: new Set(),
          samples: [],
          messages: [],
        });
      }
      return people.get(login);
    };
    const list = (row, commit, viaAgent) => {
      if (row.seen.has(commit.sha) || row.listed.length >= LISTED_PER_PERSON) return;
      const message = firstLine(commit.commit && commit.commit.message);
      if (!message) return;
      row.seen.add(commit.sha);
      row.listed.push({ sha: commit.sha, message, viaAgent });
      if (row.messages.length < 5) row.messages.push(message);
    };

    const knownLogins = [
      ...(contributors || []).map((person) => person.login),
      ...(pulls || []).map((pull) => pull.user && pull.user.login),
    ].filter((login) => login && !isAgent(login));

    const agents = [];
    for (const person of contributors || []) {
      if (!person.login) continue;
      if (isAgent(person.login, person.type)) agents.push(person);
      else ensure(person.login).commits += person.contributions || 0;
    }

    for (const agent of agents.slice(0, 3)) {
      const authored = await github(`${base}/commits?author=${encodeURIComponent(agent.login)}&per_page=100`).catch(() => []);
      let attributed = 0;
      for (const commit of authored || []) {
        const owner = humanFor(commit, knownLogins);
        if (!owner || !owner.viaAgent) continue;
        const row = ensure(owner.login);
        row.commits += 1;
        row.agentCommits += 1;
        row.agentLogins.add(agent.login);
        list(row, commit, agent.login);
        attributed += 1;
      }
      const remaining = (agent.contributions || 0) - attributed;
      if (remaining > 0) ensure(agent.login).commits += remaining;
    }

    for (const pull of pulls || []) {
      const login = pull.user && pull.user.login;
      if (!login) continue;
      const row = ensure(login);
      row.prsOpened += 1;
      if (pull.merged_at) row.prsMerged += 1;
    }

    for (const commit of commits || []) {
      if (commit.parents && commit.parents.length > 1) continue;
      const owner = humanFor(commit, knownLogins);
      if (!owner) continue;
      list(ensure(owner.login), commit, owner.viaAgent);
    }

    const ranked = [...people.values()]
      .filter((row) => !row.isAgent && row.commits > 0)
      .sort((a, b) => b.commits - a.commits)
      .slice(0, SAMPLED_PEOPLE);

    await Promise.all(ranked
      .filter((row) => row.listed.length < Math.min(row.commits, LISTED_PER_PERSON))
      .map(async (row) => {
        const authored = await github(`${base}/commits?author=${encodeURIComponent(row.author)}&per_page=${LISTED_PER_PERSON}`).catch(() => []);
        for (const commit of authored || []) {
          if (commit.parents && commit.parents.length > 1) continue;
          list(row, commit, null);
        }
      }));

    for (const row of ranked) {
      row.samples = row.listed.slice(0, SAMPLES_PER_PERSON).map((item) => ({ ...item }));
    }

    await Promise.all(ranked.flatMap((row) => row.samples.map(async (sample) => {
      try {
        const detail = await github(`${base}/commits/${sample.sha}`);
        sample.files = (detail.files || []).slice(0, FILES_PER_SAMPLE).map((file) => ({
          name: file.filename,
          add: file.additions,
          del: file.deletions,
          patch: String(file.patch || "").slice(0, PATCH_CHARS),
        }));
        row.additions += (detail.stats && detail.stats.additions) || 0;
        row.deletions += (detail.stats && detail.stats.deletions) || 0;
        for (const file of detail.files || []) row.files.add(file.filename);
      } catch {
        sample.files = [];
      }
    })));

    const contributions = [...people.values()].map((row) => ({
      author: row.author,
      isAgent: row.isAgent,
      commits: row.commits,
      agentCommits: row.agentCommits,
      agentLogins: [...row.agentLogins],
      prsOpened: row.prsOpened,
      prsMerged: row.prsMerged,
      additions: row.additions,
      deletions: row.deletions,
      filesChanged: row.files.size,
      sampledCommits: row.samples.filter((sample) => sample.files && sample.files.length).length,
      messages: row.messages,
      listed: row.listed.map(({ sha, message }) => ({ sha, message })),
      samples: row.samples,
      analyzable: ranked.includes(row),
    }));

    const fileNames = Array.isArray(contents) ? contents.map((item) => item.name).filter(Boolean) : [];
    const recentWork = (commits || [])
      .filter((commit) => !(commit.parents && commit.parents.length > 1))
      .slice(0, 40)
      .map((commit) => firstLine(commit.commit && commit.commit.message))
      .filter(Boolean);

    return {
      ok: true,
      status: "완료",
      repoUrl: repo.html_url,
      owner: parsed.owner,
      name: repo.name,
      contributions,
      readme: decodeReadme(readme),
      languages: Object.keys(languages || {}),
      files: fileNames,
      recentWork,
      connectionOk: true,
    };
  } catch (error) {
    return {
      ok: false,
      status: "실패",
      repoUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
      owner: parsed.owner,
      name: parsed.repo,
      failureReason: error.message || "GitHub 요청이 거절되었습니다.",
      connectionOk: false,
    };
  }
}

async function listUserRepos(login) {
  const user = encodeURIComponent(login);
  const [owned, searched] = await Promise.all([
    github(`/users/${user}/repos?type=all&sort=pushed&per_page=100`).catch(() => []),
    github(`/search/commits?q=${encodeURIComponent(`author:${login}`)}&sort=author-date&order=desc&per_page=100`)
      .catch(() => ({ items: [] })),
  ]);
  const repos = new Map();
  for (const repo of owned || []) {
    if (repo.private) continue;
    repos.set(repo.full_name.toLowerCase(), {
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description || "",
      pushedAt: repo.pushed_at,
      fork: Boolean(repo.fork),
      source: repo.owner && repo.owner.login.toLowerCase() === login.toLowerCase() ? "own" : "member",
    });
  }
  for (const item of (searched && searched.items) || []) {
    const repo = item.repository;
    if (!repo || repo.private || repos.has(repo.full_name.toLowerCase())) continue;
    repos.set(repo.full_name.toLowerCase(), {
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description || "",
      pushedAt: item.commit && item.commit.author ? item.commit.author.date : null,
      fork: Boolean(repo.fork),
      source: "contributed",
    });
  }
  return [...repos.values()].sort((a, b) => String(b.pushedAt || "").localeCompare(String(a.pushedAt || "")));
}

module.exports = { parseRepoUrl, inspectRepo, listUserRepos };
