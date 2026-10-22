---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. A public repo address shows who did the work, with the briefing beside it**
  Becomes usable: `node server.js`로 연 페이지에 공개 GitHub 주소를 넣으면, 사람마다 순위, 세부 점수, 한 일이 보이고 그 옆에 기술 요약, 난이도, 알고리즘 문장이 보인다. Groq가 없으면 README와 언어로 만든 대체 문장이 보인다. 아직 계정과 재시작 저장은 없다.
  Why now: 커널이 먼저다. GitHub가 기여자를 돌려주지 않으면 뒤의 로그인과 암호화는 확인할 것이 없다. 서버 시작과 페이지 껍데기는 이 화면을 띄우는 데 포함한다.
  PRD ref: `prd.md > The Core Journey` (steps 1, 4), `prd.md > 추가하기`, `prd.md > 기여도`, `prd.md > 문서`
  Spec ref: `spec.md > 페이지 껍데기`, `spec.md > 추가하기와 판단`, `spec.md > 기여도`, `spec.md > 문서`, `spec.md > File Structure`, `spec.md > Look and Feel`
  Build: `server.js`, `public/index.html`, `public/styles.css`, `public/app.js`, `src/github.js`, `src/groq.js`를 만든다. 왼쪽 열은 화면 왼쪽 전체를 차지한다. 주소 제출이 GitHub contributors, commits, pulls로 점수와 순위를 만들고, Groq에는 문장 세 개만 맡긴다. 키는 `.env.example` 이름만 두고 실제 값은 커밋하지 않는다.
  Verify (mechanical): `node server.js`가 에러 없이 뜬다. 공개 저장소 주소 하나를 넣으면 응답에 순위, 점수, 한 일이 있다. Groq 키가 없어도 문서 문장이 비지 않는다.
  Learner check: 서버를 켜고 페이지를 연 뒤, 아는 공개 저장소 주소를 넣어 누가 위에 있는지 보고, 그 순위가 버스가 보이게 하는 화면인지 말해 주세요.
  Commit: `Show repo contribution ranking with a briefing`

