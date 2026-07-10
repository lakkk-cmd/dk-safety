# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**우리집 전기주치의(대경이엔피)** (dkansim.com) — a Next.js 15 home electrical inspection/repair booking platform for a solo electrician in Gwangju, Korea. Targets apartment residents; includes resident self-diagnosis, admin/worker portals, an AI executive command center powered by Claude, and a content marketing command center (YouTube/Kakao/blog) with human-in-the-loop approval before real publishing.

## Commands

```bash
npm run dev          # Start dev server (uses scripts/dev-safe.mjs wrapper)
npm run dev:raw      # Start Next.js dev server directly
npm run build        # Clean + next build
npm run lint         # ESLint via next lint

# Supabase / DB
npm run db:apply          # Apply migrations (requires .env.local)
npm run db:sync-env       # Sync DB environment vars
npm run storage:ensure    # Create Supabase storage buckets
npm run verify:supabase   # Verify Supabase connection
npm run sync:supabase     # Migrate local JSON data to Supabase

# Misc
npm run cron:test    # Test the morning cron job locally
npm run setup:deploy # One-shot GitHub + Vercel setup

# dk-brain 지식 체계
npm run brain:sync       # brain/wiki/**/*.md → knowledge_base + knowledge_chunks 임베딩 동기화
npm run brain:sync:ops   # Supabase(운영 데이터) → brain/ops/*.md 마크다운 미러
```

## 지식 체계 규칙 (dk-brain)

이 저장소는 `brain/`에 3층 지식 체계를 둔다 — 자세한 구조와 층간 흐름은 `brain/README.md` 참고.
`brain/raw/`(1층 원본) → `brain/wiki/`(2층 AI 가공 지식, `[[링크]]`로 상호연결) →
`knowledge_base`+`knowledge_chunks`(임베딩, `npm run brain:sync`). `brain/ops/`는 고회전
운영 데이터 미러로 임베딩 대상에서 제외된다(`brain/ops/README.md` 참고).

1. **세션 시작**: `brain/wiki/systems/`의 3줄 요약들을 훑고, 작업 주제와 관련된 문서만 전체를
   읽는다. 전부 읽지 않는다.
2. **세션 종료(또는 중요 결정 직후)**: 이번 세션의 결정·변경·발견을
   `brain/raw/sessions/YYYY-MM-DD-주제.md`에 기록한다. 형식: 결정사항 / 변경된 파일 /
   알게 된 것 / 미해결. 원본이므로 이후 수정 금지(append-only).
3. **위키 갱신 규칙**: raw에 새 기록이 들어오면, 영향받는 wiki 문서를 찾아 현행화한다. 새
   문서를 만들기 전에 반드시 기존 문서 갱신을 먼저 검토한다. 문서가 틀린 것으로 판명되면
   삭제하지 말고 `brain/wiki/lessons/`로 옮기고 사유를 적는다.
4. **링크 규칙**: 모든 `brain/wiki/` 문서는 최소 1개의 `[[링크]]`를 가져야 한다. 고아 문서
   (링크 0개)는 발견 시 연결하거나 통합한다.
5. **경계**: `brain/raw/`는 append-only. 고객 개인정보(전화번호, 주소 상세)는 `brain/`에
   저장하지 않는다 — CRM DB가 원본이며 위키에는 집계 수치만 담는다. API 키·시크릿은 어떤
   층에도 저장 금지.
6. **사실 우선순위**: 코드 > raw > wiki. 위키와 코드가 충돌하면 코드가 맞고 위키를 고친다.
   코드로 검증 불가능한 사실(사업자등록번호 등 외부 법적 정보)은 대표님 확인 없이 단정하지 않는다.

## Architecture

### Storage Strategy (dual-mode)

The app transparently switches between two storage backends based on env vars:

- **Local mode** (dev / no Supabase): JSON files in `data/` (`reservations.json`, `resident-db.json`), images in `public/uploads/`
- **Supabase mode** (production): JSON objects in Supabase Storage buckets; structured data (reservations, workers, tasks) in Supabase Postgres via the `postgres` driver

