# CONTEXT.md

운영자(대장)·향후 작업자를 위한 아키텍처 요약 + 배포 체크리스트. 코드 수준 가이드는 `CLAUDE.md`, AI 사령부 운영은 `docs/AGENT_COMMAND_CENTER.md` 참고.

## 1. 한 줄 요약

**대경안심전기**(dkansim.com)는 단일 Next.js 15 앱으로, 메인 사이트(`dkansim.com`)·경영 사령부(`hq.dkansim.com`)·주간 보고 아카이브(`report.dkansim.com`)·AI 파이프라인 모니터(`agent.dkansim.com`)·콘텐츠 마케팅 사령부(`contents.dkansim.com`)를 **하나의 Vercel 배포**에서 미들웨어 host 라우팅으로 서빙한다.

## 2. 서브도메인 라우팅 구조

`src/middleware.ts`가 요청의 `Host` 헤더를 보고 내부 경로를 재작성(rewrite)한다. 브라우저 주소창의 URL은 그대로 유지되고, Next.js 라우팅만 아래처럼 내부적으로 바뀐다.

| 외부 호스트 | 외부 경로 (브라우저) | 내부 라우팅 경로 | 비고 |
|---|---|---|---|
| `dkansim.com` (또는 호스트 prefix 없음) | `/admin/...` | `/admin/...` | 변경 없음 |
| `hq.dkansim.com` | `/` | `/hq` | AI 경영 사령부 |
| `hq.dkansim.com` | `/login` | `/hq/login` | 사령부 로그인 |
| `report.dkansim.com` | `/` | `/report` | 주간 보고 아카이브 |
| `agent.dkansim.com` | `/` | `/agent` | AI 파이프라인 모니터 (YouTube 수집·Gemini 분석·Cron/파이프라인 로그) |
| `contents.dkansim.com` | `/` | `/contents` | 콘텐츠 마케팅 사령부 (유튜브/카카오/블로그 승인 큐, 네이버 트렌드) |
| `dkansim.com` | `/blog`, `/blog/[slug]` | `/blog`, `/blog/[slug]` | 공개 블로그 (게시된 글만 노출, SEO + 예약 CTA) |

- 정적 파일 요청(`/\.[^/]+$/`에 매칭, 예: `/favicon.ico`, `/uploads/...`)은 host 재작성 이전에 그대로 통과시켜 `/public` 자산이 깨지지 않도록 한다.
- `hq`/`report`/`agent`/`contents`는 admin 인증 게이트(`dk_admin_auth=ok`)를 공유한다. `/report`, `/agent`, `/contents`는 자체 로그인 페이지가 없으므로 미인증 시 `hq.dkansim.com/login`으로 리다이렉트(`?next=` 포함)한다.
- `/blog`, `/blog/[slug]`는 입주민 인증(`dk_resident_auth`) 없이 누구나 접근 가능하도록 `src/lib/service-journey.ts`의 `residentSessionNotRequired`에 등록되어 있다.
- 로컬 개발에서는 DNS 없이 Host 헤더를 바꿔 테스트 가능:
  ```bash
  curl -H "Host: hq.dkansim.com" http://localhost:3000/
  curl -H "Host: hq.dkansim.com" http://localhost:3000/login
  curl -H "Host: report.dkansim.com" http://localhost:3000/
  curl -H "Host: agent.dkansim.com" http://localhost:3000/
  curl -H "Host: contents.dkansim.com" http://localhost:3000/
  ```
  또는 dev 서버에서 직접 `/hq`, `/hq/login`, `/report`, `/agent`, `/contents` 경로로도 접근 가능(둘 다 동작하도록 레이아웃이 양쪽 경로를 처리).

## 3. 배포 체크리스트 (대장이 직접 진행)

이 저장소의 코드 변경만으로는 서브도메인이 동작하지 않는다. Vercel 프로젝트에 도메인을 추가하고 DNS를 연결해야 한다.

1. **Vercel 대시보드** → 해당 프로젝트 → **Settings → Domains**
2. `hq.dkansim.com` 추가 → Vercel이 안내하는 DNS 레코드(보통 `CNAME hq → cname.vercel-dns.com`)를 도메인 등록업체(예: 가비아, Cloudflare)에 등록
3. `report.dkansim.com`도 동일하게 추가 + CNAME 등록
4. `agent.dkansim.com`도 동일하게 추가 + CNAME 등록 — AI 파이프라인 모니터(`/agent`)
5. `contents.dkansim.com`도 동일하게 추가 + CNAME 등록 — 콘텐츠 마케팅 사령부(`/contents`)
6. 모든 서브도메인은 **같은 Vercel 프로젝트**를 가리켜야 한다 (별도 프로젝트 생성 X) — 코드가 단일 배포 안에서 미들웨어로 라우팅을 분기하기 때문
7. DNS 전파 후 `https://hq.dkansim.com`, `https://report.dkansim.com`, `https://agent.dkansim.com`, `https://contents.dkansim.com` 접속 → `/admin/login`(메인 도메인)에서 로그인한 쿠키(`dk_admin_auth`, `domain=.dkansim.com`)가 서브도메인에서도 인증되는지 확인
8. (선택) `https://hq.dkansim.com/login`에서 직접 로그인도 가능 — `/api/admin/login`을 그대로 사용

