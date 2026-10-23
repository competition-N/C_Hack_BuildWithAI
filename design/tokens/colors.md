# Color tokens

`public/styles.css`의 `:root`가 이 표를 그대로 쓴다. 새 색이 필요하면 여기에 먼저 적는다. 그라데이션과 그림자는 쓰지 않는다.

대비는 WCAG 2.1 공식으로 계산한 값이다. 글자로 쓰는 색은 모두 4.5:1(AA) 이상이다.

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--color-bg` | `#f6f7f9` | 페이지 바탕 | |
| `--color-surface` | `#ffffff` | 섹션, 표, 입력칸 바탕 | |
| `--color-surface-muted` | `#f0f2f5` | 표 머리, 버튼 hover 바탕 | |
| `--color-line` | `#e2e5e9` | 구분선, 테두리 | |
| `--color-line-strong` | `#c9ced6` | 입력칸, 버튼 테두리 | |
| `--color-text` | `#16181d` | 본문, 제목 | 17.8:1 on surface |
| `--color-text-muted` | `#5b6270` | 보조 글자, 설명 | 6.1:1 on surface, 5.7:1 on bg, 5.5:1 on surface-muted |
| `--color-accent` | `#1f5fbf` | 주 버튼, 링크, 초점 | 6.1:1 on surface, 5.7:1 on bg |
| `--color-accent-strong` | `#174a96` | 주 버튼 hover | 8.5:1 on surface |
| `--color-on-accent` | `#ffffff` | 주 버튼, 어두운 버튼 글자 | 6.1:1 on accent |
| `--color-danger` | `#b42318` | 실패, 삭제, 점수 확인 필요 | 6.6:1 on surface |
| `--color-danger-line` | `#e9c3bf` | 계정 삭제 섹션 테두리 | |
| `--color-danger-bg` | `#fbeceb` | 삭제 버튼 hover 바탕 | |
| `--color-success` | `#1d7a46` | 완료 안내 | 5.4:1 on surface |
| `--color-side-bg` | `#15171a` | 왼쪽 메뉴 바탕, 어두운 버튼 | |
| `--color-side-active` | `#272b31` | 왼쪽 메뉴 현재 위치, 어두운 버튼 hover | |
| `--color-side-text` | `#c4c8ce` | 왼쪽 메뉴 글자 | 10.7:1 on side-bg |
| `--color-side-text-strong` | `#ffffff` | 왼쪽 메뉴 현재 위치 글자 | 18.0:1 on side-bg, 14.2:1 on side-active |
| `--color-side-focus` | `#8fb4ff` | 왼쪽 메뉴 초점 테두리 | 8.7:1 on side-bg |

상태는 색만으로 알리지 않는다. 실패, 완료, AI 에이전트 표시는 항상 글자와 함께 쓴다.