Detection logic lives in `src/lib/supabase-server.ts` (`SUPABASE_ENABLED`) and `src/lib/supabase-pg.ts` (`isSupabaseReservationsDbReady()`). The `*-store.ts` / `*-db.ts` files handle the branching transparently — callers don't need to know which backend is active.

### Key lib files

| File | Purpose |
|---|---|
| `src/lib/supabase-server.ts` | Raw Supabase Storage REST helpers (`readJsonObject`, `writeJsonObject`); `SUPABASE_ENABLED` flag |
| `src/lib/supabase-pg.ts` | Supabase Postgres client (`getSupabaseAdmin`, `isSupabaseReservationsDbReady`); separate flag `DK_SAFETY_USE_SUPABASE_DB` |
| `src/lib/reservations-store.ts` | Main reservation CRUD — routes through `reservations-pg.ts` (Postgres) or local JSON |
| `src/lib/resident-db.ts` | Resident users, sessions (HMAC-signed stateless tokens), apartments, self-diagnosis records |
| `src/lib/apartments-pg.ts` | Multi-tenant apartment management (Supabase Postgres only) |
| `src/lib/site-config.ts` | Global constants: cookie names, `siteConfig` object pulling env vars |
| `src/lib/admin-auth.ts` | Admin auth: checks `dk_admin_auth` cookie value |
| `src/lib/worker-session-server.ts` | Worker session extraction from `dk_worker_auth` cookie |
| `src/lib/agents.ts` | AI executive agents (CTO/CSO/CMO/COO/CFO/CLO + Chief); calls Claude API |
| `src/lib/agent-schedule.ts` | Weekly meeting schedule logic (KST time, first report + recurring Sunday 08:00) |
| `src/lib/activity-log.ts` | Admin activity log persistence |
| `src/lib/agent-db.ts` | Supabase client for agent/pipeline tables (`getAgentSupabase`, `requireAgentSupabase`, `isAgentSupabaseReady`) |
| `src/lib/youtube-pipeline.ts` | YouTube Data API v3 — fetch latest videos per channel (`fetchLatestVideos`), popular videos by keyword (`searchPopularVideos`), resolve channel from URL/handle/name (`resolveYoutubeChannel`), top videos by view count (`fetchChannelTopVideos`) |
| `src/lib/gemini-pipeline.ts` | Gemini API — analyze video transcripts into summary/insights (`analyzeVideoTranscript`) |
| `src/lib/pipeline-logs.ts` | `agent_logs`/`pipeline_logs` recording helpers (`logAgentEvent`, `startPipelineRun`, `finishPipelineRun`) |
| `src/lib/content-agents.ts` | Content marketing agents (유튜브 PD/카카오 매니저/블로그 에디터) — `planContentWeek`, `draftYoutubeScript`, `draftKakaoPost`, `draftBlogPost`, `summarizeContentPerformance` |
| `src/lib/content-pipeline.ts` | Content pipeline orchestration — weekly planning, drafting, approval-notify, approve/reject queue items |
| `src/lib/content-performance.ts` | Content performance self-learning loop — collects YouTube view/like/comment stats (via OAuth) and blog `view_count`, has Claude analyze them into lessons (`analyzeContentPerformance`), saves to `agent_memory` (`runContentPerformanceReview`, `loadPerformanceLessons`/`savePerformanceLessons`) |
| `src/lib/blog-store.ts` | `blog_posts` CRUD, slug generation (`slugify`/`ensureUniqueSlug`), publish/reject |
| `src/lib/naver-pipeline.ts` | Naver Search/DataLab API — trend keywords + competitor blog analysis, saves to `naver_trends` |
| `src/lib/market-intelligence.ts` | Market intelligence collection agent — Google News RSS (no key needed) + Naver blog/DataLab + YouTube popular videos across 3 categories (전기안전/자격시험/실무), Claude-analyzed into `market_intelligence_insights` (`runMarketIntelligenceCollection`) |
| `src/lib/youtube-channel-analysis.ts` | YouTube channel analysis agent — fetches a reference/competitor channel's top videos + best-effort captions (no API key, scrapes `captionTracks` from the watch page), Claude analyzes content patterns and proposes 10 video ideas across 전기안전/자격시험/실무, inserted into `content_youtube_queue` (`analyzeYoutubeChannel`) |
| `src/lib/youtube-upload.ts` | YouTube OAuth 2.0 flow + real video upload (`getYoutubeAuthUrl`, `exchangeYoutubeCode`, `uploadYoutubeVideo`) |
| `src/lib/kakao-publish.ts` | Kakao "나에게 보내기" memo API — `publishKakaoPost`, `sendContentApprovalNotification` |
| `src/lib/video-pipeline.ts` | Video production pipeline — decomposes an approved YouTube script into 5–8 scenes via Claude (`planVideoScenes`), resolves tagged real photos in place of AI generation where available (`resolveRealPhotoScenes`), generates remaining scenes' images via OpenRouter Flux (`generateSceneImage`), uploads to Supabase Storage and marks the queue item `assets_ready` (`produceVideoAssets`) |
| `src/lib/media-library.ts` | Tagged real-photo/background-music store for the video pipeline (`content_media_library` table) — `listMediaLibrary`, `addMediaLibraryEntry`, `deleteMediaLibraryEntry`, `listAvailablePhotoTags`, `pickLibraryPhotoForTag`/`pickLibraryMusic` (rotation via lowest `use_count`) |
| `src/lib/agent-chat.ts` | 9-agent 1:1 chat — `CHAT_AGENTS` (6 executives + 3 content agents), `CHAT_AGENT_GROUPS`, 9 persona-specific `CHAT_SYSTEM_PROMPTS`, `buildBusinessSnapshot()` (aggregates `getHqSummary()` + `market_intelligence_insights` + performance lessons into a context block), `chatWithAgent(agentId, userMessage)` — loads history, calls Claude, persists user+assistant messages to `agent_chat_messages` |

