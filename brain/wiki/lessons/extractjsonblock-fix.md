---
name: extractjsonblock-fix
description: "extractJsonBlock() in src/lib/agents.ts was rewritten 2026-06-14 (commit 4879c2a) — non-greedy regex broke on JSON containing nested ``` code fences"
metadata:
  type: project
  originSessionId: faa2eedf-133a-4f2c-8159-3462188bbbf9
---

`extractJsonBlock()` (`src/lib/agents.ts`) used to be a two-step regex: ` ```json\s*([\s\S]*?)``` ` (non-greedy) then fallback `\{[\s\S]*\}`. This broke whenever Claude's JSON response contained the requested `{...}` wrapped in ` ```json ` AND a string value inside that JSON *also* contained a ` ``` ` code fence (e.g. a "제안 접근법" section with TypeScript snippets) — the non-greedy regex matched up to the *first* inner ``` instead of the real closing fence, producing truncated/invalid JSON → `JSON.parse` threw "Unterminated string in JSON".

**Found via:** live test of the content pipeline (2026-06-14) — `draftYoutubeScript()` (`src/lib/content-agents.ts`, maxTokens=2000) produced a `content_youtube_queue.script` row containing the raw ` ```json{"script":... ` text, truncated mid-string, with `thumbnail_concept: ""`. The exact same failure mode then hit `analyzeAndFileImprovementRequest()` (`src/lib/improvement-requests.ts`, maxTokens=1500) when filing a real `/hq` improvement request — blocking the whole self-improvement pipeline.

**Fix (commit 4879c2a, deployed via `npx vercel --prod`):**
- `extractJsonBlock()` rewritten to brace-depth-counting (string/escape-aware), finds the first `{` (after a ` ```json ` fence if present) and returns up to its matching `}` — robust to nested ``` and `{}` inside string values.
- `draftYoutubeScript()` maxTokens 2000 → 4000.
- `analyzeAndFileImprovementRequest()` maxTokens 1500 → 3000.

**How to apply:** if any Claude-JSON-parsing call in this codebase (content agents, improvement-request analysis, future agents) throws "Unterminated string in JSON" or silently falls back to raw text, first check `stop_reason` (if `"max_tokens"`, the maxTokens cap for that call is too low) — `extractJsonBlock` itself should no longer be the culprit post-fix. Related: [[improvement-request-pipeline]], [[content-command-center-setup]].
