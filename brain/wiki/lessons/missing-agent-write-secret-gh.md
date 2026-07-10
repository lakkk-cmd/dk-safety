---
name: missing-agent-write-secret-gh
description: "AGENT_WRITE_SECRET was never registered as a GitHub Actions repo secret — broke follow-up-reminder.yml (daily hard failure) and web-learn.yml (weekly), and silently made code-review.yml's Gemini review a no-op that always fakes \"passed:true\""
metadata: 
  node_type: memory
  type: project
  originSessionId: deeae932-e9fe-4b3f-b8fe-56d5a087cea0
---

User reported "GitHub에서 계속 실패 메세지를 보내는" (GitHub keeps sending failure messages) on 2026-07-02, right after the separate [[web_learn_eager_supabase_bug]] fix. Root cause was different and unrelated: `gh secret list` showed `AGENT_WRITE_SECRET` was never registered in the repo's GitHub Actions secrets (only `ANTHROPIC_API_KEY`, `CRON_SECRET`, `CURSOR_API_KEY`, `GH_PAT`, `NEXT_PUBLIC_SUPABASE_URL`, `PAT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_*`, `YOUTUBE_CLIENT_*` were set) — even though the app itself (Vercel env) has always had it, since every manual `/api/validate`, `/api/admin/...` curl test this session worked fine locally.

Three workflows reference `secrets.AGENT_WRITE_SECRET` and were all silently/loudly broken:
- **`follow-up-reminder.yml`** (daily 09:00 KST) — hard fails with HTTP 401 from `/api/crm/follow-up-send`, `exit 1` — this is what actually generated the "계속 실패" GitHub notification emails.
- **`web-learn.yml`** (weekly Sun 03:00 KST) — same 401 pattern, hadn't fired again yet in the observed run window but would fail identically.
- **`code-review.yml`** ("Gemini Code Review" in the Actions UI) — the *dangerous* one: its curl call is wrapped as `curl -sf ... || echo '{"passed":true,"score":0,...}'`, so the 401 auth failure gets silently swallowed and reported as a fake pass. This means the Gemini automated code review built in commit cd8156f has **never actually run in CI** — every "Gemini Code Review: success" in the Actions history was this fallback firing, not a real review. Discovered only by reading the workflow YAML after noticing the run history showed 100% success despite the missing secret.

**Fix**: `gh secret set AGENT_WRITE_SECRET` with the exact value from `.env.local` (same value already live on Vercel — confirmed correct by testing `/api/crm/follow-up-send` and `/api/code-review` directly against production with that value: first returned HTTP 200, second returned HTTP 400 for a deliberately-empty payload — 400 not 401 confirms auth now succeeds, validation is the only remaining gate).

**How to apply / lesson**: when a workflow's failure-handling wraps a network call in `|| echo '<fake success>'` for resilience against transient issues (the stated intent here was "API 호출 실패 — 건너뜀" for Gemini overload, not auth), it will also mask permanent misconfiguration (missing secrets) as silent no-ops forever. If a session ever needs to verify the Gemini code-review pipeline is *actually* reviewing things (not just reporting green), check `agent_logs`/`/admin/stats`'s code review history for entries with real `commit` SHAs matching recent GH Actions runs, don't trust the Actions UI's green checkmark alone.
