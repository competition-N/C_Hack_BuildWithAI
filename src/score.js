function scorePeople(people, analysis) {
  return people
    .map((person) => {
      const analyzed = analysis[person.author];
      const workload = person.commits + person.prsMerged;
      const difficulty = analyzed ? analyzed.difficulty : null;
      const work = analyzed && analyzed.work.length ? analyzed.work : person.messages.slice(0, 5);
      const unmergedPrs = person.prsOpened - person.prsMerged;
      const emptyWork = unmergedPrs > 0 && !workload
        ? `합쳐지지 않은 PR ${unmergedPrs}건`
        : `기록된 기여 ${workload}건`;
      return {
        author: person.author,
        score: workload * (difficulty || 1),
        work: work.length ? work : [emptyWork],
        detail: {
          isAgent: person.isAgent,
          workload,
          difficulty,
          difficultyReason: analyzed ? analyzed.reason : "",
          workSource: analyzed ? "code" : "commits",
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
