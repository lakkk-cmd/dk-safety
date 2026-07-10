---
name: improvement-request-pipeline
description: hq.dkansim.com self-improvement request pipeline (027 migration) — fully validated end-to-end as of 2026-06-14, including a real /hq-originated request reaching "completed"
metadata: 
  node_type: memory
  type: project
  originSessionId: faa2eedf-133a-4f2c-8159-3462188bbbf9
---

The hq.dkansim.com "⚙️ 개선 요청" widget → Claude analysis → GitHub Issue (`ai-improvement` label) → `.github/workflows/ai-improvement-implement.yml` (Claude Code Action) → branch/PR → `.github/workflows/ai-improvement-deploy.yml` → `npx vercel deploy --prod` is now **fully validated end-to-end** (2026-06-14, issue #10 → PR #11, and again issue #12 → PR #13). The whole chain runs with zero manual steps.

**2026-06-14 (later) — real `/hq`-originated request validated all the way to "completed":** POSTed a genuine improvement request via `/api/admin/improvement-requests` (Host: hq.dkansim.com) asking for a "승인 대기 건수 배지" on `/contents`. Result: issue #12 created → PR #13 auto-merged → `ai-improvement-deploy.yml` run 27497478058 succeeded, including the "Notify hq.dkansim.com (success)" step → `improvement_requests` row `6e61dfa9-...` updated to `status: "completed"` with `github_pr_url` set. This confirms the previously-untested notify/complete callback (`completeImprovementRequest`) works for real widget-originated requests, not just `gh issue create` test issues.

**Current working design:**
- `ai-improvement-implement.yml`: Claude Code Action implements the issue, pushes `ai-improvement/issue-N`, then a final step creates the PR (if missing), self-verifies with `npm run lint && npm run build`, and merges via `gh pr merge --squash` using `GH_TOKEN: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}`.
- `GH_PAT` secret (added 2026-06-14): a fine-grained PAT scoped to ONLY `lakkk-cmd/dk-safety`, permissions Contents: Read/write + Pull requests: Read/write. This makes `mergedBy` a human account (`lakkk-cmd`), which is required for GitHub to fire `pull_request: closed` for OTHER workflows (GITHUB_TOKEN-performed merges don't cascade — confirmed via PR#9/issue-8 which had zero deploy runs).
- Confirmed via PR#11 (issue-10): `mergedBy.login = "lakkk-cmd"`, `is_bot: false` → `ai-improvement-deploy.yml` triggered immediately → `npx vercel deploy --prod` completed ("✓ Ready in 4m", new production URL printed).
- Branch protection on `main` is intentionally OFF — bot-authored PRs get stuck in GitHub's `action_required` gate and never produce a recognized status check, so the workflow self-verifies the build instead of relying on `ci.yml`/required checks.

**Known cosmetic issue (NOT a pipeline bug):** `ai-improvement-deploy.yml`'s "Notify hq.dkansim.com" step (`POST /api/admin/improvement-requests/complete`) returns 404 → curl exit 22 → makes the GH Actions run show "failure" even though the Vercel deploy itself succeeded. Root cause: `completeImprovementRequest` looks up the `improvement_requests` table by `github_issue_number`, and test issues created directly via `gh issue create` (not through the `/hq` widget) have no matching row. **Real `/hq`-originated improvement requests WILL have a matching row** (created when the widget files the issue), so this notify step should succeed for genuine requests — this was not separately re-tested with a real `/hq`-originated issue.

**How to apply:** The pipeline is production-ready for real `/hq` improvement requests. If a future GH Actions run of `ai-improvement-deploy.yml` shows "failure" but the "Deploy to Vercel (production)" step shows "success", check the "Notify hq.dkansim.com" step separately — the deploy likely succeeded regardless. CONTEXT.md §9.2 documents `GH_PAT` and the constraint history.
