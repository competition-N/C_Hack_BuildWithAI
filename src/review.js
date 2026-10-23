const HIGH_DIFFICULTY = 4;
const TINY_CHANGE_LINES = 10;
const ALL_MAX_MIN_COMMITS = 5;
const ALL_MAX_AVERAGE = 4.5;
const TRIVIAL_MESSAGE = /(typo|오타|오탈자|readme|\bdocs?\b|문서|주석|\bcomments?\b|\bformat|lint|prettier|rename|이름\s*변경|\bbump\b|버전\s*업|gitignore|whitespace|공백|들여쓰기|indent)/i;

function reviewPerson(person, analyzed) {
  if (!person.analyzable || person.isAgent) return [];
  const flags = [];

  const injected = person.listed.filter((commit) => commit.flagged).length;
  if (injected) flags.push({ code: "injection", count: injected });

  const trivialHigh = analyzed.filter(({ commit, row }) => (
    row.difficulty >= HIGH_DIFFICULTY && TRIVIAL_MESSAGE.test(commit.message)
  )).length;
  if (trivialHigh) flags.push({ code: "trivialHigh", count: trivialHigh });

  const tinyHigh = analyzed.filter(({ row }) => (
    (row.docOnly && row.difficulty >= 3)
    || (row.lines != null && row.lines <= TINY_CHANGE_LINES && row.difficulty >= HIGH_DIFFICULTY)
  )).length;
  if (tinyHigh) flags.push({ code: "tinyHigh", count: tinyHigh });

  if (analyzed.length >= ALL_MAX_MIN_COMMITS) {
    const average = analyzed.reduce((sum, { row }) => sum + row.difficulty, 0) / analyzed.length;
    if (average >= ALL_MAX_AVERAGE) flags.push({ code: "allMax", count: analyzed.length, average: Math.round(average * 10) / 10 });
  }

  return flags;
}

module.exports = { reviewPerson };