### Route structure

- `/` — redirects to `/home`
- `/home` — public landing page: apartment directory + symptom/trust cards, redesigned 2026-06 (`src/components/home/home-client.tsx`)
- `/design-system` — internal visual reference for the `dk-` token/component library (BigButton/StatusBadge/SectionCard/StepProgress/EmptyState/LoadingOverlay/BottomSheet)
- `/reservation` — booking form
- `/apt/[code]` — per-apartment tenant landing (requires Supabase DB mode)
- `/[apt_id]` — legacy apt route
- `/status` — "내 예약 현황": phone-number lookup → reservation progress timeline (`GET /api/reservations/by-phone`); separate from the in-page `ReservationStatusBar` which only works on the same device/browser that made the booking
- `/diagnosis/[id]` — public customer-facing field-report viewer (risk badge, summary, PDF links, review/rebooking CTAs); deliberately not named `/report/[id]` to avoid colliding with the admin-protected `/report` (보고서 아카이브) route and the `report.dkansim.com` subdomain rewrite
- `/resident/login`, `/resident/safety-check`, `/resident/history` — resident self-service
- `/worker/login`, `/worker/(dashboard)` — field technician portal
- `/admin/*` — admin portal (cookie-protected): reservations, backups, billing, dispatch, workers
- `/hq`, `/hq/login` — AI executive command center (cookie-protected, shares admin auth); served at `hq.dkansim.com` via host-based middleware rewrite; tabs: 홈/예약/인텔리전스/보고서 (2026-07 정리: 8탭→4탭, 콘텐츠/파이프라인/개선요청 탭 삭제 — 각각 contents.dkansim.com/agent.dkansim.com/채팅이 대체). `/hq` 루트가 9-에이전트 채팅(`src/app/hq/chat/chat-client.tsx`)을 메인 화면으로 삼고, 그 위에 예전 대시보드를 칩/배지로 압축한 요약 스트립(콘텐츠 승인대기·파이프라인 최신상태·오늘 예약·보고서·개선요청 이력)을 얹는다 — `/hq/chat`은 `/`로 리다이렉트만 함
- `/hq/intelligence` — 마켓 인텔리전스 대시보드: 카테고리별 트렌드 키워드 CSS 바 차트, 최근 인사이트, 추천 콘텐츠 기획안, 경쟁 채널 분석 결과 (server component, reads `market_intelligence_insights` + `youtube_channel_analyses` + `content_youtube_queue`)
- `/report` — weekly report archive + roadmap visualization (cookie-protected, shares admin auth); served at `report.dkansim.com` via host-based middleware rewrite
- `/agent` — AI pipeline monitor: YouTube collection status, Gemini analysis status, cron logs (`agent_logs`), pipeline run history (`pipeline_logs`) (cookie-protected, shares admin auth); served at `agent.dkansim.com` via host-based middleware rewrite
- `/contents` — content marketing command center: YouTube/Kakao/blog approval queues, Naver trend keywords, YouTube OAuth connection status (cookie-protected, shares admin auth); served at `contents.dkansim.com` via host-based middleware rewrite
- `/blog`, `/blog/[slug]` — public blog index + post detail (SEO meta tags, reservation CTA); only `published` posts are visible
- `/api/admin/*`, `/api/worker/*`, `/api/resident/*` — REST API routes
- `/api/admin/content/*` — content queue CRUD/approve (`youtube`, `kakao`, `blog`, `overview`, `naver-trends`, `youtube-channel-analysis`)
- `/api/admin/content/video-production` — decomposes an `approved` `content_youtube_queue` script into scenes and generates Flux scene images via OpenRouter, moving the item to `assets_ready` (admin-only)
- `/api/admin/content/media-library` — GET list / POST upload-or-register / DELETE for the tagged real-photo/background-music library (`content_media_library`); `/api/admin/content/media-library/field-report-photos` lists existing `field_reports` photos for picking without re-uploading (admin-only)
- `/api/admin/chat` — 9-에이전트 채팅 REST API: `GET ?agentId=cto` → agents/groups/history 반환; `POST {agentId, message}` → `chatWithAgent` 호출 → `{reply}` 반환 (admin-only, `maxDuration: 60`)
- `/api/auth/youtube/connect`, `/api/auth/youtube/callback` — YouTube OAuth 2.0 connect flow (admin-only)
- `/api/cron/youtube-collect` — collects latest videos for active `youtube_channels` via YouTube Data API (CRON_SECRET-protected)
- `/api/cron/youtube-analyze` — analyzes videos with transcripts via Gemini, writes `youtube_insights` (CRON_SECRET-protected)
- `/api/cron/content-performance-review` — weekly (Sunday 07:00 KST) content performance self-learning loop: collects YouTube stats + blog view counts, has Claude derive lessons, saves to `agent_memory` for the next planning run (CRON_SECRET-protected)
- `/api/cron/content-plan`, `/api/cron/content-draft`, `/api/cron/content-approval-notify` — weekly content pipeline (planning → drafting → approval notification), CRON_SECRET-protected
- `/api/cron/market-intelligence` — daily (03:00 KST) market intelligence collection (Google News/Naver/YouTube) + Claude analysis across 전기안전/자격시험/실무 categories, writes `market_intelligence`/`market_intelligence_insights` (CRON_SECRET-protected)
- `/api/webhook/payment` — Toss Payments webhook
- `/verify/[warranty_number]` — public warranty verification
- `/sitemap.xml`, `/robots.txt` — generated via `src/app/sitemap.ts`/`robots.ts` (includes published blog posts)

