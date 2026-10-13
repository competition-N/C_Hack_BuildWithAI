---
doc: spec
status: draft
---

# 외부 API 현황 분석 도구 — 기술 계획

## How This Works, In Plain Language
React 화면과 Node.js 서버를 Next.js 프로젝트 하나에 둔다. GitHub 로그인과 사용자별 저장은 Supabase가 맡는다. 서버는 공개 저장소의 코드를 읽어 외부 API 호출을 찾되 코드를 실행하지 않는다. API 목록과 호출 파일·관련 함수를 저장해 다른 기기에서도 보여준다.
실제 응답 점검은 별도다. 사용자가 등록한 점검 주소에만 서버가 조회 요청을 보내며, 필요한 읽기 전용 키는 암호화해 보관한다. 하루 한 번 예약 실행이 켜진 계정의 점검 대상을 검사한다. 코드 분석 시점과 실제 응답 점검 시점을 구별한다.
문서는 구현 전 설계 초안이다. 사용자 요청에 따라 5-build는 시작하지 않는다.

## The Core Journey Through the System
1. GitHub 로그인 → Supabase Auth가 세션을 발급 → Next.js 서버가 로그인 사용자를 확인한다.
2. 저장소 목록 → 사용자 ID로 접근 제한된 DB 조회 → 등록 목록·최근 분석 상태를 표시한다.
3. 공개 GitHub 주소 등록 → 서버가 주소와 공개 여부 검증 → 저장. 등록 직후 분석 설정은 기본 true다.
4. 분석 → 기본 브랜치의 커밋 SHA 확정 → 같은 SHA의 트리와 코드 읽기 → JS/TS 구문 분석 → 호출 목록 생성 → 마지막 성공 결과 교체.
5. API 선택 → 왼쪽 목록과 오른쪽 상세 → 호출 파일·줄·함수명과 코드 근거, 확정 주소 또는 미해결 구성식을 보여준다.
6. 점검 주소·조건·키 등록 → 서버가 주소 검증 후 비밀값 암호화 → DB에 점검 설정 저장.
7. 일일 예약 실행 → 자동 점검이 켜진 대상 재확인 → 지정 주소 조회 → 조건 판정 → 최신 점검 결과 저장.
PRD: The Core Journey, API 목록과 상세, Scheduled API Checks.

## Stack
- 사용자 동의: Next.js App Router + React + TypeScript, Node.js 서버 런타임. https://nextjs.org/docs / https://react.dev/ / https://nodejs.org/en/docs
- 사용자 동의: Supabase Auth + PostgreSQL. GitHub 로그인과 계정별 동기화. https://supabase.com/docs
- 사용자 동의: Vercel 배포 및 하루 한 번 Cron. https://vercel.com/docs/cron-jobs
- 설계 제안: @supabase/ssr 및 @supabase/supabase-js로 서버 세션 처리. https://supabase.com/docs/guides/auth/server-side/creating-a-client
- 설계 제안: @babel/parser 및 @babel/traverse로 JS/TS/JSX/TSX 구문 트리 분석. 문자열 검색만으로 판단하지 않는다. https://babeljs.io/docs/babel-parser / https://babeljs.io/docs/babel-traverse
- 설계 제안: Node crypto AES-256-GCM, undici와 ipaddr.js로 서버 암호화·통제된 외부 요청. https://nodejs.org/api/crypto.html / https://undici.nodejs.org/ / https://github.com/whitequark/ipaddr.js
정확한 패키지 버전은 구현 시작 시 상호 호환되는 안정 버전을 확인하고 lockfile로 고정한다. 현재 버전 설치나 호환성 실행 검증은 하지 않았다.

## Components

### Account and Repository UI
PRD: Screens and Layout, GitHub 로그인과 계정별 동기화.
로그인, 저장소 목록·추가, 결과의 좌측 API/우측 상세, 계정 설정. HTTP 전송에 필요한 비밀값은 저장 시 한 번만 입력하고 조회 응답에는 hasCredential만 반환한다. 등록 후 자동 분석과 일일 자동 점검은 독립 설정이며 모두 기본 true다.

