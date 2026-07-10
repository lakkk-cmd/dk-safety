---
name: content-command-center-setup
description: "Content marketing command center (contents.dkansim.com, migration 026) code is complete and verified working — pending API keys + Vercel deploy"
metadata: 
  node_type: memory
  type: project
  originSessionId: faa2eedf-133a-4f2c-8159-3462188bbbf9
---

The full content marketing command center (YouTube PD / Kakao Manager / Blog Editor agents, `contents.dkansim.com` ↔ `/contents`, public `dkansim.com/blog`, Naver trend collection, YouTube OAuth upload, Kakao publish, 3 weekly crons) was implemented and verified on 2026-06-13: `npm run build`/`lint`/`harness:all` all pass, migration `026_content_command_center.sql` was applied to the Supabase project configured in `.env.local` (creates `blog_posts`, `naver_trends`, `content_youtube_queue`, `content_kakao_queue`, `youtube_oauth_tokens`).

Smoke-tested locally end-to-end: `/contents` (via `Host: contents.dkansim.com` + `dk_admin_auth=ok`) renders the approval panel; created a temp `blog_posts` row, approved it via `PATCH /api/admin/content/blog`, confirmed it went live at `/blog/<slug>` + appeared in `/blog` index + `/sitemap.xml`, then deleted it and confirmed it disappeared (404). `/api/cron/content-approval-notify` ran successfully and recorded a `pipeline_logs` row.

**Update 2026-06-13**: committed (`4c40df3`) and deployed to production via `npx vercel --prod` (this Vercel project has no GitHub auto-deploy integration — deploys are manual CLI only, despite git push to `main`). Verified live: `https://contents.dkansim.com/` now 307s to `https://hq.dkansim.com/login?next=...` (previously fell through to the old `/home` page because the old build had no `contents.` middleware rewrite). `/blog`, `/sitemap.xml`, `/robots.txt` all return 200 on `dkansim.com`.

**Update 2026-06-13 (later)**: `YOUTUBE_CLIENT_ID`/`SECRET`, `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, `NAVER_CLIENT_ID`/`SECRET`, `KAKAO_CHANNEL_ID`/`KAKAO_REST_API_KEY` are now all set in Vercel Production (added by 대장 over the past 1-7 days). Fixed a `redirect_uri_mismatch` (400) on YouTube OAuth connect: `YOUTUBE_REDIRECT_URI` was unset, so `getRedirectUri()` fell back to `NEXT_PUBLIC_APP_URL` (also unset) → `http://localhost:3000/...`, which didn't match the `https://contents.dkansim.com/api/auth/youtube/callback` registered in Google Cloud Console (client `dkansim-youtube-upload`). Added `YOUTUBE_REDIRECT_URI=https://contents.dkansim.com/api/auth/youtube/callback` to Vercel Production env and redeployed; verified the `/api/auth/youtube/connect` redirect now sends the matching `redirect_uri` to Google.

**Update 2026-06-14**: Kakao OAuth is connected and "나에게 보내기" memo sending is **confirmed working** — `kakao_oauth_tokens` table has a valid refresh_token, auto-refresh tested successfully. Also fixed a Korean text garbling (mojibake) bug in `sendKakaoMemo()` (`src/lib/kakao-publish.ts`): the memo API call was missing `;charset=utf-8` on `Content-Type: application/x-www-form-urlencoded` (the OAuth token endpoints already had it). Fixed, deployed (`f602439`), and verified end-to-end — sent a real test memo with Korean+emoji text, user confirmed it displays correctly in KakaoTalk "나와의 채팅".

**Update 2026-06-15**: YouTube OAuth consent flow is **confirmed working end-to-end** — `youtube_oauth_tokens` has a valid refresh_token (channel `UCMW4Gjm6LK_hXEH6MUkBKfw`), and `scripts/assemble-video.mjs` (Stage 3 video pipeline, run via GitHub Actions) successfully refreshed the access token and uploaded a real private video (`youtube_video_id=AsNsc-Ago0k`). `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` (same values as Vercel prod) are now also registered as GitHub Actions secrets for this purpose. See [[five-stage-automation-status]] for the full Stage 3 writeup.

**Why still pending**:
1. `NEXT_PUBLIC_APP_URL` is still unset in Vercel Production — doesn't block YouTube OAuth anymore (covered by `YOUTUBE_REDIRECT_URI`), but may affect canonical URLs in sitemap/email templates/etc. if those also fall back to `localhost:3000`. Not yet investigated.

**How to apply**: if asked "is the content command center working?" or "why are Kakao/YouTube queues empty on /contents?", check these gaps first. Also remember: **any future code change or env var addition needs `npx vercel --prod` to go live** — git push alone does not deploy this project, and env var changes require a redeploy to take effect. Related: [[youtube-gemini-pipeline-setup]], [[deploy-workflow]], [[five-stage-automation-status]].
