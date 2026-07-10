---
name: vercel-env-pull-quirk
description: "vercel env pull shows \"\" for ALL Encrypted vars in this project — don't use it to diagnose secret value mismatches"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: faa2eedf-133a-4f2c-8159-3462188bbbf9
---

`npx vercel env pull --environment=production` returns `VAR=""` for every "Encrypted" env var (confirmed: 38/48 vars including `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `CRON_SECRET` all showed `""`, while clearly having real values since those features work in prod). Only CLI-injected plaintext vars (`VERCEL_OIDC_TOKEN`, `VERCEL_ENV`, etc.) show real values.

**Why:** Discovered 2026-06-14 while debugging youtube-transcripts.yml's `curl -sf` exit-22 failures. The earlier diagnosis ("Vercel CRON_SECRET is empty string") was a false positive caused by this CLI quirk — a direct `curl` test against the live endpoint with the real secret returned `200 success:true`, proving Vercel's value was correct all along. The actual fix was re-syncing the **GitHub Actions** secret via `gh secret set CRON_SECRET --body "<value>"` (the GH-side secret was likely the one that was wrong/empty from its original 2026-06-11 setup).

**How to apply:** Never trust `vercel env pull` output to conclude a secret is missing/empty. To verify a Vercel env var's actual effective value, hit the live endpoint with `curl` using the value from `.env.local` (or whatever value you believe is correct) and check the real HTTP response/status — that's ground truth. If GH Actions ↔ Vercel secret mismatches are suspected, fix the GH Actions side with `gh secret set <NAME> --body "<value>"` first, since that's been the actual culprit at least once.
