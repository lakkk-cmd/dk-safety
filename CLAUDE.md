# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**대경안심전기** (dkansim.com) — a Next.js 15 home electrical inspection/repair booking platform for a solo electrician in Gwangju, Korea. Targets apartment residents; includes resident self-diagnosis, admin/worker portals, and an AI executive command center powered by Claude.

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
```

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

### Route structure

- `/` — public landing page
- `/reservation` — booking form
- `/apt/[code]` — per-apartment tenant landing (requires Supabase DB mode)
- `/[apt_id]` — legacy apt route
- `/resident/login`, `/resident/safety-check`, `/resident/history` — resident self-service
- `/worker/login`, `/worker/(dashboard)` — field technician portal
- `/admin/*` — admin portal (cookie-protected): reservations, backups, billing, dispatch, workers
- `/hq`, `/hq/login` — AI executive command center (cookie-protected, shares admin auth); served at `hq.dkansim.com` via host-based middleware rewrite
- `/report` — weekly report archive + roadmap visualization (cookie-protected, shares admin auth); served at `report.dkansim.com` via host-based middleware rewrite
- `/agent` — AI pipeline monitor: YouTube collection status, Gemini analysis status, cron logs (`agent_logs`), pipeline run history (`pipeline_logs`) (cookie-protected, shares admin auth); served at `agent.dkansim.com` via host-based middleware rewrite
- `/api/admin/*`, `/api/worker/*`, `/api/resident/*` — REST API routes
- `/api/webhook/payment` — Toss Payments webhook
- `/verify/[warranty_number]` — public warranty verification

### Auth model

Three separate cookie-based auth systems, all server-side only:

1. **Admin** — `dk_admin_auth=ok` cookie; password checked against `ADMIN_PASSWORD` env var
2. **Resident** — `dk_resident_auth` cookie; HMAC-signed stateless token (`rsess.<payload>.<sig>`) signed with `RESIDENT_SESSION_SECRET`
3. **Worker** — `dk_worker_auth` cookie; JWT-like signed token via `worker-auth.ts`, secret from `WORKER_SESSION_SECRET`

### Supabase Postgres migrations

Located in `supabase/migrations/` (numbered 001–025). Apply with `npm run db:apply`. Key schemas:

- `001` — reservations, workers, tasks
- `004` — multi-tenant apartments
- `009` — orders/payment gateway
- `013` — warranties (immutable archive)
- `023–024` — AI agent command center tables
- `025` — YouTube/Gemini insight pipeline tables (youtube_channels, youtube_videos, youtube_insights, agent_logs, pipeline_logs) + `agent_reports.approved`/`approved_at` columns

### AI Command Center

`hq.dkansim.com` (internally `/hq`) runs a virtual 6-executive meeting (CTO, CSO, CMO, COO, CFO, CLO) powered by `ANTHROPIC_API_KEY`. Agent system prompts are in `src/lib/agents.ts`. Meeting schedule and topics persist in Supabase (`agent_memories` table). The model used is controlled by `ANTHROPIC_MODEL` env var (defaults to `claude-sonnet-4-6`). Reports approved for content use appear in the `report.dkansim.com` (`/report`) archive. See `CONTEXT.md` for subdomain routing and deployment setup.

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
| `KAKAO_ALIMTALK_WEBHOOK_URL` | (Optional) KakaoTalk notification webhook |
| `SMS_WEBHOOK_URL` | (Optional) SMS notification webhook |
