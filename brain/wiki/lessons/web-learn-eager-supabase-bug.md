---
name: web-learn-eager-supabase-bug
description: "web-learn.ts's top-level createClient() broke Vercel Preview builds + the ai-improvement auto-merge gate — root cause found and fixed 2026-07-02, also unblocked the first real (non-test) auto_implement PR"
metadata: 
  node_type: memory
  type: project
  originSessionId: deeae932-e9fe-4b3f-b8fe-56d5a087cea0
---

User reported "Vercel에서 계속 실패메세지를 보내는" (Vercel keeps sending failure messages). Root cause: `src/lib/web-learn.ts` was the **only** file in the codebase with a module-level (eager) `const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` — every other file uses the lazy `requireAgentSupabase()`/`getAgentSupabase()` pattern from `agent-db.ts`. Next.js's build-time "Collecting page data" step evaluates route modules statically, so this eager call threw `Error: supabaseUrl is required` in any build environment missing those two env vars — which includes both **Vercel Preview deployments** (not all Preview-scoped env vars configured) and **`.github/workflows/ai-improvement-implement.yml`'s own build-verification step** (its env block only sets `NEXT_PUBLIC_BUSINESS_PHONE`/`NEXT_PUBLIC_KAKAO_OPENCHAT_URL`/`ADMIN_PASSWORD`, no Supabase secrets).

**Real-world impact discovered while investigating**: this was actively blocking [[full_agent_auto_implement]] and [[full_agent_review_criteria_fix]]'s auto-merge pipeline for a genuine (non-test) user request — 대장 asked the 총괄 chat to restyle `hq.dkansim.com`'s chat UI to look like KakaoTalk, the agent correctly judged it low-risk and used `auto_implement: true` (issue #31 → PR #32), Claude Code Action implemented it correctly and cursor-review/gemini-review both passed, but the pipeline's own `npm run build` step failed on this unrelated bug and left the PR open with a "🔒 자동 머지 보류" comment instead of merging.

**Fix**: moved the 3 `supabase.from(...)` call sites in `web-learn.ts` to call `requireAgentSupabase()` locally inside each function (`getTrustedDomains`, `saveWebChunks`) instead of a shared top-level client. Verified the fix reproducibly: ran `npm run build` with `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` explicitly unset (`env -u`) — failed with the exact reported error before the fix, passed cleanly (exit 0) after.

**Resolution completed end-to-end**: pushed fix to main → deployed → merged the fix into the stuck `ai-improvement/issue-31` branch → all PR #32 checks turned green (build/gemini-review/Vercel all SUCCESS) → merged PR #32 (`gh pr merge --squash --delete-branch`, merged as a real GitHub user so `ai-improvement-deploy.yml`'s recursive-trigger guard didn't block it — see [[improvement_request_pipeline]] for why `GITHUB_TOKEN`-authored merges don't trigger this) → `ai-improvement-deploy.yml` ran and deployed to `dkansim.com` successfully.

**Minor harmless side-note, not fixed**: that deploy workflow's "Notify hq.dkansim.com" step returned a 404-ish error ("이슈 #31에 해당하는 요청을 찾을 수 없습니다") because issue #31 was created via the full-agent chat tool path, not the `/hq` improvement-request widget path — there's no `improvement_requests` DB row for it to mark complete. The step doesn't fail the overall job. Not a bug worth fixing unless it starts mattering (e.g. if 대장 wants completion notifications for chat-originated auto-implement issues too).
