---
doc: spec
status: approved
---

# 팀 프로젝트 기여도 — Technical Spec

## How This Works, In Plain Language

페이지는 HTML, CSS, JavaScript다. 그 페이지를 개인 공개 홈페이지의 VM에서 작은 Node.js 서버가 보여 준다. 서버만 VM 안의 데이터베이스 파일을 연다.

SQLite 데이터베이스 파일은 SQLCipher를 적용하여 AES-256으로 디스크 암호화 저장합니다. 비밀번호는 그 파일 안에 암호화된 문장으로 넣지 않고, Argon2id 해시로만 저장한다. 해시는 원문으로 되돌릴 수 없고, 맞는지 확인할 수만 있다.

로그인한 사람이 공개 GitHub 저장소 주소를 넣으면 서버가 GitHub에서 기여자와 커밋을 읽어 순위, 점수, 한 일을 계산한다. 기술 요약, 난이도 문장, 알고리즘 문장만 Groq 무료 구간에 물어본다. Groq가 실패해도 순위는 남고, 문장은 README와 언어 정보로 대신 보여 준다.

설정에서 공유를 켜면 로그인하지 않은 사람도 공개 프로젝트에서 그 설명과 기여도를 본다. 끄면 그 목록에 나오지 않는다. 다른 사람의 비공개 프로젝트 목록은 보이지 않는다.

이 모양인 이유: 판단의 근거는 GitHub에 남겨 두고, 문장만 무료 모델에 맡기면 모델이 멈춰도 데모가 남기 때문이다. 파일 암호화는 디스크를 복사당했을 때를 위한 것이고, 로그인 비밀번호 보호는 해시가 맡는다.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

1. 방문자가 홈페이지를 연다. 브라우저가 `public/`의 HTML, CSS, JavaScript를 받는다. 왼쪽 열은 화면 왼쪽 전체를 차지하고, 메인은 설명을 보여 준다. Implements `prd.md > 메인`.
2. 가입 또는 로그인에서 아이디와 비밀번호를 보낸다. 서버가 Argon2id로 확인한다. 맞으면 세션 쿠키를 주고, 그 사람의 프로젝트만 목록으로 보낸다. 틀리면 목록으로 들어가지 않는다. Implements `prd.md > 프로젝트 목록`.
3. 목록이 비어 있으면 추가하기가 보인다. 공개 저장소 주소를 보내면 서버가 그 항목을 진행중으로 저장한 뒤 GitHub를 부른다. 끝나면 완료 또는 실패로 바꿔 목록을 다시 보여 준다. Implements `prd.md > 추가하기`, `prd.md > 판단 결과`.
4. 항목을 열면 전체가 그 상태의 결과다. 완료이면 기여도 API가 순위, 세부 점수, 한 일을, 문서 API가 기술 요약, 난이도, 알고리즘을 보낸다. Implements `prd.md > 기여도`, `prd.md > 문서`.
5. 설정의 공유를 켜면 그 프로젝트만 공개 목록에 들어간다. 로그인하지 않은 방문자는 그 목록만 본다. 삭제하면 그 사람의 목록에서 빠진다. Implements `prd.md > 설정`, `prd.md > 공개 프로젝트`.

## Stack

