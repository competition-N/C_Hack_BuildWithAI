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

- [x] Early usable behavior explored — after slice 1, when a real repo ranking and briefing are on screen
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

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
