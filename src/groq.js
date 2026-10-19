const CHARS_PER_TOKEN = 2.5;
const PERSON_PAYLOAD_CHARS = 2400;
const BATCH_PAYLOAD_CHARS = 7500;
const OUTPUT_TOKENS_PER_PERSON = 500;
const DEFAULT_FALLBACK_MODELS = "openai/gpt-oss-20b";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const budgets = new Map();

function budgetFor(model) {
  if (!budgets.has(model)) budgets.set(model, { remaining: Infinity, limit: 8000, checkedAt: 0 });
  return budgets.get(model);
}

function available(budget) {
  if (!Number.isFinite(budget.remaining)) return Infinity;
  const refilled = ((Date.now() - budget.checkedAt) / 60_000) * budget.limit;
  return Math.min(budget.limit, budget.remaining + refilled);
}

function rememberLimits(model, response) {
  const budget = budgetFor(model);
  const remaining = Number(response.headers.get("x-ratelimit-remaining-tokens"));
  const limit = Number(response.headers.get("x-ratelimit-limit-tokens"));
  if (Number.isFinite(limit) && limit > 0) budget.limit = limit;
  if (Number.isFinite(remaining)) {
    budget.remaining = remaining;
    budget.checkedAt = Date.now();
  }
}

function modelChoices(allowFallback) {
  const fallback = allowFallback
    ? String(process.env.GROQ_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS).split(",")
    : [];
  return [...new Set([process.env.GROQ_MODEL, ...fallback].map((model) => String(model || "").trim()).filter(Boolean))];
}

async function pickModel(tokens, allowFallback) {
  const models = modelChoices(allowFallback);
  for (;;) {
    for (const model of models) {
      const budget = budgetFor(model);
      if (available(budget) >= tokens) {
        budget.remaining = available(budget) - tokens;
        budget.checkedAt = Date.now();
        return model;
      }
    }
    const waits = models.map((model) => {
      const budget = budgetFor(model);
      return ((tokens - available(budget)) / budget.limit) * 60_000;
    });
    await sleep(Math.min(Math.max(Math.min(...waits), 500), 60_000));
  }
}

function retryAfterMs(response, text) {
  const header = Number(response.headers.get("retry-after"));
  const hinted = String(text).match(/try again in ([\d.]+)(ms|s)/);
  const fromText = hinted ? Number(hinted[1]) * (hinted[2] === "ms" ? 1 : 1000) : 0;
  return Math.min(Math.max(header * 1000 || 0, fromText, 5000), 60_000);
}

function firstParagraph(markdown) {
  const text = String(markdown || "").replace(/\r/g, "");
  const paragraph = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return (paragraph || "").slice(0, 600);
}

function bullets(value) {
  return Array.isArray(value)
    ? value.map((item) => `- ${String(item).trim()}`).join("\n")
    : String(value || "");
}

function parseJson(content) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGroq(system, user, maxTokens, { allowFallback = false } = {}) {
  if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) return null;
  const estimate = Math.ceil((system.length + user.length) / CHARS_PER_TOKEN) + maxTokens;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const model = await pickModel(estimate, allowFallback);
      const body = {
        model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };
      if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      rememberLimits(model, response);
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.warn(`Groq ${response.status} (${model}): ${text.slice(0, 200)}`);
        if (response.status === 429) {
          const budget = budgetFor(model);
          const used = Number((String(text).match(/Used (\d+)/) || [])[1]);
          budget.remaining = Number.isFinite(used)
            ? Math.max(0, budget.limit - used)
            : budget.limit - Math.ceil((retryAfterMs(response, text) / 60_000) * budget.limit);
          budget.checkedAt = Date.now();
          continue;
        }
        return null;
      }
      const payload = await response.json();
      const choice = payload.choices && payload.choices[0];
      if (choice && choice.finish_reason === "length") console.warn("Groq answer was cut off by max_tokens.");
      return parseJson(choice && choice.message ? choice.message.content || "" : "");
    } catch (error) {
      console.warn(`Groq request failed: ${error.message}`);
      return null;
    }
  }
  return null;
}

function personPayload(person) {
  let messageLimit = 25;
  let patchLimit = 200;
  let codeCommits = 3;
  for (;;) {
    const listed = person.listed.slice(0, messageLimit);
    const item = {
      id: person.author,
      commits: listed.map((commit, index) => ({ i: index, message: commit.message.slice(0, 50) })),
      code: person.samples
        .filter((sample) => sample.files && sample.files.length)
        .slice(0, codeCommits)
        .map((sample) => ({
          i: listed.findIndex((commit) => commit.sha === sample.sha),
          files: sample.files.slice(0, 4).map((file) => ({
            name: file.name,
            add: file.add,
            del: file.del,
            patch: file.patch.slice(0, patchLimit),
          })),
        }))
        .filter((sample) => sample.i >= 0),
    };
    const text = JSON.stringify(item);
    const done = text.length <= PERSON_PAYLOAD_CHARS || (messageLimit <= 10 && patchLimit <= 60 && codeCommits <= 1);
    if (done) return { item, length: text.length, listedCount: listed.length };
    if (patchLimit > 60) patchLimit = Math.floor(patchLimit / 2);
    else if (codeCommits > 1) codeCommits -= 1;
    else messageLimit -= 10;
  }
}

