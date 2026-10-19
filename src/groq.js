function firstParagraph(markdown) {
  const text = String(markdown || "").replace(/\r/g, "");
  const paragraph = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return (paragraph || "").slice(0, 600);
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
    briefingSource: "fallback",
  };
}

async function writeBriefing({ readme, languages, files }) {
  const backup = fallbackBriefing({ readme, languages });
  if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) return backup;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "GitHub 저장소 정보를 보고 한국어로만 답한다. 점수나 순위는 쓰지 않는다.",
              "JSON 객체 하나만 답한다. 키는 techSummary, difficulty, algorithms.",
              "techSummary: 이 프로젝트가 무엇이고 어떤 기술로 만들었는지 2~3문장.",
              "difficulty: '쉬움', '보통', '어려움' 중 하나로 시작하고, 그렇게 본 이유를 한 문장 덧붙인다.",
              "algorithms: 이 프로젝트에 쓰인 주요 알고리즘이나 처리 방식을 짧은 항목 3~6개의 문자열 배열로.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              readme: firstParagraph(readme),
              languages,
              files: files.slice(0, 30),
            }),
          },
        ],
      }),
    });
    if (!response.ok) return backup;
    const payload = await response.json();
    const content = payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content
      : "";
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < jsonStart) return backup;
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    if (!parsed.techSummary || !parsed.difficulty || !parsed.algorithms) return backup;
    const algorithms = Array.isArray(parsed.algorithms)
      ? parsed.algorithms.map((item) => `- ${String(item).trim()}`).join("\n")
      : String(parsed.algorithms);
    return {
      techSummary: String(parsed.techSummary),
      difficulty: String(parsed.difficulty),
      algorithms,
      briefingSource: "groq",
    };
  } catch {
    return backup;
  }
}

module.exports = { writeBriefing };