> 쿠키 도메인 공유는 `NODE_ENV=production`에서만 `domain: ".dkansim.com"`이 적용된다. 로컬 개발(`localhost`)에서는 host-only 쿠키로 동작하며 `/hq`, `/report`, `/agent` 경로 직접 접근 시에도 정상 인증된다.

## 4. 신규 Supabase 테이블 (마이그레이션 025)

`supabase/migrations/025_youtube_pipeline_and_hq.sql` — 유튜브/Gemini 인사이트 파이프라인(§7) 스키마 + hq 콘텐츠 승인 컬럼:

| 테이블/컬럼 | 용도 |
|---|---|
| `youtube_channels` | 모니터링할 유튜브 채널 목록 (channel_id UNIQUE) |
| `youtube_videos` | 채널별 영상 메타데이터 + 자막 (FK → youtube_channels) |
| `youtube_insights` | 영상별 Gemini 분석 결과 (FK → youtube_videos) |
| `agent_logs` | AI 에이전트 실행 로그 (level: debug/info/warn/error) |
| `pipeline_logs` | 파이프라인 실행 이력 (status: started/success/failed) |
| `agent_reports.approved`, `agent_reports.approved_at` | hq에서 "콘텐츠 승인"한 보고서 → report.dkansim.com 아카이브에 노출 |

> **알려진 이슈**: `npm run db:apply`는 마이그레이션 021(`electrical_tips`)의 `CREATE POLICY`가 비-idempotent(`IF NOT EXISTS` 미지원)라 이미 정책이 존재하면 거기서 실패한다. 001부터 전부 재실행하는 구조라 022~025는 표준 스크립트로 재적용 불가 — 025는 1회성 스크립트로 직접 적용·검증했다. 021 자체는 이번 작업 범위 밖이라 수정하지 않았다.

## 5. 신규 환경변수 (유튜브/Gemini 파이프라인)

`.env.example` 참고:

| 변수 | 용도 |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 — 채널별 최신 영상 수집 (`/api/cron/youtube-collect`) |
| `GEMINI_API_KEY` | Gemini API — 영상 자막 분석 (`/api/cron/youtube-analyze`) |
| `GEMINI_MODEL` | 선택. 미설정 시 `gemini-2.0-flash` |

값이 비어 있으면 두 cron 라우트 모두 500(설정 안내 메시지)을 반환할 뿐 다른 기능에는 영향 없음.

## 6. 쿠키 도메인 공유 전제

- `src/app/api/admin/login/route.ts`, `src/app/api/admin/logout/route.ts`, `src/middleware.ts`(첫 방문 시 쿠키 삭제) 모두 운영(`NODE_ENV=production`)에서 `dk_admin_auth`/`dk_first_visit_checked` 쿠키에 `domain: ".dkansim.com"`을 설정한다.
- 이를 통해 `dkansim.com`에서 로그인하면 `hq.dkansim.com`, `report.dkansim.com`에서도 같은 세션으로 인증된다.
- 도메인 속성이 빠지면(예: 코드 회귀) host-only 쿠키가 되어 서브도메인에서 인증이 풀린다 — 회귀 시 우선 의심할 지점.

## 7. 유튜브/Gemini 인사이트 파이프라인 (Task 4-5)

`agent.dkansim.com`(`/agent`)에서 현황을 모니터링한다. 3단계로 구성되며 GitHub Actions(`.github/workflows/youtube-transcripts.yml`)가 매일 06:00 KST(UTC 21:00)에 순서대로 실행한다 (`workflow_dispatch`로 수동 실행도 가능):

1. **수집** — `GET /api/cron/youtube-collect` (CRON_SECRET 인증, `maxDuration=60`)
   - `youtube_channels`에서 `active=true`인 채널마다 YouTube Data API `search.list`로 최신 영상 5개 조회
   - `youtube_videos`에 신규 행 삽입(UNIQUE `video_id` 충돌은 skip 처리)
2. **자막 수집** — `scripts/fetch-youtube-transcripts.mjs` (GitHub Actions 러너에서 yt-dlp 사용)
   - `transcript IS NULL`인 영상 최대 20건에 대해 yt-dlp로 자막(ko/en, srt 변환) 다운로드 → 텍스트로 정제 후 `youtube_videos.transcript` 업데이트
   - Vercel 서버리스 함수에는 yt-dlp 바이너리를 둘 수 없어 별도 단계로 분리
