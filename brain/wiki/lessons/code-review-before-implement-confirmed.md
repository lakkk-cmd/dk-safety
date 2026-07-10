---
name: code-review-before-implement-confirmed
description: "When code-review-mode is active on a new \"실행 프롬프트\" spec, review the plan itself (via ReportFindings) before writing any code — user confirmed this is the right response, not a deviation to explain away"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: deeae932-e9fe-4b3f-b8fe-56d5a087cea0
---

When a `[CODE REVIEW MODE ACTIVATED]` system reminder fires on a turn where the user has pasted a full "Claude Code 실행 프롬프트" implementation spec (this project's recurring pattern for multi-step feature requests), the right move is to **investigate the spec against the actual codebase and call ReportFindings before implementing anything** — not to implement first and review after, and not to ask the user which mode they want.

**Why**: did exactly this on 2026-07-02 for the "Gemini 프로젝트 컨텍스트 학습 시스템" spec. Found 4 real, high-confidence issues purely by reading code (no implementation needed to find them): a live production bug unrelated to the new spec (`code-review.ts` missing the same thinking-budget fix already applied elsewhere), a design flaw that would have reintroduced a regression fixed twice earlier in the session, wrong file paths baked into "ground truth" seed data, and a rename-handling gap in the proposed automation script. The user's next message was a numbered list mapping 1:1 onto the reported findings ("코드 리뷰 결과 4가지 수정: 1... 2... 3... 4...") — direct confirmation the review was on-target and the right thing to produce at that point, not premature or unwanted.

**How to apply**: don't second-guess or ask for permission when this hook fires — do the review, use `ReportFindings` (findings ranked by severity, `verdict: CONFIRMED` when actually checked against code, `PLAUSIBLE` for design-risk predictions not yet manifested), then wait for direction. When the user responds with a fix list, that list *is* the go-ahead to implement — treat it as "apply these fixes as part of building the feature," not as a second separate confirmation step. See [[project_context_gemini_learning]] for how the 4 fixes were actually threaded through the implementation.