- [x] **2. The judgment is still there after a restart, in an encrypted file**
  Becomes usable: 서버를 껐다 켜도 방금 판단한 프로젝트가 진행중, 완료, 실패로 남아 있다. 잘못된 주소는 실패와 사유로 남고, 이전 완료가 있으면 그 내용을 지우지 않는다.
  Why now: SQLCipher 네이티브 모듈이 이 VM에서 깨지면 지금 아는 것이 싸다. 커널 화면이 이미 있으므로 저장은 그 결과에 붙이면 된다.
  PRD ref: `prd.md > 판단 결과`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > 데이터베이스`, `spec.md > Data Model`, `spec.md > Important Failure Modes`
  Build: `src/db.js`가 `SQLCIPHER_KEY` 없이 시작하지 않고, `cipher=sqlcipher`, `legacy=4`로 `data/app.db`를 연다. 판단 결과를 projects와 contributions에 쓰고, 다시 켤 때 읽는다. 암호 없는 파일을 만들지 않는다.
  Verify (mechanical): 주소 하나를 판단한 뒤 서버를 재시작하고 목록에 같은 결과가 있는지 확인한다. `data/app.db` 앞부분이 `SQLite format 3`이 아닌지 확인한다. 열쇠 없이 시작하면 프로세스가 실패한다.
  Learner check: 저장소 하나를 판단하고 서버를 껐다 켠 다음, 같은 결과가 보이는지 확인해 주세요.
  Commit: `Persist judgments in a SQLCipher database`

- [x] **3. You sign in and only see your projects**
  Becomes usable: 아이디와 비밀번호로 가입하고 로그인하면 내 프로젝트만 보인다. 틀린 비밀번호는 목록으로 들어가지 못한다. 빈 목록에는 추가하기만 있다.
  Why now: 커널과 저장이 된 뒤에 계정을 씌워야, 로그인 화면이 빈 껍데기로 먼저 생기지 않는다.
  PRD ref: `prd.md > 프로젝트 목록`, `prd.md > The Core Journey` (step 2)
  Spec ref: `spec.md > 로그인과 세션`, `spec.md > 프로젝트 목록`
  Build: `src/auth.js`에 Argon2id 가입, 로그인, 로그아웃, 5회 실패 후 15분 거절, HttpOnly 세션 쿠키를 넣는다. 프로젝트 행에 user_id를 달고, 목록과 추가는 그 사용자만 본다.
  Verify (mechanical): 두 계정으로 각각 다른 저장소를 판단하고, 한 계정의 목록에 다른 계정의 프로젝트가 없는지 확인한다. 틀린 비밀번호 요청은 거절된다.
  Learner check: 가입한 뒤 저장소 하나를 넣고, 로그아웃했다가 다른 아이디로 들어갔을 때 그 프로젝트가 안 보이는지 확인해 주세요.
  Commit: `Limit project lists to the signed-in account`

- [x] **4. Sharing shows the project to people who are not signed in**
  Becomes usable: 설정에서 공유를 켜면 로그아웃 상태의 공개 프로젝트에 설명과 기여도가 보인다. 끄거나 없으면 "정보 없음"이다. 삭제하면 내 목록에서 빠진다. 연동 확인은 마지막 GitHub 호출이 성공했는지를 보여 준다.
  Why now: 공개는 계정과 저장된 판단이 있어야 의미가 있다. 전 세계 사람 랭킹과 웹훅은 여기 넣지 않는다.
  PRD ref: `prd.md > 설정`, `prd.md > 공개 프로젝트`, `prd.md > The Core Journey` (step 6)
  Spec ref: `spec.md > 설정`, `spec.md > 공개 프로젝트`, `spec.md > What Was Simplified and Why`
  Build: 소유자만 공유, 삭제, 연동 확인을 바꾼다. 공개 페이지는 shared인 프로젝트의 이름, 기술 요약, 순위와 점수만 로그인 없이 보여 준다.
  Verify (mechanical): 공유 전에는 공개 페이지가 "정보 없음"이고, 공유 후에는 로그아웃 요청에도 그 기여도가 보인다. 다른 계정은 그 프로젝트를 삭제할 수 없다.
  Learner check: 설정에서 공유를 켠 뒤 로그아웃하고, 공개 프로젝트에서 그 순위가 보이는지 확인해 주세요.
  Commit: `Publish a shared project to signed-out visitors`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 1, when a real repo ranking and briefing are on screen
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [x] Groq 모델 문장을 한국어로, 난이도는 쉬움/보통/어려움과 이유, 알고리즘은 목록으로 받기 — express와 Hello-World 판단에서 `briefingSource: groq` 확인
- [ ] 로그인 후 왼쪽의 로그인 대신 관리(설정, 프로젝트 관리) 펼침 메뉴 — Edge로 눌러 펼침·접힘·로그아웃 후 복귀 확인. 학습자 확인 대기
- [ ] 관리 > 설정: 닉네임 변경, 비밀번호 변경, 계정 삭제, 계정 공개 켜기/끄기 — API 확인 21개 통과. 학습자 확인 대기
- [ ] 공개 프로젝트에서 등록한 사람 닉네임을 누르면 그 사람의 공유 프로젝트 목록 — Edge로 눌러 확인. 학습자 확인 대기
- [ ] 공동 작성자가 있는 AI 에이전트 커밋을 그 사람에게 합치고 "AI 에이전트 N건 포함" 표시, 에이전트 커밋 수는 따로 저장 — KIT_Contest에서 cursoragent 4건이 NamDanChu로 합쳐짐 확인. 학습자 확인 대기
- [ ] 점수 = 작업량 × 코드 난이도, 근거(커밋·PR·파일·줄·난이도 이유), 코드를 읽은 한 일, 프로젝트 전체의 만든 기능 — KIT_Contest, express(6명 분석, 약 10초), Hello-World 확인. 학습자 확인 대기
- [ ] 프로젝트를 열면 추가하기 대신 재판단하기·닫기 — Edge로 열기, 재판단(진행중 → "다시 판단했습니다.", 같은 프로젝트 갱신), 닫기 확인. 학습자 확인 대기
- [ ] 공개 프로젝트를 사람별 기여 순위로: 판단된 모든 저장소의 GitHub 기여자, 랜덤 닉네임, 닉네임 검색, 사람 화면 — API 확인과 Edge 확인. 학습자 확인 대기
- [ ] 점수 = 기능별 (커밋 수 × 난이도)의 합, 기능마다 기술 하나 — KIT_Contest, express(6명, 12~19초), Hello-World 확인. 학습자 확인 대기
- [ ] 기술 상세는 메인에서만, 프로젝트 관리는 GitHub 연결 후 내 기여만 — 남의 저장소 추가 거절 확인(테스트 계정에 DB로 GitHub 아이디를 넣어 확인). 학습자 확인 대기
- [ ] GitHub OAuth 연결 — 설정이 없을 때의 안내와 연결 경로 확인. 실제 GitHub 로그인은 학습자가 OAuth App을 만든 뒤 확인 대기
- [ ] 프로젝트 관리에서 연결한 GitHub의 공개 저장소 목록을 불러와 골라 추가, 이름으로 찾기, 주소 입력은 접힌 칸으로 — NamDanChu로 5개 목록, 찾기, KIT_Contest 추가를 Edge로 확인. 학습자 확인 대기
- [ ] 프로젝트 관리 상세에 기술 요약·만든 기능·난이도·알고리즘 — Edge로 확인. 학습자 확인 대기
- [ ] `.cursor/rules` 디자인 규칙으로 다시 디자인: `design/tokens/` 토큰, AA 대비 계산, 화면마다 h1 하나, 보이는 라벨, 세 가지 너비 — 7개 화면 × 1280/900/390px 확인, 스크립트 오류 없음. 학습자 확인 대기
- [ ] 프로젝트 안 설정에 "기여 순위에 공개" 켜기/끄기 — 끄면 내 총점 17 → 4(KIT 13점 빠짐), 다른 사람 점수 그대로, 다른 계정은 못 바꿈, 다시 켜면 돌아옴. 학습자 확인 대기
- [ ] 보안·보완 묶음: 대화 기록 파일 삭제, 학습 기록 커밋, 판단 한 시간 3회, 쿠키 Secure, 보안 헤더, 상황에 맞는 오류 문장, 커밋별 판단 결과 저장, 점수 조작 문장 제거, 메인 결과 익명화, 외부 전송 안내, 한국어·영어 설정 — 확인 30개 중 28개 통과, 실패 2개는 실제 계정의 공개 닉네임 "NamDanChu"를 테스트가 아이디 노출로 잘못 본 것. 같은 KIT_Contest를 세 번 판단해 13점 그대로. 학습자 확인 대기
- [ ] 왼쪽 맨 아래 Language: KR/EN 버튼, 메인의 시스템 설명, 모델이 읽지 않은 커밋은 점수에서 빼기, 0점은 순위에서 빼기, 시험용 순위 기록 비우기(백업 `data/app.db.backup-20261021`, 시험 계정 `demo_user` 삭제) — Edge로 확인, KIT_Contest 11점(읽은 커밋 11개, 읽지 않은 2개 제외). 학습자 확인 대기
- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: not started
Route and stops: not started
Edit outcome: not started
Reflection: not started
Activity mode: not started

## Revisions

- 메인 오른쪽에 아무것도 안 보이던 문제 — `app.js`의 `const top`이 브라우저의 `window.top`과 충돌해 스크립트가 죽었다. `topBar`로 바꿨다.
- 메인 화면 — 학습자 피드백으로 시스템 설명과 판단하기를 같은 화면에 두었다. 로그인·공개 프로젝트는 왼쪽 메뉴로 이어진다.
- 로그인·SQLCipher·공개 공유 — 피드백을 반영해 2–4단계를 이어서 붙였다. 판단 결과는 SQLCipher 파일에 남고, 설정에서 공유한 항목만 공개 프로젝트에 나온다.
- 초기 체크포인트를 다시 미완료로 돌렸다 — 학습자가 화면을 직접 써 보기 전에 체크되어 있었다. 학습자가 써 본 뒤에 체크한다.
- 서버가 꺼져 있거나 `index.html`을 파일로 열면 화면이 비고 클릭이 안 됐다 — `/app.js` 절대 경로가 파일 열기에서 깨졌다. 상대 경로로 바꾸고, 서버에 닿지 않으면 `node server.js` 실행 안내를 보여 준다.
- 계정 설정과 관리 메뉴, 닉네임별 공개 목록을 추가했다 — 학습자 피드백. 공개 프로젝트의 사람은 GitHub 기여자가 아니라 등록한 계정이고, 계정 공개는 처음에 꺼져 있다. `prd.md > 관리`, `prd.md > 계정 설정`, `spec.md > 계정 설정`에 적었다.
- 임시 닉네임을 계정 번호만으로 만들면 지워진 계정의 번호를 새 계정이 다시 받아 같은 임시 닉네임이 나왔다 — 가입 시각을 함께 넣어 만든다.
- 점수를 GitHub 숫자만으로 내던 것을 작업량 × 코드 난이도로 바꿨다 — 학습자 피드백. Cursor 에이전트 커밋이 `cursoragent`라는 별도 사람으로 잡혔는데, 커밋 메시지의 `Co-authored-by`와 연결된 PR로 실제 사람을 알 수 있었다. 작업량에서 PR은 연 것 대신 합쳐진 것만 센다.
- 공개 프로젝트를 프로젝트별 카드에서 사람별 기여 순위로, 점수를 기능별 합으로, 프로젝트 관리를 GitHub OAuth 연결 후 내 기여만 보는 곳으로 바꿨다 — 학습자 피드백. GitHub 아이디를 직접 입력하게 하면 남의 점수를 가져갈 수 있어 OAuth로 본인 확인을 한다. 프로젝트별 공유 설정은 없앴고, 이전 방식으로 저장된 프로젝트는 새 화면에 나오지 않는다. PR은 안의 커밋과 겹쳐 점수에서 뺐다.
- 전체 점검에서 로그인 5회 실패 잠금이 처음부터 동작하지 않은 것을 찾았다 — `locked()`가 아직 잠기지 않은 실패 기록을 지워, 틀린 횟수가 매번 1부터 다시 셌다. 잠금이 풀린 기록과 15분 지난 기록만 지우게 고쳤다. 같은 점검에서 PRD와 spec의 앞쪽 흐름·뒤쪽 정리가 예전 모습이라 지금 앱에 맞게 고쳤다.
- 모델이 읽지 않은 커밋에 평균 난이도를 매겨 더하자, express의 한 사람이 읽은 커밋 27개에 읽지 않은 3,854개가 더해져 7,762점이 되었다 — 학습자 피드백으로 읽지 않은 커밋은 점수에서 뺀다.
- 같은 저장소를 판단할 때마다 점수가 25 → 13 → 17로 흔들렸다 — 커밋별 판단 결과를 저장하고 새 커밋만 모델에 보내게 바꿨다. 판단 결과는 기능별 묶음이 아니라 커밋별로 저장한다.
- 메인 판단 결과는 GitHub 아이디를 그대로 보여 줘서, 점수로 순위의 랜덤 닉네임을 거꾸로 찾을 수 있었다 — 메인 결과도 순위와 같은 이름 규칙을 쓴다.
- 모델이 기능마다 커밋 번호를 나열하게 하자 11개 중 6개를 빠뜨렸다 — 커밋마다 기능 번호를 하나씩 적게 바꿨다. 사람 6명을 한 번에 보내자 분당 토큰 한도에 걸려 요약이 실패했다 — 사람마다 보내는 양을 줄이고, 묶음으로 나누고, 응답 헤더로 남은 한도를 보고 기다린다.