3. **분석** — `GET /api/cron/youtube-analyze` (CRON_SECRET 인증, `maxDuration=120`)
   - `transcript IS NOT NULL`이고 아직 `youtube_insights`에 없는 영상 최대 5건을 Gemini로 분석
   - 결과(`summary`, `insights.{key_points,content_ideas,relevance}`, `model`)를 `youtube_insights`에 삽입

각 단계는 `src/lib/pipeline-logs.ts`(`logAgentEvent`, `startPipelineRun`, `finishPipelineRun`)로 `agent_logs`/`pipeline_logs`에 기록되며, `/agent`에서 채널별 수집 현황·최근 분석 결과·로그·실행 이력을 확인할 수 있다.

GitHub Actions 시크릿 필요: `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. (대장이 GitHub repo → Settings → Secrets and variables → Actions에서 등록)

## 8. 콘텐츠 마케팅 사령부 (Task — 026 마이그레이션)

`contents.dkansim.com`(`/contents`)에서 유튜브 PD·카카오 매니저·블로그 에디터 3개 콘텐츠 에이전트(`src/lib/content-agents.ts`)의 산출물을 검토·승인한다. `supabase/migrations/026_content_command_center.sql`이 `blog_posts`, `naver_trends`, `content_youtube_queue`, `content_kakao_queue`, `youtube_oauth_tokens` 테이블을 생성한다.

### 8.1 주간 사이클 (Vercel Cron, `vercel.json`)

| 일시 (KST) | cron 표현식(UTC) | 경로 | 내용 |
|---|---|---|---|
| 월 09:00 | `0 0 * * 1` | `/api/cron/content-plan` | 네이버 트렌드 수집(설정 시) + `planContentWeek`로 이번 주 유튜브/카카오/블로그 기획, 큐·`blog_posts`(draft)에 삽입 |
| 화 09:00 | `0 0 * * 2` | `/api/cron/content-draft` | 유튜브 스크립트+썸네일 기획, 카카오 포스트 본문, 블로그 본문(최대 2건) 생성 → `pending_approval` |
| 수 08:00 | `0 23 * * 2` | `/api/cron/content-approval-notify` | 승인 대기 건수 집계, 1건 이상이면 카카오 메모로 알림 |

### 8.2 승인 → 실 배포

`/contents`(`src/components/contents/content-approval-panel.tsx`)에서 승인/반려:

- **블로그** — 승인 시 `blog_posts.status='published'` + `published_at` 설정 → 즉시 `dkansim.com/blog/[slug]`에 노출
- **카카오** — 승인 시 `KAKAO_ACCESS_TOKEN`으로 실제 "나에게 보내기" 메모 전송(`publishKakaoPost`) 후 `status='published'` — 대장이 메모를 보고 채널에 직접 옮겨 발행
- **유튜브** — 승인 시 영상 파일을 함께 업로드하면 YouTube Data API로 실제 업로드(`uploadYoutubeVideo`) 후 `status='uploaded'` + `youtube_video_id` 저장; 파일 없이 승인하면 `status='approved'`(추후 수동 업로드 대기)

### 8.3 유튜브 OAuth 연동

`/contents`의 "유튜브 연동하기" → `/api/auth/youtube/connect`(Google OAuth 동의 화면) → `/api/auth/youtube/callback`(코드 교환, `youtube_oauth_tokens`에 토큰 저장). `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` 미설정 시 연동 버튼이 503을 반환한다. 리디렉션 URI는 `YOUTUBE_REDIRECT_URI` 또는 `${NEXT_PUBLIC_APP_URL}/api/auth/youtube/callback`.

### 8.4 신규 환경변수

`.env.example` 참고:

| 변수 | 용도 |
|---|---|
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 검색/데이터랩 API — 트렌드 키워드, 경쟁 블로그 분석 (`naver_trends`) |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | 유튜브 업로드용 Google OAuth 2.0 |
| `YOUTUBE_REDIRECT_URI` | (선택) OAuth 콜백 URI |
| `KAKAO_REST_API_KEY` | 카카오 OAuth 앱 REST API 키 — `/contents`의 "카카오 연동하기"(`/api/auth/kakao/connect` → `/api/kakao/callback`)로 OAuth 토큰을 발급받아 `kakao_oauth_tokens`(Supabase)에 저장하고 자동 갱신 |
| `KAKAO_CLIENT_SECRET` | (선택) Kakao Developers에서 Client Secret을 활성화한 경우만 설정 |
| `KAKAO_REDIRECT_URI` | (선택) 기본값 `https://dkansim.com/api/kakao/callback` — Kakao Developers에 등록된 Redirect URI와 일치해야 함 |
| `KAKAO_ACCESS_TOKEN` | (선택, 레거시 폴백) OAuth 미연동 시 사용할 정적 토큰 |