### Auth model

Three separate cookie-based auth systems, all server-side only:

1. **Admin** — `dk_admin_auth=ok` cookie; password checked against `ADMIN_PASSWORD` env var
2. **Resident** — `dk_resident_auth` cookie; HMAC-signed stateless token (`rsess.<payload>.<sig>`) signed with `RESIDENT_SESSION_SECRET`
3. **Worker** — `dk_worker_auth` cookie; JWT-like signed token via `worker-auth.ts`, secret from `WORKER_SESSION_SECRET`

### Supabase Postgres migrations

Located in `supabase/migrations/` (numbered 001–033). Apply with `npm run db:apply`. Key schemas:

- `001` — reservations, workers, tasks
- `004` — multi-tenant apartments
- `009` — orders/payment gateway
- `013` — warranties (immutable archive)
- `023–024` — AI agent command center tables
- `025` — YouTube/Gemini insight pipeline tables (youtube_channels, youtube_videos, youtube_insights, agent_logs, pipeline_logs) + `agent_reports.approved`/`approved_at` columns
- `026` — content marketing command center tables (blog_posts, naver_trends, content_youtube_queue, content_kakao_queue, youtube_oauth_tokens)
- `029` — market intelligence tables (`market_intelligence` raw collection, `market_intelligence_insights` daily Claude analysis per category)
- `030` — `content_youtube_queue.category` column (전기안전/자격시험/실무) + `youtube_channel_analyses` (channel analysis agent results)
- `031` — `content_youtube_queue.scenes` (JSONB, per-scene `{narration, imagePrompt, imageUrl}`) + `video_asset_url` columns, plus `producing`/`assets_ready` status values
- `032` — content performance self-learning columns: `content_youtube_queue.view_count`/`like_count`/`comment_count`/`stats_updated_at`, `blog_posts.view_count`, plus `increment_blog_view(p_slug)` SQL function
- `033` — `agent_chat_messages` table (9-에이전트 채팅 히스토리: `agent_id`, `role` CHECK IN ('user','assistant'), `content`, `created_at`; index on `(agent_id, created_at)`; RLS enabled)
- `059` — `apply_site_decision()` Postgres function — atomically INSERTs `site_decisions` + UPSERTs `site_config` (previously 4 separate round-trips with manual rollback that could leave the two tables inconsistent)
- `060` — `content_media_library` table (tagged real-photo/background-music store for the video pipeline: `media_type` CHECK IN ('photo','music'), `tag`, `url`, `source` CHECK IN ('upload','field_report'), `use_count` for rotation)
- `061` — adds `'인건비'` to `expenses.category` CHECK constraint; `settle_worker_assignment()` Postgres function — atomically inserts into `worker_assignments` (previously unused/dead — no code called it) and `expenses` together, giving worker pay settlement (`/admin/erp/settlement`) a real, ERP-integrated implementation. `worker_assignments.reservation_id`+`worker_id` UNIQUE constraint blocks double-settling the same job.

