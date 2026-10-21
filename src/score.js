const NOT_ANALYZED = { nameKo: "난이도 분석 안 됨", nameEn: "Difficulty not analyzed" };
const NOT_READ = { nameKo: "모델이 읽지 않은 커밋 (평균 난이도 적용)", nameEn: "Commits the model did not read (average difficulty)" };

function featuresFor(person, analysis) {
  const analyzed = person.analyzable
    ? person.listed.map((commit) => analysis.get(commit.sha)).filter(Boolean)
    : [];
  if (!analyzed.length) {
    return person.commits > 0
      ? [{ ...NOT_ANALYZED, tech: "-", difficulty: 1, commits: person.commits, points: person.commits, kind: "unanalyzed" }]
      : [];
  }
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
  const features = [...groups.values()].map((group) => ({
    ...group,
    difficulty: Math.max(1, Math.round(group.points / group.commits)),
  }));
  const rest = person.commits - analyzed.length;
  if (rest > 0) {
    const points = features.reduce((sum, feature) => sum + feature.points, 0);
    const average = Math.max(1, Math.round(points / analyzed.length));
    features.push({ ...NOT_READ, tech: "-", difficulty: average, commits: rest, points: rest * average, kind: "earlier" });
  }
  return features.sort((a, b) => (a.kind === "earlier") - (b.kind === "earlier") || b.points - a.points);
}

function scorePeople(people, analysis) {
  return people
    .map((person) => {
      const features = featuresFor(person, analysis);
      const score = features.reduce((sum, feature) => sum + feature.points, 0);
      const analyzedCommits = features.filter((feature) => feature.kind === "code").reduce((sum, feature) => sum + feature.commits, 0);
      const unmergedPrs = person.prsOpened - person.prsMerged;
      const codeWork = features.filter((feature) => feature.kind === "code").map((feature) => feature.nameKo);
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
