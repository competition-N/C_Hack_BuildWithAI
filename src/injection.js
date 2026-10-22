const INJECTION_PATTERNS = [
  /(난이도|difficulty|점수|score|rating|등급|grade)\s*([:=]|[은는을를이가]\s)\s*[0-9]/i,
  /(난이도|점수|등급)\s*[0-9]+\s*(점\s*)?(으로|로)\s*(줘|주세요|매겨|평가|해)/,
  /(ignore|disregard|forget)\s+(all|any|the|previous|above|prior|your)/i,
  /(이전|위의|앞의|모든|기존)\s*(지시|명령|규칙|프롬프트)/,
  /(지시|명령|규칙|프롬프트)[을를은는]?\s*(무시|따르지|바꿔|변경)/,
  /(system|assistant|developer)\s*(prompt|message|:)/i,
  /you are (now|an?|the)\b/i,
  /(높게|최고|만점|최대|가장 높은)\s*(으로\s*)?(평가|점수|난이도)/,
  /(rate|grade|score|mark)\s+(this|me|it|them)\s+(as|high|a\s*5|5)/i,
];

function looksLikeInjection(line) {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(line));
}

function hasInjection(text) {
  return String(text || "").split(/\r?\n/).some(looksLikeInjection);
}

function scrubText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !looksLikeInjection(line))
    .join("\n");
}

function scrubLine(text) {
  return looksLikeInjection(String(text || "")) ? "[생략]" : String(text || "");
}

module.exports = { looksLikeInjection, hasInjection, scrubText, scrubLine };