### AI Command Center

`hq.dkansim.com` (internally `/hq`) runs a virtual 6-executive meeting (CTO, CSO, CMO, COO, CFO, CLO) powered by `ANTHROPIC_API_KEY`. Agent system prompts are in `src/lib/agents.ts`. Meeting schedule and topics persist in Supabase (`agent_memories` table). The model used is controlled by `ANTHROPIC_MODEL` env var (defaults to `claude-sonnet-4-6`). Reports approved for content use appear in the `report.dkansim.com` (`/report`) archive.

`/hq/intelligence` (마켓 인텔리전스 대시보드) — server-side read-only dashboard showing category-wise trend keyword bar charts, latest insights, recommended content ideas, and competitor channel analysis from `market_intelligence_insights` and `youtube_channel_analyses`.

`/hq` root (9-에이전트 채팅, `src/app/hq/chat/chat-client.tsx`) — 1:1 chat with any of 9 agents (6 executives + 3 content agents, defined in `src/lib/agent-chat.ts`), now the hq home/landing view. Each agent has a unique persona prompt. Chat context includes a real-time business snapshot (`buildBusinessSnapshot()`: reservations, pending approvals, market intel, performance lessons). History persists in `agent_chat_messages` (migration 033). API: `GET/POST /api/admin/chat`.

Self-improvement requests are now filed conversationally through chat (`createChatImprovementRequest` in `src/lib/improvement-requests.ts`) rather than a standalone form — chat shows an inline progress card while the request is in flight. `.github/workflows/ai-improvement-implement.yml` implements and merges the change automatically. Since migration 033, the merge gate requires **both** `npm run lint && npm run build` passing **and** a `cursor-review: success` commit status (set by `.github/workflows/cursor-review.yml`). Without `CURSOR_API_KEY` in repo secrets, cursor-review auto-succeeds. Past requests' history/acknowledgment lives in a collapsible widget on the hq home page (`src/components/hq/hq-improvement-inline.tsx`, backed by the existing `GET`/`PATCH /api/admin/improvement-requests`). See `CONTEXT.md` for subdomain routing and deployment setup (§9 for the self-improvement pipeline).

### YouTube/Gemini insight pipeline

`agent.dkansim.com` (internally `/agent`) monitors a 3-stage pipeline run daily by GitHub Actions (`.github/workflows/youtube-transcripts.yml`): (1) `/api/cron/youtube-collect` fetches new videos for active channels, (2) `scripts/fetch-youtube-transcripts.mjs` uses yt-dlp (not runnable on Vercel) to fetch transcripts, (3) `/api/cron/youtube-analyze` runs Gemini analysis on videos with transcripts. See `CONTEXT.md` §7 for details.

