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
- **Groq OpenAI 호환 Chat Completions** — 사람별 기능 분석, 기술 요약, 만든 기능, 난이도 문장, 알고리즘 문장. 사람 분석은 `openai/gpt-oss-120b`, 프로젝트 요약은 한도가 모자라면 `openai/gpt-oss-20b`로 보낸다. https://console.groq.com/docs/openai
- **GitHub OAuth App** — 계정에 본인의 GitHub 아이디를 연결한다. https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

## Where It Runs and How Someone Tries It

VM의 Node 서버가 페이지를 제공한다. 데모 영상과 공개 GitHub 저장소가 둘 다 필요하고, 홈페이지 주소는 그 영상을 대신하지 않는다. 다른 사람은 그 HTTPS 주소로 가입하고 공개 저장소를 판단할 수 있다.

필요한 것: Node.js LTS, VM에만 두는 환경변수 `SQLCIPHER_KEY`, `SESSION_SECRET`, `GITHUB_TOKEN`, `GROQ_API_KEY`, `GROQ_MODEL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `PUBLIC_URL`. 선택으로 `GROQ_FALLBACK_MODELS`. 값의 예시는 `.env.example`에만 두고, 실제 값은 커밋하지 않는다. OAuth App의 callback URL은 로컬이면 `http://localhost:3000/api/github/callback`, 배포하면 `https://(홈페이지 주소)/api/github/callback`이다. OAuth App 하나에 callback URL이 하나라서, 로컬용과 배포용 앱을 따로 만든다.

시작은 프로젝트 루트에서 `node server.js`다. 브라우저로 그 VM의 공개 HTTPS 주소를 연다. 영상에 담을 장면은 메인에서 공개 저장소 하나 판단(기능별 점수, 기술 상세), 가입과 GitHub 연결, 프로젝트 관리에 내 저장소 추가, 계정 공개를 켠 뒤 공개 프로젝트의 기여 순위 검색과 사람 화면이다.

배포 대상은 학습자의 개인 공개 홈페이지 VM이다. 빌드 때 그 주소가 HTTPS인지 확인한다. HTTP이면 `Secure` 쿠키를 쓸 수 없으므로, HTTPS를 켠 뒤에 공개한다. 구체적인 프로세스 관리자 이름은 아직 모른다.

## Look and Feel

