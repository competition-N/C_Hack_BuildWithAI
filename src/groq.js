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
            content: "기술 요약, 난이도, 알고리즘만 JSON으로 답한다. 키는 techSummary, difficulty, algorithms. 점수는 쓰지 않는다.",
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
    return {
      techSummary: String(parsed.techSummary),
      difficulty: String(parsed.difficulty),
      algorithms: String(parsed.algorithms),
      briefingSource: "groq",
    };
  } catch {
    return backup;
  }
}

module.exports = { writeBriefing };