### Content marketing command center

`contents.dkansim.com` (internally `/contents`) runs 3 content agents (유튜브 PD, 카카오 매니저, 블로그 에디터, defined in `src/lib/content-agents.ts`) on a weekly cycle driven by Vercel Cron:

0. **Sunday 07:00 KST** — `/api/cron/content-performance-review`: self-learning feedback loop (`runContentPerformanceReview` in `src/lib/content-performance.ts`) — collects view/like/comment stats for `uploaded` YouTube videos (via OAuth) and `view_count` for `published` blog posts, has Claude (`analyzeContentPerformance`) turn this + prior lessons into insights/recommendations, saves the result to `agent_memory` (`content_performance_lessons`)
1. **Monday 09:00 KST** — `/api/cron/content-plan`: collects Naver trend keywords (if `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` set), reads pending 대장 feedback + content memory + performance lessons from step 0 (`loadPerformanceLessons`), asks Claude to plan the week's YouTube/Kakao/blog content (`planContentWeek`), inserts queue rows + draft `blog_posts`
2. **Tuesday 09:00 KST** — `/api/cron/content-draft`: generates the YouTube script + thumbnail concept, Kakao post body, and up to 2 blog post bodies, moving each item to `pending_approval`
3. **Wednesday 08:00 KST** — `/api/cron/content-approval-notify`: if any items are pending, sends a Kakao memo summarizing pending counts

All publishing requires explicit admin approval on `/contents` (`src/components/contents/content-approval-panel.tsx`):
- **Blog** — approve sets `blog_posts.status='published'`, immediately visible at `/blog/[slug]`
- **Kakao** — approve sends a real Kakao "나에게 보내기" memo (`publishKakaoPost`) for 대장 to forward to the channel
- **YouTube** — approve with an attached video file calls the real YouTube Data API upload (`uploadYoutubeVideo`); without a file it just marks `approved` for later manual upload

YouTube uploads require connecting `contents.dkansim.com` → "유튜브 연동하기" (`/api/auth/youtube/connect` → Google OAuth consent → `/api/auth/youtube/callback`), which needs `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`. The Saturday 08:00 KST weekly report (`/api/cron/morning-report`) also includes a content performance summary + pending-approval counts (`getContentPerformanceSummary`/`getPendingApprovalCounts`).

#### Video production pipeline

Once a YouTube queue item is `approved`, clicking "🎬 영상 제작 시작" on `/contents` calls `/api/admin/content/video-production`, which runs `produceVideoAssets` (`src/lib/video-pipeline.ts`):

1. `planVideoScenes` — Claude decomposes the approved script into 5–8 scenes, each with Korean `narration` and an English `imagePrompt` (9:16 vertical, Korean apartment electrical context). If tagged real photos exist in the media library (see below), available tags are passed into the prompt and Claude may flag a scene's `photoTag` instead of relying on AI generation.
2. `resolveRealPhotoScenes` — scenes with a matching `photoTag` are assigned a real photo from `content_media_library` (rotated by lowest `use_count`) and marked `sceneType: "real_photo"`, skipping Flux/Veo generation entirely for that scene.
3. `generateSceneImage` — remaining `ai_bg` scenes' images are generated via OpenRouter Flux (`OPENROUTER_API_KEY`, default model `black-forest-labs/flux.2-pro`, overridable via `OPENROUTER_IMAGE_MODEL`) and uploaded to the `dk-safety-video-assets` bucket (`SUPABASE_VIDEO_BUCKET`)
4. The queue item's `scenes` JSONB is populated and `status` becomes `assets_ready`

`.github/workflows/video-assembly.yml` then picks up `assets_ready` items, runs `scripts/assemble-video.mjs` (narration via ElevenLabs if `ELEVENLABS_API_KEY`+`ELEVENLABS_VOICE_ID` are set, else edge-tts fallback; ffmpeg Ken Burns zoompan/drawtext captions; background music mixed in at low volume if a track is registered in `content_media_library`) to produce `final.mp4`, uploads it as `video_asset_url`, and (if YouTube is connected) uploads it as a private video, moving the item to `uploaded`.