### GitHub Source Reader
PRD: 저장소 등록과 분석 실행.
https://github.com/{owner}/{repo} 형태를 정규화해 계정별 중복을 막는다. GitHub API로 공개 여부와 기본 브랜치 확인. refs/heads/{branch}에서 commit SHA를 얻고 해당 commit의 tree SHA로 파일 목록을 조회한다. 모든 코드 링크는 동일 commit SHA를 사용한다.
첫 설계 한도: 저장소당 JS/TS 소스 100개, 파일당 200 KiB, 전체 소스 5 MiB, 분석 60초. node_modules, dist, build, .git, lockfile, 바이너리, .env 및 비밀 파일 제외. 파싱 오류 파일과 스캔 제외 수를 표시한다. 한도·truncated 초과는 조용히 완전 분석으로 저장하지 않고 이유와 함께 실패 처리한다. 큰 저장소 지원은 후속 작업이다. 이는 검토용 제안 한도다.
공개 저장소 분석용 GitHub 토큰은 서버 전용 최소 권한으로 구성하며 사용자 로그인 토큰으로 비공개 코드를 읽지 않는다. 내려받은 코드를 설치·실행하지 않는다.

### Static Call Analyzer
PRD: API 목록과 상세. 사용자 합의: JS/TS, fetch·axios, OpenAI·Supabase·Stripe SDK, 조합 주소.
- fetch(url), axios(url/config), axios.get/post 등, axios.create({baseURL})의 흔한 인스턴스 사용 지원.
- import 및 require의 실제 바인딩을 따라 별칭을 구분한다. 같은 이름의 로컬 함수는 SDK 호출로 단정하지 않는다.
- 문자열 리터럴, const 참조, + 연결, 템플릿 문자열, 상대 경로의 정적 named/default export를 제한적으로 추적한다. 순환·재할당·실행 함수·복잡한 동적 값은 unresolved로 표시한다. 상대 import만 해석하고 탐색 깊이 5로 제한한다.
- SDK 어댑터: openai 생성자 및 responses.create/chat.completions.create, Supabase createClient와 from().select/insert/update/delete·auth·storage 체인, Stripe 생성자 및 resource.method 호출. 지원 패턴만 탐지하며 모든 버전·wrapper를 보장하지 않는다.
- SDK는 서비스 이름·operation·생성 위치·호출 위치를 표시한다. SDK 메서드에서 정확한 HTTP 경로를 추측해 확정하지 않는다. baseURL/프로젝트 URL이 해석될 때만 표시한다.
- 관련 기능은 둘러싼 함수/메서드명, 익명일 때 파일의 최상위 호출로 표시한다. 자연어 기능 의미는 추측하지 않는다.
- 결과는 service/origin별 그룹 + 호출별 file,line,column,method,operation,functionName,addressExpression,resolution,evidence. 미해결 origin은 별도 그룹. 키·토큰·URL 사용자정보·민감 쿼리는 결과와 근거 코드에서 마스킹한다.
- 내부 상대 API 경로는 외부 API로 확정하지 않고 미해결/내부 후보로 구분한다.
SDK 문서: https://github.com/openai/openai-node / https://supabase.com/docs/reference/javascript/introduction / https://github.com/stripe/stripe-node

### Analysis Persistence
PRD: 결과 저장과 교체, 분석 상태와 실패.
분석 시작마다 attempt ID와 상태를 기록하고 저장소별 lease로 동시 실행을 막는다. 성공만 마지막 성공 snapshot을 트랜잭션으로 교체한다. 실패/미검출은 이전 snapshot을 유지하고 최근 attempt만 실패로 갱신한다. stale 실행이 새 결과를 덮지 못하도록 attempt ID를 비교한다. 장시간 lease 만료 시 중단 사유를 표시한다. 모든 호출 파일 파싱이 실패한 경우 성공으로 처리하지 않는다.

