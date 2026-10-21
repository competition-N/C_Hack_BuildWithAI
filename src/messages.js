const MESSAGES = {
  badRequest: {
    ko: "요청 형식이 올바르지 않습니다.",
    en: "The request was not in the expected format.",
  },
  serverError: {
    ko: "서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
    en: "Something went wrong on the server. Please try again in a moment.",
  },
  notFound: { ko: "없는 주소입니다.", en: "That address does not exist." },
  loginRequired: { ko: "로그인이 필요합니다.", en: "Please sign in first." },
  usernameRule: {
    ko: "아이디는 영문, 숫자, 밑줄 3~32자여야 합니다.",
    en: "Use 3 to 32 letters, numbers, or underscores for the username.",
  },
  passwordRule: { ko: "비밀번호는 8자 이상이어야 합니다.", en: "Use at least 8 characters for the password." },
  usernameTaken: { ko: "이미 있는 아이디입니다.", en: "That username is already taken." },
  loginFailed: { ko: "아이디 또는 비밀번호가 맞지 않습니다.", en: "The username or password is incorrect." },
  loginLocked: {
    ko: "시도가 너무 많아 15분 동안 로그인할 수 없습니다.",
    en: "Too many attempts. You can try again in 15 minutes.",
  },
  actionLocked: {
    ko: "시도가 너무 많아 15분 동안 할 수 없습니다.",
    en: "Too many attempts. You can try again in 15 minutes.",
  },
  currentPasswordWrong: { ko: "지금 비밀번호가 맞지 않습니다.", en: "Your current password is incorrect." },
  nicknameRule: {
    ko: "닉네임은 2~20자이고, < > \" ' & # 는 쓸 수 없습니다.",
    en: "Use 2 to 20 characters for the nickname, without < > \" ' & #.",
  },
  nicknameTaken: { ko: "이미 쓰는 닉네임입니다.", en: "That nickname is already in use." },
  languageRule: { ko: "언어는 한국어나 영어만 고를 수 있습니다.", en: "Choose Korean or English." },
  githubRequired: {
    ko: "먼저 관리 > 설정에서 GitHub를 연결해 주세요.",
    en: "Connect GitHub first in Manage > Settings.",
  },
  notContributor: {
    ko: "{repo}의 기여자 중에 {login}이(가) 없어서 추가하지 않았습니다.",
    en: "{login} is not a contributor to {repo}, so it was not added.",
  },
  projectNotFound: { ko: "프로젝트를 찾지 못했습니다.", en: "Project not found." },
  personNotFound: { ko: "정보 없음", en: "No record" },
  tooManyJudges: {
    ko: "판단은 한 시간에 {limit}번까지 할 수 있습니다. {minutes}분 뒤에 다시 시도해 주세요.",
    en: "You can judge up to {limit} times an hour. Please try again in {minutes} minutes.",
  },
  repoUrlFormat: {
    ko: "주소는 https://github.com/소유자/저장소 형태여야 합니다.",
    en: "Use an address like https://github.com/owner/repo.",
  },
  repoNotFound: {
    ko: "저장소를 찾지 못했습니다. 공개 저장소인지 확인해 주세요.",
    en: "Repository not found. Make sure it is public.",
  },
  githubLimited: {
    ko: "GitHub 요청 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.",
    en: "GitHub's request limit was reached. Please try again later.",
  },
  githubFailed: { ko: "GitHub에서 저장소를 읽지 못했습니다.", en: "Could not read the repository from GitHub." },
};

function langOf(request) {
  return String(request.headers["x-lang"] || "").toLowerCase() === "en" ? "en" : "ko";
}

function message(lang, key, params = {}) {
  const entry = MESSAGES[key] || MESSAGES.serverError;
  return (entry[lang] || entry.ko).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

module.exports = { langOf, message };
