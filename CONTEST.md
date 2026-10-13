# Devpost "Build With AI: Basics" 해커톤 요약

> ⚠️ **주의**
> - Skill Pack 파일(`.agents/`/스킬 폴더, `devpost/` 산출물 등)은 **나중에 이 저장소 안에서** `npx skills add ...` 및 `run 1-start`로 생성해야 합니다.
> - 대회 규칙상 프로젝트는 **제출 기간 중 빈 폴더에서 시작**해야 하므로, 지금은 저장소를 최소 상태(LICENSE, README.md, CONTEST.md)로만 유지합니다. 코드나 기타 파일을 미리 추가하지 마세요.
> - 이 문서는 2026-10-13 기준 공식 페이지와 규칙을 확인해 작성했습니다. 규칙과 이 문서가 충돌하면 **공식 규칙이 우선**합니다.

## 1. 개요
- 주최/운영: Devpost, Inc. (온라인, 공개 대회)
- 내용: Devpost Learn Skill Pack(코딩 에이전트 안에서 동작하는 단계별 스킬)으로 **계획 → 빌드 → 제출**을 진행하며, 한 가지 기능이 처음부터 끝까지 동작하는 작은 앱(PoC)을 만드는 학습형 해커톤
- 총상금: $2,500

## 2. 주제
- **자유 주제.** Skill Pack으로 만든 새 앱이면 됩니다. 아이디어가 없으면 스킬이 찾도록 도와주고, 너무 크면 줄여 줍니다.

## 3. 규칙 (핵심)
- **새 프로젝트만**: 제출 기간(**2026-09-22 10:00 ET ~ 2026-10-26 17:00 ET**) 중 **빈 폴더에서 시작**해야 함. 예전 아이디어는 OK, **예전 코드는 불가**.
  - 프레임워크, 라이브러리, 스타터 템플릿, AI 코딩 도우미 사용은 허용. 그 외 기존 코드/작업물을 포함했다면 공개해야 함.
- **Skill Pack 필수 사용**
  1. 빈 프로젝트 폴더에서 `npx skills add challengepost/learn-ai-basics --all -y` 실행 (Node.js, Git 필요)
  2. 그 폴더에서 코딩 에이전트(Cursor, Claude Code, Codex, Copilot 등 SKILL.md 지원 에이전트)를 열고 `run 1-start` 입력
- **기획 문서 필수**: 공개 저장소에 Skill Pack이 생성한 `devpost/scope.md`, `devpost/prd.md`, `devpost/spec.md` 포함
- **동작하는 PoC**: 최소 한 가지 기능이 end-to-end로 동작해야 하며, 영상/설명과 동일하게 작동해야 함
- **언어**: 모든 제출물은 영어(또는 영어 번역 제공)
- 서드파티 SDK/API/데이터는 해당 약관에 따라 사용 권한이 있어야 함
- 여러 작품 제출 가능하나 각각 실질적으로 달라야 함

## 4. Skill Pack의 6단계 스킬과 산출물
| 스킬 | 내용 | 산출물 |
|---|---|---|
| `1-start` | 6단계 이해, 작업공간 점검, 아이디어/경험 소개 | `devpost/learner-profile.md` (기본적으로 커밋 제외) |
| `2-scope` | 아이디어 구체화, 핵심(kernel)과 "완료" 정의, PoC 크기로 축소 | `devpost/scope.md` |
| `3-prd` | 제품 인터뷰: 화면, 레이아웃, 비주얼, 동작, 엣지 케이스, now/later 경계 (코드 이야기 없음) | `devpost/prd.md` |
| `4-spec` | 기술 계획 합의 | `devpost/spec.md` |
| `5-build` | 검증·커밋되는 빌드 단계, 리뷰/수정, 학습 정리 | `devpost/checklist.md`, 앱, `devpost/app-map.html` |
| `6-ship` | 데모 영상과 공개 GitHub 저장소 준비, 제출문 직접 작성 | 영상, 공개 저장소, 직접 쓴 제출문 |