### Check Configuration and Credentials
PRD: Credential Boundaries, Check Criteria.
API 항목에서 HTTPS 점검 주소 1개를 등록한다. 자동 발견 주소로 임의 요청하지 않는다. 분석 결과가 갱신되어도 점검 설정은 별도 ID로 유지하며 파일 줄번호에 종속시키지 않는다.
첫 제안: GET만, 인증 없음 / Authorization Bearer / 사용자 지정 API-key 헤더. 헤더 이름은 토큰 문법 검증 및 Host,Cookie,Forwarded 등 전송 제어 헤더 차단. 인증값의 개행 차단. URL 쿼리 인증과 OAuth 갱신은 제외한다. 읽기 전용 권한은 사용자가 발급 서비스에서 설정해야 하며 서버가 보장하지 않는다.
AES-256-GCM으로 credential 값을 암호화하고 매 저장 시 새 nonce 사용. AAD는 owner ID와 check ID. DB에는 ciphertext,nonce,tag,keyVersion 저장. 복호화 키는 서버 환경변수에만 보관하고 DB와 분리한다. 브라우저·로그로 내보내지 않는다. 수정은 교체, 삭제는 credential 제거와 해당 인증 점검 중지. 키 회전은 keyVersion에 따른 재암호화 절차를 문서화한다.
암호화는 앱 서버 자체 탈취를 막아주지 않는다. 브라우저와 DB 사이 직접 credential 조회를 허용하지 않으며 서버는 소유권을 확인한다.

### Outbound Request Guard
PRD: Credential Boundaries.
임의 주소 요청으로 내부망에 접근하는 SSRF를 막는다. HTTPS 443만, URL 사용자정보 금지, localhost·IP literal·사설/루프백/링크로컬/예약 IPv4·IPv6 및 클라우드 메타데이터 차단. DNS의 모든 A/AAAA를 검사하고 연결할 주소를 검증된 IP로 고정하되 원래 hostname의 TLS 인증서와 SNI를 검증한다. DNS 재해석으로 우회하지 못하도록 custom lookup을 적용한다. 리디렉션 자동 추적은 끄며 3xx는 기준 판정 대상 응답으로만 처리한다.
타임아웃 10초, 응답 본문 최대 256 KiB, 재시도 없음, 대상당 1회/일 자동 요청. 요청 본문·결제·메일 발송 호출은 실행하지 않는다. 원래 코드에 적힌 비밀값을 추출해 사용하지 않는다. 오류·URL·헤더 로그는 마스킹한다. 주소 차단은 실행 실패로 저장한다.

### Check Evaluator
PRD: Check Criteria, Check Acceptance Criteria.
기본은 200–299. 사용자 예상 코드를 지정하면 그 코드와 정확 일치. 선택 JSON 조건 1개: 점으로 구분한 객체 키 경로, 문자열/숫자/불리언/null 예상값과 타입까지 일치. 경로 문법은 실행식·스크립트·prototype 키를 지원하지 않는다. 필드 누락, JSON 파싱 불가, 값 불일치 이유 구분. 응답 body 전체는 저장하지 않고 코드·소요 시간·조건 판정·안전한 이유·시점만 저장한다.
HTTP를 받았지만 조건이 다르면 미충족. 연결/시간초과/차단은 실행 실패. 점검 미설정은 별도 상태. 이전 통과 결과로 최신 실패를 가리지 않는다.

