const PEOPLE_PAYLOAD_CHARS = 14000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function callGroq(system, user, maxTokens) {
  if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) return null;
  const body = {
    model: process.env.GROQ_MODEL,
    temperature: 0,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (process.env.GROQ_MODEL.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.status === 429 && attempt === 0) {
        const wait = Math.min(Number(response.headers.get("retry-after")) || 10, 30);
        await sleep(wait * 1000);
        continue;
      }
      if (!response.ok) return null;
      const payload = await response.json();
      const content = payload.choices && payload.choices[0] && payload.choices[0].message
        ? payload.choices[0].message.content || ""
        : "";
      return parseJson(content);
    } catch {
      return null;
    }
  }
  return null;
}

function peoplePayload(people) {
  let patchLimit = 400;
  let payload = "";
  while (patchLimit >= 60) {
    payload = JSON.stringify(people.map((person) => ({
      id: person.author,
      commits: person.samples.map((sample) => ({
        message: sample.message.slice(0, 120),
        files: (sample.files || []).map((file) => ({
          name: file.name,
          add: file.add,
          del: file.del,
          patch: file.patch.slice(0, patchLimit),
        })),
      })),
    })));
    if (payload.length <= PEOPLE_PAYLOAD_CHARS) break;
    patchLimit = Math.floor(patchLimit / 2);
  }
  return payload.slice(0, PEOPLE_PAYLOAD_CHARS);
}

async function analyzePeople(people) {
  const withCode = people.filter((person) => person.samples.some((sample) => sample.files && sample.files.length));
  if (!withCode.length) return {};
  const parsed = await callGroq([
    "각 사람이 올린 실제 코드 변경(파일 이름, 추가·삭제 줄, 바뀐 코드 일부)을 읽고 한국어로만 답한다.",
    "JSON 객체 하나만 답한다: {\"people\": [{\"id\", \"work\", \"difficulty\", \"reason\"}]}",
    "id: 입력의 id를 그대로 쓴다. 코드를 받지 못한 사람은 넣지 않는다.",
    "work: 그 사람이 무엇을 만들거나 고쳤는지 기능 단위의 짧은 항목 2~4개 배열. 커밋 메시지를 그대로 옮기지 말고 코드를 보고 쓴다.",
    "difficulty: 1~5 정수. 1=문서·오타·설정, 2=단순 화면이나 데이터 수정, 3=기능 하나 구현, 4=여러 모듈에 걸친 기능이나 알고리즘, 5=복잡한 알고리즘·구조 설계·보안.",
    "reason: 그 난이도를 준 이유 한 문장.",
  ].join("\n"), peoplePayload(withCode), 2000);
  const result = {};
  for (const row of (parsed && Array.isArray(parsed.people) ? parsed.people : [])) {
    if (!row || !row.id) continue;
    const difficulty = Math.min(5, Math.max(1, Math.round(Number(row.difficulty) || 0)));
    if (!difficulty) continue;
    result[String(row.id)] = {
      work: Array.isArray(row.work) ? row.work.map(String).filter(Boolean).slice(0, 4) : [],
      difficulty,
      reason: String(row.reason || ""),
    };
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
    recentCommits: (recentWork || []).slice(0, 40),
    peopleWork: peopleWork || [],
  }), 1500);
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