- 예상 소요: 실제 작업 약 2~4시간
- 제출문/설문 답변은 **본인이 직접 작성** (에이전트는 맞춤법·문법만 교정)
- 공개 전 파일과 git 히스토리에 비밀정보/개인정보가 없는지 확인

## 5. 제출 요건
- **코드 저장소 URL** (GitHub/GitLab/Bitbucket): **공개**, 실행에 필요한 소스·에셋·**실행 방법** 포함, **오픈소스 라이선스 파일** 포함(저장소 About에 표시되도록)
- **영어 텍스트 설명**: 기능, 대상 사용자, 배운 점
- **데모 영상**: **3분 미만**, 실제 동작 화면 포함(화면 녹화 OK), **YouTube 또는 Vimeo에 공개** 업로드, 제3자 상표·**저작권 음악** 등 무단 사용 금지
- 심사위원은 코드를 클론/실행하지 않을 수 있음 → **영상에서 동작이 명확히 보여야 함**

## 6. 심사
- **1단계 (Pass/Fail)**: 주제 적합성 및 Skill Pack 사용 여부(저장소의 기획 문서로 확인)
- **2단계 (동일 가중치)**: 규칙(Official Rules) 기준 4개 항목
  1. **Design** – 단순 기술 PoC를 넘어 완결되고 일관된 제품 경험인가
  2. **Potential Impact** – 실제 사용자의 실제 문제를 구체적으로 해결하는가
  3. **Innovation/Idea** – 창의적이고 기존과 다른가
  4. **Presentation** – 영상이 end-to-end 동작을 명확히 보여주고, 문제·대상·중요성을 잘 전달하는가
- 동점 시 위 순서대로 항목 점수 비교

## 7. 상금
- 1등 $1,250 / 2등 $750 / 3등 $500 (각 1팀, 현금 + Devpost 뉴스레터 소개·인터뷰 + Devpost SNS 소개)
- 참가상: 적격 제출자 전원 Devpost Learn 배지 + Devpost Discord 특별 역할
- 작품당 상금 1개 + 참가상 1개

## 8. 참가 자격
- 만 18세 이상 (대회 페이지 기준; 규칙상 거주지 성년 연령 이상)
- 개인, 팀, 단체 참가 가능. 팀/단체는 **대표자 1명**이 제출
- 미국 제재국 등 일부 지역 및 주최 관계자 제외

## 9. 주요 일정 (KST)
| 일정 | 원문(ET) | KST |
|---|---|---|
| 제출 기간 시작 | 9/22 10:00 EDT | 9/22 23:00 |
| Will It Ship 라이브 리뷰 | 10/22 15:00 EDT | **10/23 04:00** |
| **제출 마감** | 10/26 17:00 EDT | **10/27 06:00** |
| 심사 기간 | 10/27 10:00 EDT ~ 10/30 17:00 EDT | 10/27 23:00 ~ 10/31 06:00 |
| 수상자 발표(예정) | 11/4 14:00 EST 경 | **11/5 04:00 경** |

## 10. 팀 체크리스트
- [ ] Devpost에서 "Join Hackathon"으로 등록 (팀원 전원)
- [ ] Node.js, Git, 스킬 지원 코딩 에이전트 준비
- [ ] 이 저장소에서 `npx skills add challengepost/learn-ai-basics --all -y` → `run 1-start`
- [ ] `2-scope` → `3-prd` → `4-spec` → `5-build` → `6-ship` 순서 진행
- [ ] `devpost/scope.md`, `prd.md`, `spec.md` 커밋 확인
- [ ] README에 영어 실행 방법 작성, LICENSE 유지
- [ ] 3분 미만 데모 영상(저작권 음악 없음) YouTube/Vimeo 공개 업로드
- [ ] 영어 설명 직접 작성, 비밀정보 점검
- [ ] 대표자 1명이 **10/27 06:00 KST 전** 제출

## 11. 링크
- 대회 페이지: https://learn-ai-basics.devpost.com/
- 공식 규칙: https://learn-ai-basics.devpost.com/rules
- Skill Pack: https://github.com/challengepost/learn-ai-basics