값이 비어 있으면 해당 기능은 "설정 필요" 메시지를 반환하거나(Naver/YouTube), 알림을 건너뛴다(Kakao) — 다른 기능에는 영향 없음.

### 8.5 주간 보고 연동

매주 토요일 08:00 KST(`/api/cron/morning-report`, cron `0 23 * * 5`) 보고서·이메일에 `getContentPerformanceSummary`/`getPendingApprovalCounts` 결과(콘텐츠 성과 요약 + 승인 대기 건수)가 포함되고, 카카오 알림에도 승인 대기 건수가 추가된다.

## 9. 개선 요청 시스템 (hq.dkansim.com, 027 마이그레이션)

`hq.dkansim.com`(모든 `/hq/*` 페이지) 우측 하단 "⚙️ 개선 요청" 버튼 → 모달에서 유형(기능 추가/버그 수정/UI 변경/기타) + 내용 + 스크린샷(선택)을 제출하면, Claude가 분석해 GitHub Issue를 자동 생성하고 GitHub Actions가 코드를 구현·PR·배포까지 자동으로 진행하는 self-improvement 파이프라인. `supabase/migrations/027_improvement_requests.sql`이 `improvement_requests` 테이블을 생성한다.

### 9.1 흐름

1. **요청 제출** — `src/components/hq/improvement-request-widget.tsx` → `POST /api/admin/improvement-requests` (multipart, 스크린샷은 `saveImageFiles(files, "improvements")`로 업로드)
2. **AI 분석 + 이슈 생성** — `analyzeAndFileImprovementRequest`(`src/lib/improvement-requests.ts`)가 Claude(`callClaudeCustom`)로 제목/분석(영향 범위·접근법·작업 항목)을 생성 → `createGithubIssue`(`src/lib/github-issues.ts`)로 라벨 `ai-improvement` + 유형 라벨을 붙여 GitHub Issue 생성 → `improvement_requests.status='issue_created'`, 카카오 "접수" 알림(`notifyImprovementRequestReceived`)
3. **자동 구현 + PR** — `.github/workflows/ai-improvement-implement.yml`이 `ai-improvement` 라벨이 붙은 새 이슈에서 트리거되어 `anthropics/claude-code-action`으로 이슈를 구현하고 브랜치 `ai-improvement/issue-<N>`을 push. 이어서 워크플로우의 "Ensure PR exists and auto-merge is enabled" 스텝이 `gh pr create` + `gh pr merge --auto --squash`로 PR 생성·자동 머지 활성화를 항상 수행
4. **배포 + 완료 알림** — `.github/workflows/ai-improvement-deploy.yml`이 `ai-improvement/issue-*` 브랜치 PR이 머지되면 `npx vercel deploy --prod`로 배포 후 `POST /api/admin/improvement-requests/complete`(CRON_SECRET 인증) 호출 → `completeImprovementRequest`가 `status='completed'` + 카카오 "완료" 알림(`notifyImprovementRequestCompleted`); 배포 실패 시 `error`와 함께 호출되어 `status='failed'`
5. `/hq`의 위젯은 60초마다 폴링하며 미확인 건수(`acknowledged=false`)를 배지로 표시, 모달을 열면 전체를 확인 처리한다.

### 9.2 필요한 GitHub Actions 시크릿

| 시크릿 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Code Action — 이슈 구현 |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | `npx vercel deploy --prod` (이 프로젝트는 GitHub 자동 배포 연동이 없음) |
| `CRON_SECRET` | `/api/admin/improvement-requests/complete` 콜백 인증 (`.env.example`과 동일 값) |

`GITHUB_TOKEN`은 워크플로우에서 GitHub Actions가 자동 제공하는 토큰을 사용한다(별도 등록 불필요). 단, Vercel 환경의 앱이 GitHub Issue를 생성하려면 `.env.example`의 `GITHUB_TOKEN`(repo 권한 PAT)을 Vercel 프로젝트 환경변수에 별도로 설정해야 한다.

> **저장소 설정 필수**: `gh pr merge --auto --squash`가 동작하려면 GitHub 저장소 Settings → General → Pull Requests에서 "Allow auto-merge"가 켜져 있어야 한다. 꺼져 있으면 3단계의 auto-merge 활성화 명령이 조용히 실패한다.

> **알려진 제약**: GitHub Actions의 기본 `GITHUB_TOKEN`으로 생성·자동머지된 PR이 `pull_request: closed` 이벤트(워크플로우 B 트리거)를 정상적으로 발생시키는지는 실제 운영에서 확인이 필요하다. 트리거가 안 되면 워크플로우 A의 push/PR 생성/머지 단계를 `repo` 권한이 있는 PAT(예: `secrets.GH_PAT`)로 교체해야 한다.