**Media library** (`content_media_library` table, migration 060) — a tagged store of real photos (e.g. actual distribution-panel photos from real job sites) and background music tracks, managed from `/contents` (`src/components/contents/media-library-panel.tsx`, API: `/api/admin/content/media-library`). Photos can either be uploaded directly or picked from existing `field_reports.photo_urls` (`/api/admin/content/media-library/field-report-photos`, `pgListRecentFieldReportPhotos` in `src/lib/field-reports.ts`) without re-uploading. `src/lib/media-library.ts` exposes the tag/rotation logic (`listAvailablePhotoTags`, `pickLibraryPhotoForTag`, `pickLibraryMusic`).

## Environment Variables

Copy `.env.example` to `.env.local`. Key vars:

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Admin portal password |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service key (never expose to client) |
| `SUPABASE_DATA_BUCKET` | Bucket for JSON data (default: `dk-safety-data`) |
| `SUPABASE_UPLOAD_BUCKET` | Bucket for field photos (default: `dk-safety-uploads`) |
| `DK_SAFETY_USE_SUPABASE_DB` | `1` or `true` to use Postgres for reservations |
| `WORKER_SESSION_SECRET` | HMAC secret for worker session tokens |
| `RESIDENT_SESSION_SECRET` | HMAC secret for resident session tokens |
| `ANTHROPIC_API_KEY` | Claude API key for AI command center |
| `ANTHROPIC_MODEL` | Claude model ID (default: `claude-sonnet-4-6`) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key for `/api/cron/youtube-collect` |
| `GEMINI_API_KEY` | Gemini API key for `/api/cron/youtube-analyze` |
| `GEMINI_MODEL` | Gemini model ID (default: `gemini-2.0-flash`) |
| `KAKAO_ALIMTALK_WEBHOOK_URL` | (Optional) KakaoTalk notification webhook |
| `SMS_WEBHOOK_URL` | (Optional) SMS notification webhook |
| `KAKAO_REST_API_KEY` | Kakao OAuth app REST API key — enables "카카오 연동하기" on `/contents` (`/api/auth/kakao/connect` → `/api/kakao/callback`), which stores auto-refreshing OAuth tokens in Supabase (`kakao_oauth_tokens`) for "나에게 보내기" memo sends |
| `KAKAO_CLIENT_SECRET` | (Optional) Kakao OAuth Client Secret, only if enabled in Kakao Developers |
| `KAKAO_REDIRECT_URI` | (Optional) defaults to `https://dkansim.com/api/kakao/callback`; must match the Redirect URI registered in Kakao Developers |
| `KAKAO_ACCESS_TOKEN` | (Optional legacy fallback) static Kakao "나에게 보내기" memo API token — used only if OAuth (`KAKAO_REST_API_KEY`) is not connected |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | Google OAuth 2.0 credentials for YouTube upload (contents.dkansim.com) |
| `YOUTUBE_REDIRECT_URI` | (Optional) OAuth redirect URI; defaults to `${NEXT_PUBLIC_APP_URL}/api/auth/youtube/callback` |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | Naver Search/DataLab API for trend keywords + competitor blog analysis |
| `OPENROUTER_API_KEY` | OpenRouter API key for Flux scene image generation (video production pipeline) |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | (Optional, both required together) ElevenLabs TTS for video narration (`scripts/assemble-video.mjs`) — falls back to free edge-tts if either is unset |
| `OPENROUTER_IMAGE_MODEL` | (Optional) OpenRouter image model ID (default: `black-forest-labs/flux.2-pro`) |
| `SUPABASE_VIDEO_BUCKET` | (Optional) Bucket for scene images + assembled videos (default: `dk-safety-video-assets`) |
| `CURSOR_API_KEY` | (Optional) Cursor Background Agent API key — if set as a GitHub repo secret, `.github/workflows/cursor-review.yml` performs AI code review on each PR and sets `cursor-review` commit status; `ai-improvement-implement.yml` waits for `cursor-review: success` before auto-merging. Without this key, `cursor-review` auto-succeeds and merge proceeds normally. |
