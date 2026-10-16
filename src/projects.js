function mapProject(row, contributions) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    repoUrl: row.repo_url,
    name: row.name,
    status: row.status,
    failureReason: row.failure_reason,
    shared: Boolean(row.shared),
    connectionOk: Boolean(row.connection_ok),
    techSummary: row.tech_summary,
    difficulty: row.difficulty,
    algorithms: row.algorithms,
    updatedAt: row.updated_at,
    contributions: contributions || [],
  };
}

function readContributions(db, projectId) {
  return db.prepare(`
    SELECT author, score, rank, work
    FROM contributions
    WHERE project_id = ?
    ORDER BY rank
  `).all(projectId).map((row) => ({
    author: row.author,
    score: row.score,
    rank: row.rank,
    work: JSON.parse(row.work),
  }));
}

function findOwned(db, userId, repoUrl) {
  if (userId == null) {
    return db.prepare("SELECT * FROM projects WHERE user_id IS NULL AND repo_url = ?").get(repoUrl);
  }
  return db.prepare("SELECT * FROM projects WHERE user_id = ? AND repo_url = ?").get(userId, repoUrl);
}

function replaceContributions(db, projectId, contributions) {
  db.prepare("DELETE FROM contributions WHERE project_id = ?").run(projectId);
  const insert = db.prepare(`
    INSERT INTO contributions (project_id, author, score, rank, work)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of contributions || []) {
    insert.run(projectId, row.author, row.score, row.rank, JSON.stringify(row.work || []));
  }
}

function saveJudgment(db, { userId, result }) {
  const now = new Date().toISOString();
  const existing = result.repoUrl ? findOwned(db, userId, result.repoUrl) : null;
  if (!result.ok) {
    if (existing && existing.status === "완료") {
      db.prepare("UPDATE projects SET failure_reason = ?, updated_at = ? WHERE id = ?")
        .run(result.failureReason, now, existing.id);
      return mapProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(existing.id), readContributions(db, existing.id));
    }
    if (existing) {
      db.prepare("UPDATE projects SET status = '실패', failure_reason = ?, connection_ok = 0, updated_at = ? WHERE id = ?")
        .run(result.failureReason, now, existing.id);
      return mapProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(existing.id), []);
    }
    const info = db.prepare(`
      INSERT INTO projects (user_id, repo_url, name, status, failure_reason, connection_ok, updated_at)
      VALUES (?, ?, ?, '실패', ?, 0, ?)
    `).run(userId, result.repoUrl || "", result.name || "", result.failureReason, now);
    return mapProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(info.lastInsertRowid), []);
  }

  if (existing) {
    db.prepare(`
      UPDATE projects
      SET name = ?, status = '완료', failure_reason = NULL, connection_ok = 1,
          tech_summary = ?, difficulty = ?, algorithms = ?, updated_at = ?
      WHERE id = ?
    `).run(result.name, result.techSummary, result.difficulty, result.algorithms, now, existing.id);
    replaceContributions(db, existing.id, result.contributions);
    return mapProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(existing.id), readContributions(db, existing.id));
  }

  const info = db.prepare(`
    INSERT INTO projects (
      user_id, repo_url, name, status, shared, connection_ok,
      tech_summary, difficulty, algorithms, updated_at
    ) VALUES (?, ?, ?, '완료', 0, 1, ?, ?, ?, ?)
  `).run(userId, result.repoUrl, result.name, result.techSummary, result.difficulty, result.algorithms, now);
  replaceContributions(db, info.lastInsertRowid, result.contributions);
  return mapProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(info.lastInsertRowid), readContributions(db, info.lastInsertRowid));
}

function listForUser(db, userId) {
  return db.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC").all(userId)
    .map((row) => mapProject(row, readContributions(db, row.id)));
}

function latest(db, userId) {
  const row = userId == null
    ? db.prepare("SELECT * FROM projects WHERE user_id IS NULL ORDER BY updated_at DESC LIMIT 1").get()
    : db.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(userId);
  if (!row) return null;
  return mapProject(row, readContributions(db, row.id));
}

function listShared(db) {
  return db.prepare("SELECT * FROM projects WHERE shared = 1 AND status = '완료' ORDER BY updated_at DESC").all()
    .map((row) => mapProject(row, readContributions(db, row.id)));
}

function setShared(db, projectId, userId, shared) {
  const row = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(projectId, userId);
  if (!row) return null;
  db.prepare("UPDATE projects SET shared = ?, updated_at = ? WHERE id = ?")
    .run(shared ? 1 : 0, new Date().toISOString(), projectId);
  return mapProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId), readContributions(db, projectId));
}

function removeProject(db, projectId, userId) {
  const row = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(projectId, userId);
  if (!row) return false;
  db.prepare("DELETE FROM contributions WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  return true;
}

module.exports = { saveJudgment, listForUser, latest, listShared, setShared, removeProject };
