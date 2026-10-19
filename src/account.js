const crypto = require("crypto");

const ADJECTIVES = [
  "조용한", "빠른", "느긋한", "용감한", "다정한", "엉뚱한", "부지런한", "졸린",
  "명랑한", "신중한", "씩씩한", "수줍은", "날쌘", "포근한", "기발한", "차분한",
];
const ANIMALS = [
  "수달", "고래", "여우", "부엉이", "판다", "다람쥐", "펭귄", "고양이",
  "너구리", "해달", "치타", "토끼", "거북이", "돌고래", "고슴도치", "참새",
];

function personCode(githubLogin) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(`gh:${String(githubLogin).toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}

function randomNickname(githubLogin) {
  const code = personCode(githubLogin);
  const adjective = ADJECTIVES[parseInt(code.slice(0, 2), 16) % ADJECTIVES.length];
  const animal = ANIMALS[parseInt(code.slice(2, 4), 16) % ANIMALS.length];
  return `${adjective}${animal}#${code.slice(4, 8)}`;
}

function displayNameFor(githubLogin, account) {
  if (account && account.account_public && account.nickname) return account.nickname;
  return randomNickname(githubLogin);
}

function validNickname(nickname) {
  return nickname.length >= 2
    && nickname.length <= 20
    && !/[<>"'&#]/.test(nickname);
}

function accountView(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    accountPublic: Boolean(row.account_public),
    githubLogin: row.github_login || null,
    randomNickname: row.github_login ? randomNickname(row.github_login) : null,
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

module.exports = { personCode, randomNickname, displayNameFor, validNickname, accountView, deleteAccount };
