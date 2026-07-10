---
name: crm-erp-cross-validation-status
description: CRM+ERP data cross-validation (expense/invoice/consultation/worker-assignment) built and production-verified 2026-07-02
metadata: 
  node_type: memory
  type: project
  originSessionId: deeae932-e9fe-4b3f-b8fe-56d5a087cea0
---

Added 4 new validators to `src/lib/cross-validate.ts` (`validateExpense`, `validateInvoice`, `validateConsultation`, `validateWorkerAssignment`), wired into `/api/validate` and directly into the real save paths: `POST /api/admin/erp/expenses`, `POST /api/admin/erp/invoices`, `POST /api/admin/crm/consultations` (create only, not the update branch), and `POST /api/admin/tasks/assign`.

**Deviation from the original spec worth remembering**: the `worker_assignments` table (migration 052) and its `createAssignment`/`listAssignments` functions in `erp-db.ts` are dead code — no route ever calls `createAssignment`. The *actual* worker-assignment flow is `/api/admin/tasks/assign` → `pgAssignTask()` in `reservations-pg.ts`, which writes to `tasks.worker_id` (reservation ↔ task ↔ worker), driven from `/admin/dispatch`. Added `pgGetWorkerAssignmentContext()` there to build the conflict-check context (target reservation's `preferred_date`+`preferred_time`, plus the worker's other non-completed task assignments) since there's no single `scheduledAt` timestamp column on reservations.

**Why**: user's prompt assumed the `worker_assignments` table was the live assignment path; investigation showed it wasn't, so the validator was hooked into the actually-used endpoint instead of the unused table.

**Validation design**: math/date/amount-limit/conflict checks run deterministically in code first (no Gemini call) — invoice arithmetic, expense future-date + per-category amount ceiling (`EXPENSE_CATEGORY_LIMITS` in cross-validate.ts), worker same-day-5+ overload and 2-hour-window conflicts. Gemini is only asked for the fuzzy judgment call (category/description match, spam detection). This split matters because of [[gemini_thinking_budget_bug]] and because Gemini has no reliable sense of "today's date."

**How to apply**: `/admin/knowledge` → 교차검증 이력 now has a type filter (전체/콘텐츠/RAG/지식베이스/경비/청구서/상담/작업자배정) via `?vtype=` query param on `CrossValidationDashboard`. All four new validators log to `agent_logs` with `source='cross_validator'`, confirmed present in production after live curl tests against `dkansim.com/api/validate` with `AGENT_WRITE_SECRET`.