### Daily Scheduler
PRD: Scheduled API Checks.
Vercel Cron 1개가 매일 00:00 UTC(한국 09시대)에 서버 /api/cron/checks를 호출하는 설계 제안. Hobby는 해당 시간대 내 지연 가능하며 정확한 24시간 간격이 아니다.
CRON_SECRET 인증 후 DB에서 dailyChecksEnabled와 유효한 점검 설정을 재확인한다. UTC 날짜+check ID 유일 키로 중복 요청을 억제하고 lease를 잡는다. disabled 이후 이미 시작한 요청은 취소 보장하지 않으며 새 요청 시작 직전에 설정을 다시 확인한다.
첫 배포 설계 한도: 전체 활성 점검 20개, 사용자당 5개, 동시 2개, 전체 150초 실행 예산. 예약 Function은 180초 한도를 요청하되 실제 플랜 허용값을 배포 전 확인한다. 중단 시 누락 대상을 실패/미실행 사유로 표시하며 완료를 가장하지 않는다. 예약 자동 재시도는 없다. 서버 장애·무료 DB 일시 중지로 하루를 건너뛸 수 있고 SLA는 제공하지 않는다.
한도 밖 확장은 durable queue 또는 별도 worker가 필요하다. 무료 단일 실행으로 무제한 전체 검사를 약속하지 않는다. 이 한도와 전역 1회/일 방식은 승인 대상 설계 제안이다.

## Data Model
Supabase Postgres, 모든 시간 UTC 저장·화면은 사용자 시간대 표시.
- user_settings: user_id PK→auth.users, analyze_on_add=true, daily_checks_enabled=true.
- repositories: id,owner_id,normalized_url,github_owner,name,created_at; unique(owner_id,normalized_url).
- repository_analyses: repository_id PK,owner_id,last_success_snapshot JSONB,last_success_at,commit_sha,latest_attempt_id/status/at/reason,lease_until. snapshot은 1개.
- checks: id,owner_id,repository_id,label,url,auth_type,header_name,expected_code nullable,json_path/expected_value nullable,enabled,latest_result JSONB,last_checked_at,lease_until,last_claimed_day. 최신 실제 점검 결과 1개.
- check_credentials: check_id PK,owner_id,ciphertext,nonce,tag,key_version. 서버 전용 접근, 공개 schema의 클라이언트 권한 제거.
RLS: 일반 테이블은 auth.uid()=owner_id, settings는 user_id. 자식의 repository/check 소유자 일치는 서버 검증과 DB 제약/함수에서 강제한다. 서버의 service-role 권한은 RLS 우회하므로 사용자가 전달한 owner_id를 신뢰하지 않는다. cron 전용 접근과 인증 사용자 경로를 분리한다. 로그아웃 시 클라이언트 캐시를 비운다.

## File Structure
계획 파일만 나열하며 아직 생성하지 않는다.
```
src/app/
  layout.tsx, globals.css           # 공통 배치·팔레트
  login/page.tsx, auth/callback/route.ts
  repositories/page.tsx            # 등록 목록
  repositories/[id]/page.tsx       # API 목록·상세
  settings/page.tsx                # 자동 분석·일일 점검
  api/repositories/route.ts        # GET 목록, POST 등록
  api/repositories/[id]/analysis/route.ts # GET 상태, POST 분석
  api/checks/route.ts              # GET, POST 설정
  api/checks/[id]/route.ts         # PATCH 설정·키 교체, DELETE
  api/settings/route.ts            # GET, PATCH
  api/cron/checks/route.ts          # 인증된 일일 예약 실행
src/components/                    # RepoList, ApiList, ApiDetail, CheckForm, Status
src/lib/
  supabase/{server,browser,admin}.ts # 세션/서버 전용 client 분리
  github/{client,source-reader}.ts
  analyzer/{parse,resolve,extract,redact}.ts
  analyzer/adapters/{http,openai,supabase,stripe}.ts
  checks/{guard,request,evaluate,scheduler,credentials}.ts
  data/{repositories,analyses,checks,settings}.ts
  validation.ts, limits.ts
supabase/migrations/               # 테이블·RLS·원자적 claim/저장
 tests/                            # 분석 fixture·서버 보안·화면 흐름
.env.example                       # 값 없는 변수명
vercel.json, package.json, README.md
devpost/                           # 승인 계획과 학습 문서
```

