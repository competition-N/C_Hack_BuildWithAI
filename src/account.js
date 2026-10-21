const crypto = require("crypto");

const ADJECTIVES = [
  ["조용한", "Quiet"], ["빠른", "Swift"], ["느긋한", "Easy"], ["용감한", "Brave"],
  ["다정한", "Kind"], ["엉뚱한", "Quirky"], ["부지런한", "Busy"], ["졸린", "Sleepy"],
  ["명랑한", "Cheerful"], ["신중한", "Careful"], ["씩씩한", "Bold"], ["수줍은", "Shy"],
  ["날쌘", "Nimble"], ["포근한", "Cozy"], ["기발한", "Clever"], ["차분한", "Calm"],
];
const ANIMALS = [
  ["수달", "Otter"], ["고래", "Whale"], ["여우", "Fox"], ["부엉이", "Owl"],
  ["판다", "Panda"], ["다람쥐", "Squirrel"], ["펭귄", "Penguin"], ["고양이", "Cat"],
  ["너구리", "Raccoon"], ["해달", "SeaOtter"], ["치타", "Cheetah"], ["토끼", "Rabbit"],
  ["거북이", "Turtle"], ["돌고래", "Dolphin"], ["고슴도치", "Hedgehog"], ["참새", "Sparrow"],
];
const LANGUAGES = ["ko", "en"];

function personCode(githubLogin) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(`gh:${String(githubLogin).toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}

function randomNicknames(githubLogin) {
  const code = personCode(githubLogin);
  const [adjectiveKo, adjectiveEn] = ADJECTIVES[parseInt(code.slice(0, 2), 16) % ADJECTIVES.length];
  const [animalKo, animalEn] = ANIMALS[parseInt(code.slice(2, 4), 16) % ANIMALS.length];
  const tag = code.slice(4, 8);
  return { ko: `${adjectiveKo}${animalKo}#${tag}`, en: `${adjectiveEn}${animalEn}#${tag}` };
}

function displayNamesFor(githubLogin, account) {
  if (account && account.account_public && account.nickname) return { ko: account.nickname, en: account.nickname };
  return randomNicknames(githubLogin);
}

function validNickname(nickname) {
  return nickname.length >= 2
    && nickname.length <= 20
    && !/[<>"'&#]/.test(nickname);
}

function validLanguage(language) {
  return LANGUAGES.includes(language);
}

function accountView(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    accountPublic: Boolean(row.account_public),
    githubLogin: row.github_login || null,
    randomNickname: row.github_login ? randomNicknames(row.github_login) : null,
    language: validLanguage(row.language) ? row.language : null,
    oauthReady: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  };
}

function deleteAccount(db, userId) {
  const remove = db.transaction(() => {
    db.prepare("DELETE FROM user_projects WHERE user_id = ?").run(userId);
    db.prepare(`
      DELETE FROM contributions
      WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)
    `).run(userId);
    db.prepare("DELETE FROM projects WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });
  remove();
}

module.exports = {
  personCode,
  randomNicknames,
  displayNamesFor,
  validNickname,
  validLanguage,
  accountView,
  deleteAccount,
};
