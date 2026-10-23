# Typography tokens

글꼴은 따로 내려받지 않는다. 설치된 한글 글꼴을 순서대로 쓴다.

`--font-sans`: `"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", system-ui, sans-serif`

`--font-mono`: `ui-monospace, "Cascadia Mono", Consolas, monospace`

| Token | Size / line height | Use |
|---|---|---|
| `--text-xs` | 12px / 1.4 | 표시(배지), 표 머리 |
| `--text-sm` | 13px / 1.5 | 근거, 보조 설명 |
| `--text-md` | 15px / 1.6 | 본문, 입력칸, 버튼 |
| `--text-lg` | 18px / 1.4 | 섹션 제목(h2) |
| `--text-xl` | 24px / 1.3 | 화면 제목(h1) |
| `--text-score` | 32px / 1.1 | 내 점수 같은 큰 숫자 |

굵기는 400(본문), 600(강조, 버튼), 700(제목) 세 가지만 쓴다. 순위와 점수 숫자는 `font-variant-numeric: tabular-nums`로 자릿수를 맞춘다. 모든 글은 왼쪽 정렬이다.