## External Services and Dependencies
### GitHub Source Contracts
GET api.github.com/repos/{owner}/{repo} → private,default_branch.
GET /repos/{owner}/{repo}/git/ref/heads/{branch} → object.sha.
GET /repos/{owner}/{repo}/git/commits/{sha} → tree.sha.
GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1 → tree[path,type,sha,size],truncated.
GET /repos/{owner}/{repo}/git/blobs/{sha} → base64 content,encoding,size. API 버전 헤더는 구현 시 유효한 버전을 확인한다.
Authorization Bearer 서버 토큰, Accept application/vnd.github+json. 403/429와 요청 제한 응답을 존중하고 한도 소진 시 중단한다. 짧은 시간에 반복 재시도하지 않는다.
Docs: https://docs.github.com/en/rest/repos/repos#get-a-repository / https://docs.github.com/en/rest/git/refs / https://docs.github.com/en/rest/git/commits / https://docs.github.com/en/rest/git/trees / https://docs.github.com/en/rest/git/blobs / https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

### Supabase Contracts
signInWithOAuth({provider: github, options: {redirectTo}})로 로그인 URL을 얻고 callback에서 exchangeCodeForSession(code)으로 세션을 교환한다. 서버에서 인증 사용자를 검증한다. /rest/v1/{table} 요청은 사용자 JWT와 RLS를 적용한다. service-role은 서버 전용이며 원자적 claim과 결과 저장 RPC의 실행 권한을 제한한다.
문서: https://supabase.com/docs/guides/auth/social-login/auth-github / https://supabase.com/docs/guides/auth/server-side/creating-a-client / https://supabase.com/docs/guides/database/postgres/row-level-security / https://supabase.com/docs/guides/api
무료 이용 조건: https://supabase.com/pricing 에서 용량·전송량·비활성 시 일시 중지와 최신 이용 조건을 도입 시 다시 확인한다. 무료 서비스의 무중단 동작은 보장하지 않는다.

### Vercel Contracts
cron GET /api/cron/checks, Authorization Bearer CRON_SECRET. 전역 예약 실행 하나가 하루 한 번 사용자별 활성 설정을 DB에서 읽는다.
문서: https://vercel.com/docs/cron-jobs/usage-and-pricing / https://vercel.com/docs/cron-jobs/manage-cron-jobs / https://vercel.com/docs/functions/limitations / https://vercel.com/docs/plans/hobby
2026-10-13 확인: Hobby는 하루 한 번 cron, 실행 시각은 시간 단위 오차가 있으며 Function 이용 제한도 적용된다. 상용화 전 이용 자격·요금도 확인한다.

## Where It Runs and How Someone Tries It
구현 후 npm install, .env.example을 .env.local로 복사해 설정, Supabase migration 적용, npm run dev 후 http://localhost:3000 접속.
필요 설정: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, GITHUB_SOURCE_TOKEN, CREDENTIAL_ENCRYPTION_KEY, CRON_SECRET, NEXT_PUBLIC_SITE_URL. NEXT_PUBLIC 접두사가 없는 비밀값은 서버 전용이다. GitHub OAuth client secret은 Supabase에 설정한다. 실제 비밀값은 채팅·저장소에 기록하지 않는다.
Vercel에 저장소 연결, 환경변수와 Supabase 허용 redirect URL 설정, migration 후 배포한다. 로컬에서는 자동 cron이 없으므로 향후 테스트 대상으로 인증된 예약 handler를 수동 검증한다.
제출에는 짧은 데모 영상과 공개 GitHub 저장소가 필요하며 배포 URL은 영상을 대체하지 않는다. 이번에는 계획만 작성하며 서비스 생성·배포·키 등록은 하지 않는다.

