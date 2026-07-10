---
name: youtube-gemini-pipeline-setup
description: YouTube/Gemini insight pipeline (Task 4-5) is fully operational as of 2026-06-14 — daily GH Actions run succeeds end-to-end
metadata: 
  node_type: memory
  type: project
  originSessionId: 57e5970a-0e74-461d-a987-ebe5ff6f8bc4
---

Task 4-5 (YouTube/Gemini insight pipeline): `src/lib/youtube-pipeline.ts`, `src/lib/gemini-pipeline.ts`, `src/lib/pipeline-logs.ts`, `/api/cron/youtube-collect`, `/api/cron/youtube-analyze`, `scripts/fetch-youtube-transcripts.mjs`, `.github/workflows/youtube-transcripts.yml`. See `CONTEXT.md` §7 for the full architecture (collect → yt-dlp transcript → Gemini analyze, monitored at `agent.dkansim.com`).

**Status (2026-06-14)**: Fully working end-to-end. All previously-missing pieces are done: `YOUTUBE_API_KEY`/`GEMINI_API_KEY` set, 3 channels registered in `youtube_channels`, GH Actions secrets (`CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) configured. Manual `gh workflow run youtube-transcripts.yml` (run 27495576368) completed all steps green in 35s: `youtube-collect` → `{"success":true,"channels":3,"inserted":1,...}`, `youtube-analyze` → `{"success":true,"candidates":0,"analyzed":0,"errors":[]}`.

**Known minor issue**: one channel ("우리집 전기 주치의") returns `YouTube API 400: Request contains an invalid argument` on every collect run — likely a malformed/wrong channel ID in the `youtube_channels` row. Doesn't fail the pipeline, just yields 0 videos for that channel. Not yet fixed.

**How to apply**: if `/agent` looks empty or the daily cron seems to not be running, check the GH Actions run history for `youtube-transcripts.yml` and the `agent_logs`/`pipeline_logs` tables rather than assuming setup is incomplete — setup is done. Related: [[hq-report-agent-subdomains]], [[vercel-env-pull-quirk]].
