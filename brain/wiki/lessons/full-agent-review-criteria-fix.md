---
name: full-agent-review-criteria-fix
description: "Gemini review for the 총괄(general) full-agent must not judge \"관련성 없음\" as a defect — only check factual/safety/tone issues"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: deeae932-e9fe-4b3f-b8fe-56d5a087cea0
---

The synchronous Gemini review wired into the full-agent (총괄) chat branch of `/api/admin/chat` (`reviewFullAgentAnswer` → `validateAgentAnswer` in `cross-validate.ts`) must **not** penalize an answer for being unrelated to electrical safety. The 총괄 agent is a general business assistant (marketing, ops, IT, UI requests, etc.), not a narrow electrical-safety Q&A bot — topic relevance to 전기안전 is not a validity signal for it.

**Why**: the user reported a concrete failure — asking "카카오채팅창처럼 구성할 수 있어?" (a routine UI request) got silently replaced with the safety-fallback message ("전문가 확인이 필요합니다...") because the original validation prompt included criteria like "사실 정확성 (전기안전 법령/기술 기준 준수)" that Gemini interpreted as "must be about electrical safety," scoring off-topic-but-correct answers low.

**How to apply**: any prompt sent to Gemini (or any model) to grade this agent's answers must restrict itself to genuinely universal defects — factual fabrication, dangerous safety misinformation (shock/fire risk), abusive language, and verifiable factual errors — and explicitly instruct the grader not to penalize topic. Don't let "professionalism" or "relevance to the business domain" sneak back in as an implicit criterion; that's what caused this bug. Also keep the "replace with a safety fallback message" trigger narrow and explicit (currently `score < 30 AND hasDangerousMisinfo === true`) rather than a single low-score threshold — a low score for an unrelated-but-harmless reason should never cause message substitution. See [[trusted_domains_and_document_gen_status]] for the fix commit (8f114ce, 2026-07-02) and production verification (re-ran the exact failing message, got score 100/passed, normal answer returned).