## Look and Feel
Docker Desktop을 참고한 개발 도구 배치. 배경 #010736, 면 #0D1C42, 선택·경계 #22396F, 글자·주요 버튼 #FCF1D0. 시스템 서체와 한국어 UI, 코드는 고정폭 서체. 좁은 화면에서 목록과 상세를 세로로 배치한다. 라벨·키보드 조작·포커스 표시를 제공한다.
PRD: Look and Feel, Screens and Layout.

## Verification Plan
- 분석 fixture: fetch/axios, 세 SDK, import 별칭·require, 파일 간 상수, 조합 주소, 환경변수 미해결, 이름 가림·내부 경로·순환 참조. 기대 파일·줄·호출과 비교한다.
- GitHub reader: 동일 커밋 고정, truncated·한도·요청 제한·파싱 실패, 이전 성공 결과 보존.
- 권한: 두 계정 사이 저장소·점검·인증 정보 접근 차단을 DB와 서버 양쪽에서 확인.
- 외부 요청: 사설 IPv4/IPv6, metadata, 리디렉션, DNS 변경, 시간 초과, 본문 크기, 비밀값 마스킹을 통제된 테스트 대상으로 검증.
- 판정: 2xx, 예상 코드, JSON 값·타입 일치와 누락·비JSON, 401/429, 시간 초과.
- 예약: 기본 켜짐·끄기, 중복 실행 방지, lease, 중간 비활성화, 한도 초과 처리.
- 전체 흐름: 로그인→등록→분석→API 선택→기기 간 설정·결과 확인→이전 성공+최신 실패→새 성공 교체→점검 결과. 배포 후 예약 실행 1회를 관측해 기록한다. 모의 자료는 명시하고 실제 탐지 검증을 대체하지 않는다.

## What Was Simplified and Why
JS/TS와 세 SDK의 명시적 패턴, 제한된 정적 값 추적만 지원한다. 함수명은 코드 근거를 사용하고 자연어 의미를 추측하지 않는다. 분석에 유료 모델은 필요 없다. OAuth 갱신, 변경 요청 점검, 장애 주입, 여러 결과 이력은 제외한다.

## Implementation Order for Later
1. 작은 코드 예제에서 API 탐지와 근거 확인.
2. GitHub reader와 실제 목록 화면 연결.
3. 로그인·RLS·저장·실패 시 이전 결과 보존·설정 동기화.
4. 인증 정보 암호화·외부 요청 보호·조건 판정과 점검 결과.
5. 일일 예약·중복 방지·배포 검증.
각 구간에서 PRD의 완료 기준을 검증한다. 향후 작업 순서이며 5-build를 시작한 것이 아니다.

## Decisions and Open Issues
- 사용자 동의: Next.js/Supabase/Vercel, JS/TS, fetch/axios, 세 SDK, 조합 주소 추적, 일일 점검, 읽기 전용 키, 판정 조건, 기본 켜짐.
- 학습 목표는 구현 계획 작성법이다. 요구사항을 구성요소·데이터·검증 작업에 연결했다. 사용자는 현재 추가로 궁금한 점이 없다고 했으며 이해도·숙련도를 추정하지 않는다.
- 검토·승인할 설계 제안: Babel 분석, 제한된 import 추적, GET/HTTPS만, 세 인증 방식, JSON 조건 하나, 암호화, 전역 예약 하나, 한국 09시대 실행, 분석·점검 한도.
- 구현 시 확인: 패키지 안정 버전·호환성, 무료 플랜 최신 제약·이용 자격, Node 런타임, 180초 실행 지원. 충족하지 못하면 배포 전에 재설계한다.
- 확장한 요구사항은 원래 2~4시간 시제품 목표를 초과할 가능성이 높다. 짧은 시간의 완성을 약속하지 않고 위 작업 구간으로 나눈다.
- scope.md는 최초 승인 범위이고 prd.md에는 이후 승인한 변경이 포함된다. 실제 점검 제외와 충돌하면 PRD의 Scope Amendment가 우선한다.
- 사용자 지시: 4단계 문서 검토까지 진행하며 5단계 코드 구현·서비스 설정은 시작하지 않는다.