- **HTML, CSS, JavaScript** — 학습자가 고른 페이지 언어. 프레임워크 없음.
- **Node.js LTS** — 같은 언어로 VM에서 작은 서버를 돌리기 위해 골랐다. 정확한 버전은 빌드 시작 때 `node -v`로 확인하고, 여기와 다르면 이 문서를 고친다. https://nodejs.org/en/docs
- **better-sqlite3-multiple-ciphers** — SQLite를 SQLCipher 호환 모드로 연다. 이 라이브러리의 기본 암호는 sqleet이므로, 빌드는 `cipher=sqlcipher`, `legacy=4`로 연다. 그 모드의 디스크 암호화는 AES-256이다. 빌드 첫 단계에서 [SQLite3MultipleCiphers](https://github.com/utelle/SQLite3MultipleCiphers) 문서와 맞는지 확인하고, 기본값 sqleet로 저장하지 않는다. https://github.com/m4heshd/better-sqlite3-multiple-ciphers
- **argon2** — 비밀번호 해시. Argon2id, 메모리 19MiB, 반복 2, 병렬 1. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet
- **GitHub REST API** — 순위, 점수, 한 일. https://docs.github.com/en/rest
- **Groq OpenAI 호환 Chat Completions** — 기술 요약, 난이도 문장, 알고리즘 문장. 무료 모델의 정확한 이름은 자주 바뀌므로 빌드 시작 때 Groq 콘솔의 무료 목록에서 고르고, 고른 이름을 이 문서에 적는다. https://console.groq.com/docs/openai

## Where It Runs and How Someone Tries It

VM의 Node 서버가 페이지를 제공한다. 데모 영상과 공개 GitHub 저장소가 둘 다 필요하고, 홈페이지 주소는 그 영상을 대신하지 않는다. 다른 사람은 그 HTTPS 주소로 가입하고 공개 저장소를 판단할 수 있다.

필요한 것: Node.js LTS, VM에만 두는 환경변수 `SQLCIPHER_KEY`, `GITHUB_TOKEN`, `GROQ_API_KEY`, `SESSION_SECRET`. 값의 예시는 `.env.example`에만 두고, 실제 값은 커밋하지 않는다.

시작은 프로젝트 루트에서 `node server.js`다. 브라우저로 그 VM의 공개 HTTPS 주소를 연다. 영상에 담을 장면은 가입, 공개 저장소 주소 하나 판단, 기여도와 문서, 설정에서 공유를 켠 뒤 로그아웃 상태의 공개 프로젝트다.

배포 대상은 학습자의 개인 공개 홈페이지 VM이다. 빌드 때 그 주소가 HTTPS인지 확인한다. HTTP이면 `Secure` 쿠키를 쓸 수 없으므로, HTTPS를 켠 뒤에 공개한다. 구체적인 프로세스 관리자 이름은 아직 모른다.

## Look and Feel

`prd.md > Look and Feel`과 `scope.md > Inspiration & Identity`를 그대로 쓴다. 참고는 [이환 사키리 가이드](https://alkapa.gg/neverness-to-everness/characters/sagiri)의 아카이브 느낌이다. 글자와 색은 정하지 않았다. 정한 배치는 CSS 그리드로 만든다. 왼쪽 열은 `100vh`로 화면 왼쪽 전체를 차지한다. 프로젝트 이름과 서브 카테고리 상단은 그 열의 오른쪽 칸에만 둔다. 프레임워크가 없으므로 CSS가 이 배치를 직접 그린다.

## Components

### 페이지 껍데기

왼쪽 카테고리와 오른쪽 내용을 그린다. 프로젝트 안에서는 오른쪽 위에만 이름과 전체, 기여도, 문서, 설정을 둔다.
PRD ref: `prd.md > 메인`, `prd.md > Screens and Layout`.

### 로그인과 세션

가입과 로그인, 로그아웃. 비밀번호는 Argon2id로 확인한다. 성공하면 무작위 세션 아이디를 SQLCipher 파일에 저장하고, 브라우저에는 `HttpOnly`, `Secure`, `SameSite=Lax` 쿠키만 준다. 같은 아이디의 실패가 5회를 넘으면 15분 동안 거절한다.
PRD ref: `prd.md > 프로젝트 목록`.

### 프로젝트 목록

세션의 사용자 프로젝트만 진행중, 완료, 실패로 보여 준다. 비어 있으면 추가하기만 보여 준다.
PRD ref: `prd.md > 프로젝트 목록`.

### 추가하기와 판단

공개 저장소 주소만 받는다. `https://github.com/소유자/저장소` 형태가 아니면 실패로 저장한다. 맞으면 진행중으로 저장한 뒤 GitHub를 읽고, 이어서 Groq에 문장을 맡긴다. 서버가 끝나기 전에 브라우저를 닫아도 서버는 결과를 파일에 쓴다. 웹훅 입력은 없다.
PRD ref: `prd.md > 추가하기`, `prd.md > 판단 결과`.

### 기여도

점수 = GitHub contributors의 contributions 수 + 그 사람이 연 PR 수. 순위 = 점수 내림차순. 한 일 = 그 사람 최근 커밋 메시지. 이 숫자는 Groq가 바꾸지 않는다.
PRD ref: `prd.md > 기여도`.

### 문서

Groq에는 README 일부, 사용 언어, 상위 파일 이름만 보내고, 기술 요약, 난이도 문장, 알고리즘 문장만 받는다. 실패하면 README 첫 문단과 언어 목록을 기술 요약으로 저장하고, 난이도와 알고리즘에는 모델 응답이 없었다는 문장을 저장한다.
PRD ref: `prd.md > 문서`.

### 설정

소유자만 삭제, 연동 확인, 공유를 본다. 연동 확인은 마지막 GitHub 호출이 성공했는지다. 공유를 켜야 공개 목록에 올라간다. 삭제하면 그 프로젝트와 기여 행이 파일에서 빠진다.
PRD ref: `prd.md > 설정`.

### 공개 프로젝트

로그인 없이, 공유가 켜진 프로젝트의 이름, 기술 요약, 순위와 점수를 보여 준다. 없으면 "정보 없음".
PRD ref: `prd.md > 공개 프로젝트`.

### 데이터베이스

서버만 연다. 웹 주소로 파일을 내려받지 못한다. 열쇠 `SQLCIPHER_KEY`가 없으면 서버는 시작하지 않고, 암호 없는 파일을 만들지 않는다.
PRD ref: `prd.md > States and Boundaries`.

## Data Model

SQLite 데이터베이스 파일은 SQLCipher를 적용하여 AES-256으로 디스크 암호화 저장합니다. 경로는 `data/app.db`이고 Git에는 넣지 않는다. 사용자가 나갔다가 같은 계정으로 다시 들어오면 이 파일의 그 사용자 행을 다시 읽는다.

- **users** — id, username, password_hash, created_at. 비밀번호 원문은 없다.
- **sessions** — id, user_id, expires_at. 쿠키에는 id만 있다.
- **projects** — id, user_id, repo_url, status(`진행중` `완료` `실패`), failure_reason, shared, connection_ok, tech_summary, difficulty, algorithms, updated_at.
- **contributions** — id, project_id, author, score, rank, work.

갱신이 끝나기 전에 다시 열면 이전 `projects`와 `contributions`가 그대로다. 완료는 GitHub 점수와 문서 문장이 모두 저장된 때다. Groq만 실패하면 대체 문장을 저장하고 완료로 둔다.

## File Structure

```
project/
├── server.js              # HTTP 진입. 정적 파일과 API
├── package.json
├── .env.example           # 키 이름만. 실제 값 없음
├── data/                  # Git 제외. SQLCipher 파일
│   └── app.db
├── public/
│   ├── index.html         # 왼쪽 열과 오른쪽 화면
│   ├── styles.css         # 왼쪽 전체 높이, 상단은 오른쪽만
│   └── app.js             # 화면 전환과 요청
├── src/
│   ├── db.js              # SQLCipher로 열기, 테이블
│   ├── auth.js            # Argon2id, 세션, 시도 제한
│   ├── github.js          # 저장소, 기여자, 커밋, PR, 점수
│   ├── groq.js            # 문장 3개, 실패 시 대체 문장
│   └── projects.js        # 목록, 추가, 공유, 삭제
├── devpost/               # 학습 문서
└── README.md              # 시작 방법
```

## External Services and Dependencies

### GitHub REST

문서: https://docs.github.com/en/rest

- `GET /repos/{owner}/{repo}`
- `GET /repos/{owner}/{repo}/contributors?per_page=100`
- `GET /repos/{owner}/{repo}/languages`
- `GET /repos/{owner}/{repo}/readme`
- `GET /repos/{owner}/{repo}/commits?per_page=30`
- `GET /repos/{owner}/{repo}/pulls?state=all&per_page=100`

헤더: `Authorization: Bearer GITHUB_TOKEN`, `Accept: application/vnd.github+json`, `User-Agent` 하나. 토큰은 서버에만 있다. 인증된 호출의 현재 한도는 빌드 시작 때 [공식 한도 문서](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)로 확인한다. 비용은 공개 저장소 읽기 기준 없다.

### Groq

문서: https://console.groq.com/docs/openai

`POST https://api.groq.com/openai/v1/chat/completions`

본문: `model`(빌드 때 고른 무료 모델 이름), `messages`(README 일부, 언어, 파일 이름, 그리고 기술 요약·난이도·알고리즘만 하라는 지시). 헤더: `Authorization: Bearer GROQ_API_KEY`. 키는 서버에만 있다. 2026-10-12 확인 기준으로 무료 구간은 분당 약 30회, 하루 약 1,000회다. https://freellm.today/ 한도는 바뀌므로 빌드 시작 때 Groq 콘솔에서 다시 본다. 키 발급에 카드가 필요한지는 그 콘솔에서 확인한다.

### SQLCipher 파일

문서: https://github.com/utelle/SQLite3MultipleCiphers

별도 데이터베이스 서버는 없다. VM 디스크의 파일이다. 열쇠는 `SQLCIPHER_KEY`다.

## Important Failure Modes

- **주소가 없거나 비공개 저장소이거나 GitHub가 거절함** → 그 항목은 실패이고, 전체에는 "실패"와 GitHub가 돌려준 이유 문장이 보인다. 이전 완료 내용이 있으면 그 행을 지우기 전에 실패만 기록하지 않고, 이전 완료를 유지한 채 이번 시도가 실패했다는 문장을 실패 사유에 남긴다. 첫 시도이면 저장 내용은 실패 사유뿐이다.
- **Groq가 한도 또는 네트워크로 실패함** → 순위, 점수, 한 일은 완료로 저장한다. 문서 문장은 README와 언어로 만든 대체 문장이다.
- **SQLCIPHER_KEY가 없음** → 서버는 시작하지 않는다. 암호 없는 SQLite 파일을 만들지 않는다.
- **비밀번호가 틀림** → 목록으로 들어가지 않고, 같은 실패 문장만 보여 비밀번호가 있는지는 알려 주지 않는다.

## What Was Simplified and Why

- **주소를 넣은 요청 안에서 판단을 끝냄** 대신 대기열이나 웹훅 — 진행중은 그 요청이 끝나기 전의 상태다. 백그라운드 작업은 데모에 필요 없다.
- **기여 점수는 커밋 수와 PR 수** 대신 모델이 난이도로 점수를 바꿈 — 학습자가 점수와 순위는 GitHub 데이터로 두라고 했다. PR만 열고 커밋 작성자가 다른 경우는 커밋 쪽에 안 잡힐 수 있다.
- **SQLCipher는 디스크의 파일만 암호화** 대신 서버가 뚫려도 내용을 못 읽게 하는 구성 — 서버가 켜져 있으면 열쇠도 같은 VM에 있다. 그 한계를 숨기지 않는다.
- **비공개 GitHub 저장소와 웹훅은 없음** — `scope.md > Later`, `prd.md > Deferred From the POC`.

## Decisions and Open Issues

- 학습자: 페이지는 HTML, CSS, JavaScript. 개인 공개 홈페이지 VM에 올리고, 영상과 링크로 다른 사람이 판단하게 한다.
- 학습자: 작은 서버와 SQLite. 계정은 지금 둔다. 공유는 로그인 후 프로젝트를 등록하고 설정에서 켠다.
- 학습자: 요약, 난이도, 알고리즘 문장만 Groq 무료 구간. 점수와 순위는 GitHub 데이터.
- 학습자: "SQLite 데이터베이스 파일은 SQLCipher를 적용하여 AES-256으로 디스크 암호화 저장합니다." 이 문장을 명세에 넣으라고 했다.
- 학습자가 물은 점: SQLite에 로그인 암호화가 있는지. 확인 결과는, 로그인 비밀번호는 [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet)대로 Argon2id 해시이고, SQLCipher는 파일 암호화라는 것이다. 학습자가 그 파일 암호화 문장을 추가하라고 해서 둘 다 명세에 넣었다.
- 구현에서 따라온 선택: 서버는 Node.js, 계정 입력은 아이디와 비밀번호, 세션은 서버 저장 아이디와 httpOnly 쿠키. 승인 때 바꾸면 이 문서를 고친다.
- `prd.md > Open Questions`의 실패 사유 목록은 GitHub가 돌려준 문장으로 정했다. spec을 막지 않는다.
- 빌드 시작 때 확인할 것: Node LTS 버전, SQLCipher pragma가 AES-256 파일을 만드는지, Groq 무료 모델 이름과 카드 필요 여부, GitHub 토큰 한도, 홈페이지 HTTPS 여부.