function batchesOf(entries) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const entry of entries) {
    if (current.length && size + entry.length > BATCH_PAYLOAD_CHARS) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += entry.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

const ANALYSIS_PROMPT = [
  "각 사람의 커밋 목록과 실제 코드 변경 일부를 읽고 한국어로만 답한다.",
  "JSON 객체 하나만 답한다: {\"people\": [{\"id\", \"features\": [{\"f\", \"name\", \"tech\", \"difficulty\"}], \"assign\": [...]}]}",
  "id: 입력의 id를 그대로 쓴다.",
  "features: 그 사람의 커밋들을 기능 단위로 묶은 목록. 1~5개. f는 0부터 붙이는 기능 번호.",
  "name: 그 기능에서 무엇을 만들거나 고쳤는지 짧게. 커밋 메시지를 그대로 옮기지 말고 코드와 메시지를 보고 쓴다.",
  "tech: 그 기능에 쓰인 기술 하나. 예: JavaScript, React, Node.js, Python, SQL, CSS, Markdown, GitHub Actions.",
  "difficulty: 1~5 정수. 1=문서·오타·설정, 2=단순 화면이나 데이터 수정, 3=기능 하나 구현, 4=여러 모듈에 걸친 기능이나 알고리즘, 5=복잡한 알고리즘·구조 설계·보안.",
  "assign: 그 사람의 commits 목록과 같은 길이의 정수 배열. k번째 값은 i=k인 커밋이 속한 기능 번호 f다. 모든 커밋에 반드시 기능 번호를 하나 준다.",
].join("\n");

function readAnalysis(row, entry) {
  if (!row || !Array.isArray(row.features)) return null;
  const features = row.features
    .map((feature, position) => ({
      f: Number.isInteger(Number(feature.f)) ? Number(feature.f) : position,
      name: String(feature.name || "").trim(),
      tech: String(feature.tech || "").trim() || "기타",
      difficulty: Math.min(5, Math.max(1, Math.round(Number(feature.difficulty) || 1))),
      commits: [],
    }))
    .filter((feature) => feature.name);
  const assign = Array.isArray(row.assign) ? row.assign.slice(0, entry.listedCount) : [];
  assign.forEach((value, index) => {
    const feature = features.find((item) => item.f === Number(value));
    if (feature) feature.commits.push(index);
  });
  if (!features.length) return null;
  return { features: features.map(({ f, ...feature }) => feature), listedCount: entry.listedCount };
}

async function analyzePeople(people) {
  const entries = people
    .filter((person) => person.analyzable && person.listed.length)
    .map((person) => ({ person, ...personPayload(person) }));
  const result = {};
  for (const batch of batchesOf(entries)) {
    const parsed = await callGroq(
      ANALYSIS_PROMPT,
      JSON.stringify(batch.map((entry) => entry.item)),
      Math.min(2500, 300 + OUTPUT_TOKENS_PER_PERSON * batch.length),
    );
    for (const row of (parsed && Array.isArray(parsed.people) ? parsed.people : [])) {
      const entry = batch.find((item) => item.person.author === String(row && row.id));
      const analyzed = entry ? readAnalysis(row, entry) : null;
      if (analyzed) result[entry.person.author] = analyzed;
    }
  }
  return result;
}

function fallbackBriefing({ readme, languages }) {
  const languageList = languages.length ? languages.join(", ") : "확인된 언어 없음";
  const paragraph = firstParagraph(readme);
  return {
    techSummary: paragraph
      ? `${paragraph}\n\n사용 언어: ${languageList}`
      : `README가 없습니다. 사용 언어: ${languageList}`,
    difficulty: `모델 응답이 없었습니다. 사용 언어: ${languageList}`,
    algorithms: "모델 응답이 없어 알고리즘 문장을 만들지 못했습니다.",
    features: "모델 응답이 없어 만든 기능을 정리하지 못했습니다.",
    briefingSource: "fallback",
  };
}

async function writeBriefing({ readme, languages, files, recentWork, peopleWork }) {
  const backup = fallbackBriefing({ readme, languages });
  const parsed = await callGroq([
    "GitHub 저장소 정보를 보고 한국어로만 답한다. 점수나 순위는 쓰지 않는다.",
    "JSON 객체 하나만 답한다. 키는 techSummary, features, difficulty, algorithms.",
    "techSummary: 이 프로젝트가 무엇이고 어떤 기술로 만들었는지 2~3문장.",
    "features: 사람들이 한 일과 커밋 내역을 합쳐, 이 프로젝트에서 실제로 만든 기능 3~8개의 문자열 배열. 겹치는 것은 하나로 합친다.",
    "difficulty: '쉬움', '보통', '어려움' 중 하나로 시작하고, 그렇게 본 이유를 한 문장 덧붙인다.",
    "algorithms: 이 프로젝트에 쓰인 주요 알고리즘이나 처리 방식을 짧은 항목 3~6개의 문자열 배열로.",
  ].join("\n"), JSON.stringify({
    readme: firstParagraph(readme),
    languages,
    files: (files || []).slice(0, 30),
    recentCommits: (recentWork || []).slice(0, 30).map((message) => message.slice(0, 70)),
    peopleWork: (peopleWork || []).slice(0, 8),
  }), 1200, { allowFallback: true });
  if (!parsed || !parsed.techSummary || !parsed.difficulty || !parsed.algorithms) return backup;
  return {
    techSummary: String(parsed.techSummary),
    features: parsed.features ? bullets(parsed.features) : backup.features,
    difficulty: String(parsed.difficulty),
    algorithms: bullets(parsed.algorithms),
    briefingSource: "groq",
  };
}

module.exports = { analyzePeople, writeBriefing };
