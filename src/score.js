function featuresFor(person, analyzed) {
  if (!analyzed) {
    return person.commits > 0
      ? [{ name: "난이도 분석 안 됨", tech: "-", difficulty: 1, commits: person.commits, points: person.commits, kind: "unanalyzed" }]
      : [];
  }
  const listedCount = Math.min(person.listed.length, analyzed.listedCount);
  const used = new Set();
  const features = [];
  for (const feature of analyzed.features) {
    const indexes = [...new Set(feature.commits)].filter((index) => index < listedCount && !used.has(index));
    indexes.forEach((index) => used.add(index));
    if (!indexes.length) continue;
    features.push({
      name: feature.name,
      tech: feature.tech,
      difficulty: feature.difficulty,
      commits: indexes.length,
      points: indexes.length * feature.difficulty,
      kind: "code",
    });
  }
  const unassigned = listedCount - used.size;
  if (unassigned > 0) {
    features.push({ name: "기능으로 묶이지 않은 커밋", tech: "-", difficulty: 1, commits: unassigned, points: unassigned, kind: "unassigned" });
  }
  const earlier = person.commits - listedCount;
  if (earlier > 0) {
    const coded = features.filter((feature) => feature.kind === "code");
    const commitCount = coded.reduce((sum, feature) => sum + feature.commits, 0);
    const average = commitCount
      ? Math.max(1, Math.round(coded.reduce((sum, feature) => sum + feature.points, 0) / commitCount))
      : 1;
    features.push({
      name: "모델이 읽지 않은 커밋 (평균 난이도 적용)",
      tech: "-",
      difficulty: average,
      commits: earlier,
      points: earlier * average,
      kind: "earlier",
    });
  }
  return features;
}

function scorePeople(people, analysis) {
  return people
    .map((person) => {
      const analyzed = analysis[person.author];
      const features = featuresFor(person, analyzed);
      const score = features.reduce((sum, feature) => sum + feature.points, 0);
      const unmergedPrs = person.prsOpened - person.prsMerged;
      const codeWork = features.filter((feature) => feature.kind === "code").map((feature) => feature.name);
      let work = codeWork.length ? codeWork : person.messages.slice(0, 5);
      if (!work.length) work = [unmergedPrs > 0 ? `합쳐지지 않은 PR ${unmergedPrs}건` : "기록된 커밋 없음"];
      return {
        author: person.author,
        score,
        work,
        detail: {
          isAgent: person.isAgent,
          workSource: analyzed ? "code" : "commits",
          features,
          analyzedCommits: analyzed ? Math.min(person.listed.length, analyzed.listedCount) : 0,
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