`prd.md > Look and Feel`과 `scope.md > Inspiration & Identity`를 그대로 쓴다. 참고는 [이환 사키리 가이드](https://alkapa.gg/neverness-to-everness/characters/sagiri)의 어두운 왼쪽 메뉴다. 배치는 CSS 그리드다. 왼쪽 메뉴는 화면 높이만큼 고정되고, 화면 제목과 결과 탭은 오른쪽 본문 안에만 있다.

토큰의 출처는 `design/tokens/colors.md`, `typography.md`, `spacing.md`이고, `public/styles.css`의 `:root`가 그 값을 그대로 쓴다. 표에 없는 색이나 간격은 쓰지 않는다. 화면마다 `h1`이 하나다. 결과 탭은 `aria-pressed` 버튼 묶음이고, 화면을 바꾸면 그 화면의 `h1`으로 초점을 옮긴다. 안내 문구는 그 동작을 한 섹션 바로 아래에 `role="status"`(실패는 `role="alert"`)로 붙인다. 좁음(~719px), 중간(720~1023px), 넓음(1024px~) 세 구간을 둔다. 좁은 화면에서는 왼쪽 메뉴가 위쪽 가로 메뉴가 되고, 표는 가로로 스크롤된다.

## Components

### 페이지 껍데기

왼쪽 카테고리와 오른쪽 내용을 그린다. 프로젝트 안에서는 오른쪽 위에만 이름과 전체, 기여도, 문서, 설정을 둔다.
PRD ref: `prd.md > 메인`, `prd.md > Screens and Layout`.

### 로그인과 세션

가입과 로그인, 로그아웃. 비밀번호는 Argon2id로 확인한다. 성공하면 무작위 세션 아이디를 SQLCipher 파일에 저장하고, 브라우저에는 `HttpOnly`, `Secure`, `SameSite=Lax` 쿠키만 준다. 같은 아이디의 실패가 5회를 넘으면 15분 동안 거절한다.
PRD ref: `prd.md > 프로젝트 목록`.

### 프로젝트 목록

`GET /api/my/projects`. GitHub가 연결된 계정만 쓴다(없으면 409). `user_projects`로 등록한 저장소를 고르고, 저장소마다 `repo_people`에서 내 GitHub 아이디의 행만 돌려준다. 다른 팀원의 행과 기술 상세는 보내지 않는다. `DELETE /api/my/projects/{repoId}`는 내 목록에서만 뺀다. `GET /api/my/projects/github-repos`는 서버의 `GITHUB_TOKEN`으로 `GET /users/{login}/repos?type=all&sort=pushed`(내 저장소, 협업자 저장소)와 `GET /search/commits?q=author:{login}`(내가 커밋한 다른 사람의 저장소)을 합쳐 공개 저장소만 돌려준다. 사용자마다 5분 동안 서버 메모리에 담아 둔다. 사용자의 GitHub 토큰은 쓰지 않는다.
PRD ref: `prd.md > 프로젝트 목록`, `prd.md > 설정`.

### 추가하기와 판단

`server.js`의 `judgeRepo(url)` 하나가 판단을 맡는다. GitHub 읽기 → 사람별 분석 → 점수 → 프로젝트 요약 → `repos`/`repo_people` 저장 순서다. 같은 저장소를 다시 판단하면 그 저장소 행을 갱신하고 사람 행을 바꿔 쓴다. 실패하면 저장하지 않고, 이미 있던 저장소면 `failure_reason`만 남긴다.

- `POST /api/judge` — 메인. 로그인 없이 쓰고, 저장소 전체 결과를 돌려준다.
- `POST /api/my/projects` — 판단한 뒤 내 GitHub 아이디의 행이 있을 때만 `user_projects`에 넣는다.
- `POST /api/my/projects/{repoId}/rejudge` — 내 목록에 있는 저장소만 다시 판단한다.

웹훅 입력은 없다.
PRD ref: `prd.md > 추가하기`, `prd.md > 판단 결과`.

### 기여도

`src/github.js`가 사람별 숫자를 모으고, `src/groq.js`의 `analyzePeople`가 코드를 읽고, `src/score.js`가 점수를 낸다.

- **AI 에이전트 합치기** — 작성자가 `cursoragent`, `copilot*`, `claude*`, `codex*`, `devin*`, `[bot]` 등이면 에이전트로 본다. 그 에이전트의 커밋(최대 100개)에서 `Co-authored-by:` 를 읽어 GitHub 아이디로 바꾼 뒤 그 사람의 커밋으로 센다. 사람마다 `agentCommits`, `agentLogins`를 따로 저장해서, 나중에 "AI 에이전트 커밋 포함" 설정을 붙일 때 다시 판단하지 않고 점수를 다시 낼 수 있다. 공동 작성자를 못 찾은 에이전트 커밋은 에이전트 이름으로 남는다.
- **분석 대상** — 커밋 수 상위 6명. 사람마다 커밋 메시지 최대 40개를 모으고(합친 에이전트 커밋 포함, 머지 커밋 제외), 모델에는 최대 25개를 50자로 보낸다. 앞 커밋 최대 3개는 파일 4개, 파일마다 바뀐 코드 앞 200자까지 함께 보낸다. 사람 한 명이 2,400자를 넘으면 코드 길이, 코드 커밋 수, 메시지 수 순서로 줄인다.
- **모델 응답** — 사람마다 `features: [{f, name, tech, difficulty}]`와 `assign`(커밋 순서대로 기능 번호 f). 커밋마다 기능 번호를 하나씩 적게 해서 빠뜨리는 커밋을 줄였다. 난이도 기준은 1=문서·오타·설정, 2=단순 화면·데이터 수정, 3=기능 하나, 4=여러 모듈에 걸친 기능·알고리즘, 5=복잡한 알고리즘·구조·보안. `temperature 0`, gpt-oss는 `reasoning_effort: low`.
- **점수** (`src/score.js`) — 기능 점수 = 그 기능에 배정된 커밋 수 × 난이도. 사람 점수 = 기능 점수의 합. 배정되지 않은 커밋은 "기능으로 묶이지 않은 커밋"(난이도 1), 모델에 보내지 않은 나머지 커밋은 "모델이 읽지 않은 커밋"(그 사람의 평균 난이도)으로 더한다. 분석 대상 밖의 사람은 커밋 수 × 1이고 "난이도 분석 안 됨"으로 보인다. PR은 점수에 넣지 않는다.
- **한도 관리** — Groq 무료 구간은 모델마다 분당 8,000 토큰이다. 사람 여러 명을 7,500자 단위로 묶어 차례로 보내고, 응답 헤더 `x-ratelimit-remaining-tokens`와 429 응답의 "Used N"으로 남은 양을 기억해, 모자라면 다시 찰 때까지만 기다린다. 사람 분석은 한 판단 안에서 `GROQ_MODEL` 하나만 쓴다. 사람마다 다른 모델이 난이도를 매기면 공정하지 않기 때문이다. 프로젝트 요약만 한도가 모자랄 때 `GROQ_FALLBACK_MODELS`(기본 `openai/gpt-oss-20b`)로 보낸다.
- 한계: 커밋이 많은 사람은 대부분이 평균 난이도로 계산된다. 같은 코드도 다시 판단하면 기능 묶음과 난이도가 조금 다를 수 있다.

PRD ref: `prd.md > 기여도`.

### 문서

사람별 분석이 끝난 뒤, Groq에 README 일부, 사용 언어, 상위 파일 이름, 최근 커밋 메시지 40개, 사람별 한 일을 보내고 기술 요약, 만든 기능(3~8개), 난이도 문장, 알고리즘 문장을 받는다. 만든 기능은 `repos.features`에 저장한다. 기술 상세는 메인의 `POST /api/judge` 응답에만 담는다. 실패하면 README 첫 문단과 언어 목록을 기술 요약으로 저장하고, 난이도와 알고리즘에는 모델 응답이 없었다는 문장을 저장한다.
PRD ref: `prd.md > 문서`.

### 공개 프로젝트 (기여 순위)

`GET /api/ranking?q=`와 `GET /api/ranking/{code}`. 로그인 없이 쓴다. `repo_people`을 GitHub 아이디(대소문자 무시)로 묶어 점수를 더하고, AI 에이전트 행은 뺀다. 사람마다 `code` = `SESSION_SECRET`로 `gh:` + 소문자 GitHub 아이디를 HMAC한 16자리. 보이는 이름은 그 아이디에 연결된 계정이 있고 `account_public`이 1이면 닉네임, 아니면 코드로 고른 "형용사+동물#4자리" 랜덤 닉네임이다. 검색은 보이는 이름에만 걸고, 응답에는 GitHub 아이디를 넣지 않는다. 전체 순위를 먼저 매긴 뒤 검색으로 거르므로 검색 결과의 순위도 전체 순위다. 최대 100명.
PRD ref: `prd.md > 공개 프로젝트`.

### 계정 설정

`src/account.js`와 `POST /api/account/nickname`, `/visibility`, `/github/disconnect`, `/password`, `/delete`. 비밀번호 변경과 계정 삭제는 지금 비밀번호를 Argon2id로 확인하고, 로그인과 같은 5회 실패 후 15분 거절을 쓴다. 비밀번호를 바꾸면 지금 세션을 뺀 나머지 세션을 지운다. 계정 삭제는 한 트랜잭션에서 `user_projects`, 이전 방식의 프로젝트, 세션, 계정을 지운다. `repos`/`repo_people`의 GitHub 기록은 남는다. 왼쪽의 관리 메뉴는 `public/index.html`의 `#nav-manage`이고 로그인 상태에서만 보인다.
PRD ref: `prd.md > 관리`, `prd.md > 계정 설정`.

### GitHub 연결

`src/oauth.js`. GitHub OAuth App을 쓰고, 권한(scope)은 요청하지 않는다. 공개 프로필의 아이디만 받는다.

1. `GET /api/github/connect` — 로그인한 계정만 쓴다. 무작위 `state`를 만들어 계정 번호와 10분 만료로 서버 메모리에 두고, `https://github.com/login/oauth/authorize?client_id&redirect_uri&state&allow_signup=false`로 보낸다.
2. `GET /api/github/callback` — `state`가 있고, 만료 전이고, 같은 계정의 세션일 때만 진행한다. `POST https://github.com/login/oauth/access_token`으로 코드를 토큰으로 바꾸고, `GET https://api.github.com/user`로 `login`과 `id`를 받는다. 토큰은 저장하지 않고 버린다. 그 `id`가 다른 계정에 이미 있으면 `/?github=taken`, 아니면 `users.github_login`/`github_id`에 쓰고 `/?github=linked`로 돌아간다.
3. 화면은 `?github=` 값을 읽어 설정 화면에 결과를 보여 주고 주소에서 지운다.

`redirect_uri`는 `PUBLIC_URL` + `/api/github/callback`이다. OAuth App에 적은 Authorization callback URL과 같아야 한다. 세션 쿠키가 `SameSite=Lax`라 GitHub에서 돌아오는 첫 GET에도 쿠키가 붙는다. `GITHUB_CLIENT_ID`나 `GITHUB_CLIENT_SECRET`가 없으면 설정 화면에 연결할 수 없다는 안내만 보인다.
PRD ref: `prd.md > 계정 설정`.

### 데이터베이스

서버만 연다. 웹 주소로 파일을 내려받지 못한다. 열쇠 `SQLCIPHER_KEY`가 없으면 서버는 시작하지 않고, 암호 없는 파일을 만들지 않는다.
PRD ref: `prd.md > States and Boundaries`.

## Data Model

SQLite 데이터베이스 파일은 SQLCipher를 적용하여 AES-256으로 디스크 암호화 저장합니다. 경로는 `data/app.db`이고 Git에는 넣지 않는다. 사용자가 나갔다가 같은 계정으로 다시 들어오면 이 파일의 그 사용자 행을 다시 읽는다.

- **users** — id, username, password_hash, created_at, nickname, account_public, github_login, github_id. 비밀번호 원문과 GitHub 토큰은 없다. nickname은 가입 때 아이디와 같고, account_public은 처음에 0이다. github_id는 중복될 수 없다. 기존 파일에는 서버가 켜질 때 칸을 추가한다.
- **sessions** — id, user_id, expires_at. 쿠키에는 id만 있다.
- **repos** — id, repo_url(대소문자 무시, 하나만), name, status, failure_reason, tech_summary, difficulty, algorithms, features, updated_at. 저장소마다 가장 최근 판단 하나.
- **repo_people** — id, repo_id, github_login(대소문자 무시), score, rank, work, detail. detail은 JSON으로 isAgent, workSource, features(name, tech, difficulty, commits, points, kind), analyzedCommits, commits, agentCommits, agentLogins, prsOpened, prsMerged, additions, deletions, filesChanged, sampledCommits를 담는다. 기여 순위는 이 표를 더한다.
- **user_projects** — user_id, repo_id, created_at. 프로젝트 관리 목록.
- **projects**, **contributions** — 이전 방식의 표. 더는 쓰지 않고, 계정 삭제 때만 지운다.

재판단이 끝나기 전에 다시 열면 이전 `repos`와 `repo_people`이 그대로다. Groq만 실패하면 대체 문장을 저장하고 완료로 둔다.

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
│   ├── account.js         # 닉네임, 랜덤 닉네임, 계정 삭제
│   ├── oauth.js           # GitHub 연결
│   ├── github.js          # 저장소, 기여자, 커밋, PR, AI 에이전트 합치기
│   ├── groq.js            # 사람별 기능 분석, 프로젝트 요약, 한도 관리
│   ├── score.js           # 기능별 커밋 수 × 난이도의 합
│   └── repos.js           # 판단 저장, 기여 순위, 내 프로젝트
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
- **난이도는 최근 커밋 표본으로만 매김** 대신 전체 기록을 읽음 — Groq 무료 구간이 분당 8,000 토큰이라 전체 코드를 보낼 수 없다. 처음에는 점수를 GitHub 숫자로만 냈으나, `5-build` 피드백으로 학습자가 코드 난이도를 점수에 넣기로 바꿨다.
- **SQLCipher는 디스크의 파일만 암호화** 대신 서버가 뚫려도 내용을 못 읽게 하는 구성 — 서버가 켜져 있으면 열쇠도 같은 VM에 있다. 그 한계를 숨기지 않는다.
- **비공개 GitHub 저장소와 웹훅은 없음** — `scope.md > Later`, `prd.md > Deferred From the POC`.

## Decisions and Open Issues

- 학습자: 페이지는 HTML, CSS, JavaScript. 개인 공개 홈페이지 VM에 올리고, 영상과 링크로 다른 사람이 판단하게 한다.
- 학습자: 작은 서버와 SQLite. 계정은 지금 둔다. 공유는 로그인 후 프로젝트를 등록하고 설정에서 켠다.
- 학습자: 요약, 난이도, 알고리즘 문장만 Groq 무료 구간. 점수와 순위는 GitHub 데이터. `5-build`에서 바꿈: 점수에 코드 난이도를 넣고, 한 일은 코드 변경을 읽어 요약하며, 공동 작성자가 있는 AI 에이전트 커밋은 그 사람에게 합친다.
- 학습자: "SQLite 데이터베이스 파일은 SQLCipher를 적용하여 AES-256으로 디스크 암호화 저장합니다." 이 문장을 명세에 넣으라고 했다.
- 학습자가 물은 점: SQLite에 로그인 암호화가 있는지. 확인 결과는, 로그인 비밀번호는 [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet)대로 Argon2id 해시이고, SQLCipher는 파일 암호화라는 것이다. 학습자가 그 파일 암호화 문장을 추가하라고 해서 둘 다 명세에 넣었다.
- 구현에서 따라온 선택: 서버는 Node.js, 계정 입력은 아이디와 비밀번호, 세션은 서버 저장 아이디와 httpOnly 쿠키. 승인 때 바꾸면 이 문서를 고친다.
- `prd.md > Open Questions`의 실패 사유 목록은 GitHub가 돌려준 문장으로 정했다. spec을 막지 않는다.
- 빌드 시작 때 확인할 것: Node LTS 버전, SQLCipher pragma가 AES-256 파일을 만드는지, Groq 무료 모델 이름과 카드 필요 여부, GitHub 토큰 한도, 홈페이지 HTTPS 여부.
