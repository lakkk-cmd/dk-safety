---
name: five-stage-automation-status
description: "Status of the 5-stage automation system (market intel, channel analysis, video production, self-learning loop, /hq/intelligence dashboard)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 14083163-1fcd-49b4-8d19-64bb5cdd447e
---

User's standing instruction for this initiative (still in force): "각 단계 완료마다 증거 보고. 1단계부터 순서대로 시작. 증거 없는 완료 불인정." (Report evidence at each stage's completion, in order, no evidence = not accepted.)

**2026-06-21 업데이트 — 중요**: Stage 3의 Veo API 자동 생성 경로(`USE_VEO_VIDEO=true`)는 비용 문제로 보류 결정됨. 자세한 내용과 대안 워크플로우는 [[veo_flow_decision]] 참고 — 새로 영상 파이프라인 작업할 땐 그 메모를 먼저 확인할 것.

## Status as of 2026-06-15

- **Stage 1 (시장 정보 수집)** — DONE, deployed, evidenced. `src/lib/market-intelligence.ts`, `/api/cron/market-intelligence`.
- **Stage 2 (유튜브 채널 분석 → 콘텐츠 제안)** — DONE, deployed, evidenced. `src/lib/youtube-channel-analysis.ts`.
- **Stage 3 (영상 제작 파이프라인: Flux 이미지 + ffmpeg 합성 + 유튜브 업로드)** — **DONE end-to-end, fully evidenced**:
  - Phase A: `produceVideoAssets` (src/lib/video-pipeline.ts) generates 5-8 scenes via Claude + Flux images via OpenRouter, uploads to `dk-safety-video-assets` bucket, status→`assets_ready`.
  - Phase B: `.github/workflows/video-assembly.yml` + `scripts/assemble-video.mjs` — edge-tts narration + ffmpeg Ken Burns/zoompan + drawtext captions, concat → `final.mp4`, uploaded to Supabase Storage → `video_asset_url`.
  - Phase C: YouTube OAuth refresh + multipart upload → `youtube_video_id`, status→`uploaded` (private video).
  - Real evidence: queue item `94bf8b24-ad0d-435a-be46-c9087c89cae9` → https://www.youtube.com/watch?v=AsNsc-Ago0k (private), 7 scenes, final.mp4 9.6MB.
  - Required `sudo apt-get install -y ffmpeg fonts-noto-cjk` in the workflow (ubuntu-latest does NOT come with ffmpeg/ffprobe preinstalled — original plan assumption was wrong).
  - `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` now registered as GitHub Actions secrets (user provided values directly in chat on 2026-06-15; same creds already in Vercel prod env for the OAuth connect/callback routes).
- **Stage 4 (자가학습 피드백 루프)** — NOT STARTED.
- **Stage 5 (`/hq/intelligence` 대시보드)** — NOT STARTED.

## How to apply
When picking up Stage 4 or 5, follow the same evidence-per-stage pattern. [[deploy_workflow]] still applies (manual `vercel --prod` after pushing user-facing changes) — but Stage 3's fix was GH-Actions-only, no Vercel redeploy needed.
