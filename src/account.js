const crypto = require("crypto");

const TEMP_PREFIX = "익명-";

function ownerCode(userId, createdAt) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(`${userId}:${createdAt}`)
    .digest("hex")
    .slice(0, 16);
}

function tempNickname(userId, createdAt) {
  return `${TEMP_PREFIX}${ownerCode(userId, createdAt).slice(0, 6)}`;
}

function displayName(userId, createdAt, nickname, accountPublic) {
  return accountPublic ? nickname : tempNickname(userId, createdAt);
}

function validNickname(nickname) {
  return nickname.length >= 2
    && nickname.length <= 20
    && !/[<>"'&]/.test(nickname)
    && !nickname.startsWith(TEMP_PREFIX);
}

function accountView(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    accountPublic: Boolean(row.account_public),
    tempNickname: tempNickname(row.id, row.created_at),
  };
}

function deleteAccount(db, userId) {
  const remove = db.transaction(() => {
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

module.exports = { ownerCode, displayName, validNickname, accountView, deleteAccount };
