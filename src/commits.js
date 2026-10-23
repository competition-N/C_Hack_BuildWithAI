function commitAnalysisReader(db) {
  const statement = db.prepare(`
    SELECT feature_ko, feature_en, tech, difficulty, lines, doc_only FROM commit_analysis WHERE sha = ?
  `);
  const cache = new Map();
  const read = (sha) => {
    if (!cache.has(sha)) {
      const row = statement.get(sha);
      cache.set(sha, row
        ? {
          featureKo: row.feature_ko,
          featureEn: row.feature_en,
          tech: row.tech,
          difficulty: row.difficulty,
          lines: row.lines,
          docOnly: row.doc_only == null ? null : Boolean(row.doc_only),
        }
        : null);
    }
    return cache.get(sha);
  };
  return {
    get: read,
    has: (sha) => Boolean(read(sha)),
    remember: (sha, value) => cache.set(sha, value),
  };
}

function saveCommitAnalysis(db, rows, model) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO commit_analysis
      (sha, github_login, feature_ko, feature_en, tech, difficulty, lines, doc_only, model, analyzed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const row of rows) {
      const docOnly = row.docOnly == null ? null : Number(row.docOnly);
      insert.run(row.sha, row.login, row.featureKo, row.featureEn, row.tech, row.difficulty, row.lines, docOnly, model, now);
    }
  })();
}

module.exports = { commitAnalysisReader, saveCommitAnalysis };
