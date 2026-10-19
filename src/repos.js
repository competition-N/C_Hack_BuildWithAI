function readPeople(db, repoId) {
  return db.prepare(`
    SELECT github_login, score, rank, work, detail
    FROM repo_people
    WHERE repo_id = ?
    ORDER BY rank
  `).all(repoId).map((row) => ({
    author: row.github_login,
    score: row.score,
    rank: row.rank,
    work: JSON.parse(row.work),
    detail: row.detail ? JSON.parse(row.detail) : null,
  }));
}

function repoView(db, row) {
  if (!row) return null;
  return {
    id: row.id,
    repoUrl: row.repo_url,
    name: row.name,
    status: row.status,
    failureReason: row.failure_reason,
    techSummary: row.tech_summary,
    difficulty: row.difficulty,
    algorithms: row.algorithms,
    features: row.features,
    updatedAt: row.updated_at,
    contributions: readPeople(db, row.id),
  };
}

function findRepo(db, repoUrl) {
  return db.prepare("SELECT * FROM repos WHERE repo_url = ?").get(repoUrl);
}

function saveRepo(db, result) {
  const now = new Date().toISOString();
  const save = db.transaction(() => {
    const existing = findRepo(db, result.repoUrl);
    let repoId;
    if (existing) {
      db.prepare(`
        UPDATE repos
        SET repo_url = ?, name = ?, status = '완료', failure_reason = NULL,
            tech_summary = ?, difficulty = ?, algorithms = ?, features = ?, updated_at = ?
        WHERE id = ?
      `).run(result.repoUrl, result.name, result.techSummary, result.difficulty, result.algorithms, result.features, now, existing.id);
      repoId = existing.id;
    } else {
      repoId = db.prepare(`
        INSERT INTO repos (repo_url, name, status, tech_summary, difficulty, algorithms, features, updated_at)
        VALUES (?, ?, '완료', ?, ?, ?, ?, ?)
      `).run(result.repoUrl, result.name, result.techSummary, result.difficulty, result.algorithms, result.features, now).lastInsertRowid;
    }
    db.prepare("DELETE FROM repo_people WHERE repo_id = ?").run(repoId);
    const insert = db.prepare(`
      INSERT INTO repo_people (repo_id, github_login, score, rank, work, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const person of result.people) {
      insert.run(repoId, person.author, person.score, person.rank, JSON.stringify(person.work), JSON.stringify(person.detail));
    }
    return repoId;
  });
  const repoId = save();
  return repoView(db, db.prepare("SELECT * FROM repos WHERE id = ?").get(repoId));
}

function markRepoFailure(db, repoUrl, reason) {
  const existing = findRepo(db, repoUrl);
  if (!existing) return null;
  db.prepare("UPDATE repos SET failure_reason = ?, updated_at = ? WHERE id = ?")
    .run(reason, new Date().toISOString(), existing.id);
  return repoView(db, db.prepare("SELECT * FROM repos WHERE id = ?").get(existing.id));
}

function rankingRows(db) {
  return db.prepare(`
    SELECT min(repo_people.github_login) AS login, sum(repo_people.score) AS total, count(*) AS projects
    FROM repo_people
    JOIN repos ON repos.id = repo_people.repo_id
    WHERE repos.status = '완료' AND coalesce(json_extract(repo_people.detail, '$.isAgent'), 0) = 0
    GROUP BY lower(repo_people.github_login)
    ORDER BY total DESC, lower(login)
  `).all();
}

function personProjects(db, login) {
  return db.prepare(`
    SELECT repos.id, repos.name, repos.repo_url, repos.updated_at, repo_people.score, repo_people.rank,
           repo_people.work, repo_people.detail
    FROM repo_people
    JOIN repos ON repos.id = repo_people.repo_id
    WHERE repos.status = '완료' AND repo_people.github_login = ?
    ORDER BY repo_people.score DESC
  `).all(login).map((row) => ({
    repoId: row.id,
    name: row.name,
    repoUrl: row.repo_url,
    updatedAt: row.updated_at,
    score: row.score,
    rank: row.rank,
    work: JSON.parse(row.work),
    detail: row.detail ? JSON.parse(row.detail) : null,
  }));
}

function myRow(db, repoId, login) {
  const row = db.prepare(`
    SELECT score, rank, work, detail FROM repo_people WHERE repo_id = ? AND github_login = ?
  `).get(repoId, login);
  if (!row) return null;
  return { score: row.score, rank: row.rank, work: JSON.parse(row.work), detail: row.detail ? JSON.parse(row.detail) : null };
}

function userProjects(db, userId, login) {
  return db.prepare(`
    SELECT repos.* FROM user_projects
    JOIN repos ON repos.id = user_projects.repo_id
    WHERE user_projects.user_id = ?
    ORDER BY repos.updated_at DESC
  `).all(userId).map((row) => ({
    repoId: row.id,
    name: row.name,
    repoUrl: row.repo_url,
    status: row.status,
    failureReason: row.failure_reason,
    updatedAt: row.updated_at,
    peopleCount: db.prepare("SELECT count(*) AS n FROM repo_people WHERE repo_id = ?").get(row.id).n,
    me: login ? myRow(db, row.id, login) : null,
  }));
}

function addUserProject(db, userId, repoId) {
  db.prepare("INSERT OR IGNORE INTO user_projects (user_id, repo_id, created_at) VALUES (?, ?, ?)")
    .run(userId, repoId, new Date().toISOString());
}

function ownsProject(db, userId, repoId) {
  return Boolean(db.prepare("SELECT 1 FROM user_projects WHERE user_id = ? AND repo_id = ?").get(userId, repoId));
}

function removeUserProject(db, userId, repoId) {
  return db.prepare("DELETE FROM user_projects WHERE user_id = ? AND repo_id = ?").run(userId, repoId).changes > 0;
}

module.exports = {
  saveRepo,
  markRepoFailure,
  rankingRows,
  personProjects,
  myRow,
  userProjects,
  addUserProject,
  ownsProject,
  removeUserProject,
};
