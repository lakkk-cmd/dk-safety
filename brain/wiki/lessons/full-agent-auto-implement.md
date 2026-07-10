---
name: full-agent-auto-implement
description: "Full agent (총괄) chat can now trigger the fully-autonomous code pipeline directly for low-risk changes via github_create_issue(auto_implement=true) — opt-in, agent self-judges risk"
metadata: 
  node_type: memory
  type: project
  originSessionId: deeae932-e9fe-4b3f-b8fe-56d5a087cea0
---

Before 2026-07-02 there were two separate self-improvement paths: the `/hq` "⚙️ 개선 요청" widget (fully autonomous — issue → Claude Code implements via `anthropics/claude-code-action` in `.github/workflows/ai-improvement-implement.yml` → auto PR → auto-merge on lint/build pass → auto-deploy, label `ai-improvement`) vs. the full-agent chat's `github_create_issue` tool (always labeled `chat-suggestion`, deliberately inert — requires 대장 to manually relabel on GitHub to start the same pipeline).

User asked whether the full agent could be given direct Claude Code access; after discussing the tradeoff (chat-triggered autonomous merge to production vs. always-manual review), user chose a middle ground: **let the agent self-judge risk per request** rather than a global on/off switch.

**Implementation** (`src/lib/full-agent-tools.ts` `toolGithubCreateIssue`, `src/lib/full-agent.ts` TOOLS schema + system prompt): `github_create_issue` gained an `auto_implement: boolean` param (default false). `true` → label `ai-improvement` (same pipeline as the `/hq` widget, no human gate beyond lint/build + optional cursor-review). `false` → unchanged `chat-suggestion` behavior. The tool schema description gives explicit low-risk examples (typo/copy/UI text/obvious bug fixes) vs. must-stay-manual examples (pricing/payment/settlement, auth, DB schema/migrations, data deletion, notification/send triggers, external API integration, ambiguous/underspecified scope) and says "판단이 서지 않으면 항상 false."

**Verified in production** (commit 01ea55e, deployed): a genuinely dangerous request ("가상계좌 검증 우회") made the agent refuse outright with no tool call at all — didn't even reach the auto_implement decision. A moderate/ambiguous feature request ("월별 순이익 그래프 위젯 추가") produced issue #30 with `chat-suggestion` label (confirmed via `gh issue view`, not just trusting the chat reply) — closed after verification, not implemented. The `auto_implement=true` path itself was **not** live-tested end-to-end (user explicitly declined, since that would trigger a real autonomous merge+deploy to the production business site) — only verified via type-check/build and code review. If this ever misbehaves, check that the agent is actually picking `true` only for trivial changes; the failure mode to watch for is the agent underestimating risk on a request that sounds small but touches pricing/auth/schema.
