function analyzedCommitsOf(person, analysis) {
  return person.analyzable
    ? person.listed.map((commit) => analysis.get(commit.sha)).filter(Boolean)
    : [];
}

function featuresFor(analyzed) {
  const groups = new Map();
  for (const row of analyzed) {
    const key = `${row.featureKo}\u0000${row.tech}`;
    if (!groups.has(key)) {
      groups.set(key, { nameKo: row.featureKo, nameEn: row.featureEn, tech: row.tech, commits: 0, points: 0, kind: "code" });
    }
    const group = groups.get(key);
    group.commits += 1;
    group.points += row.difficulty;
  }
  return [...groups.values()]
    .map((group) => ({ ...group, difficulty: Math.max(1, Math.round(group.points / group.commits)) }))
    .sort((a, b) => b.points - a.points);
}

function scorePeople(people, analysis) {
  return people
    .map((person) => {
      const analyzed = analyzedCommitsOf(person, analysis);
      const features = featuresFor(analyzed);
      const score = features.reduce((sum, feature) => sum + feature.points, 0);
      const analyzedCommits = analyzed.length;
      const unmergedPrs = person.prsOpened - person.prsMerged;
      const codeWork = features.map((feature) => feature.nameKo);
      let work = codeWork.length ? codeWork : person.messages.slice(0, 5);
      if (!work.length) work = [unmergedPrs > 0 ? `합쳐지지 않은 PR ${unmergedPrs}건` : "기록된 커밋 없음"];
      return {
        author: person.author,
        score,
        work,
        detail: {
          isAgent: person.isAgent,
          workSource: analyzedCommits ? "code" : "commits",
          features,
          analyzedCommits,
          unreadCommits: Math.max(0, person.commits - analyzedCommits),
          commits: person.commits,
          agentCommits: person.agentCommits,
          agentLogins: person.agentLogins,
          prsOpened: person.prsOpened,
          prsMerged: person.prsMerged,
          additions: person.additions,
          deletions: person.deletions,
          filesChanged: person.filesChanged,
          sampledCommits: person.sampledCommits,
        },
      };
    })
    .sort((a, b) => b.score - a.score || a.author.localeCompare(b.author))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

module.exports = { scorePeople };
