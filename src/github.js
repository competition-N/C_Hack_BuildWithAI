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

function buildRanking(contributors, pulls, commits) {
  const people = new Map();
  function ensure(login) {
    if (!people.has(login)) {
      people.set(login, { author: login, commits: 0, prs: 0, work: [] });
    }
    return people.get(login);
  }
  for (const person of contributors || []) {
    if (!person.login) continue;
    ensure(person.login).commits = person.contributions || 0;
  }
  for (const pull of pulls || []) {
    const login = pull.user && pull.user.login;
    if (!login) continue;
    ensure(login).prs += 1;
  }
  for (const commit of commits || []) {
    const login = commit.author && commit.author.login;
    const message = commit.commit && commit.commit.message
      ? commit.commit.message.split("\n")[0]
      : "";
    if (!login || !message) continue;
    const row = ensure(login);
    if (row.work.length < 5) row.work.push(message);
  }
  return [...people.values()]
    .map((row) => ({
      author: row.author,
      score: row.commits + row.prs,
      work: row.work,
    }))
    .sort((a, b) => b.score - a.score || a.author.localeCompare(b.author))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function decodeReadme(payload) {
  if (!payload || !payload.content) return "";
  return Buffer.from(payload.content, "base64").toString("utf8");
}

async function fillMissingWork(owner, repo, contributions) {
  const missing = contributions.filter((row) => row.work.length === 0);
  await Promise.all(missing.slice(0, 8).map(async (row) => {
    try {
      const authored = await github(
        `/repos/${owner}/${repo}/commits?author=${encodeURIComponent(row.author)}&per_page=5`
      );
      row.work = (authored || [])
        .map((commit) => (commit.commit && commit.commit.message ? commit.commit.message.split("\n")[0] : ""))
        .filter(Boolean);
      if (!row.work.length) row.work = [`기록된 기여 ${row.score}건`];
    } catch {
      row.work = [`기록된 기여 ${row.score}건`];
    }
  }));
  for (const row of contributions) {
    if (!row.work.length) row.work = [`기록된 기여 ${row.score}건`];
  }
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
      github(`${base}/commits?per_page=30`),
      github(`${base}/pulls?state=all&per_page=100`),
      github(`${base}/contents`).catch(() => []),
    ]);
    const files = Array.isArray(contents) ? contents.map((item) => item.name).filter(Boolean) : [];
    const contributions = buildRanking(contributors, pulls, commits);
    await fillMissingWork(parsed.owner, parsed.repo, contributions);
    return {
      ok: true,
      status: "완료",
      repoUrl: repo.html_url,
      owner: parsed.owner,
      name: repo.name,
      contributions,
      readme: decodeReadme(readme),
      languages: Object.keys(languages || {}),
      files,
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

module.exports = { parseRepoUrl, inspectRepo };
