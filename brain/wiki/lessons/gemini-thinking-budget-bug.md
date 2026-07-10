---
name: gemini-thinking-budget-bug
description: "gemini-2.5-flash burns maxOutputTokens on internal \"thinking\" unless thinkingConfig.thinkingBudget=0 is set — truncates every short classification/scoring response"
metadata: 
  node_type: memory
  type: project
  originSessionId: deeae932-e9fe-4b3f-b8fe-56d5a087cea0
---

`src/lib/cross-validate.ts`'s `callGemini()` called `gemini-2.5-flash` (via `GEMINI_MODEL` env, default fallback was the now-dead `gemini-2.0-flash` which 404s) with `maxOutputTokens: 800` and no `thinkingConfig`. Gemini 2.5 models think by default: a production test showed `thoughtsTokenCount: 764` out of the 800-token budget, leaving ~17 tokens for the actual answer — every validator response (content/rag_answer/knowledge_chunk, and the new expense/invoice/consultation/worker_assignment validators added 2026-07-02) came back truncated mid-sentence, corrupting `parseScore()` and the logged `verdict`.

**Fix applied**: added `generationConfig.thinkingConfig: { thinkingBudget: 0 }` to the Gemini request body, and defensively `.join("")` all `candidates[0].content.parts[...].text` instead of only reading `parts[0]`. Also replaced the dead default model fallback with `gemini-2.5-flash`.

**Why**: found via direct production `curl` testing against `/api/validate` — responses were silently garbled (e.g. "이유: 설명 자체는 명확하고 스팸이 아니지만," cut off) but still returned `success:true`, so this would have shipped invisibly without manual verification of response *content*, not just HTTP status.

**How to apply**: Any new Gemini call added to this codebase (or if `GEMINI_MODEL` is ever bumped to another "thinking" model) needs `thinkingConfig: { thinkingBudget: 0 }` for short deterministic-format outputs (score/verdict style prompts). If a future use case actually wants Gemini's reasoning, raise `maxOutputTokens` substantially (2000+) instead of disabling thinking. See also [[full_agent_orchestrator_status]] and [[field_report_ai_opinion_engine]] for the analogous Claude-side `maxTokens`-truncation bug class in this codebase — this is the same failure mode on the Gemini side.
