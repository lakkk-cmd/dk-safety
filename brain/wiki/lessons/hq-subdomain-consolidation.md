---
name: hq-subdomain-consolidation
description: agent.dkansim.com/report.dkansim.com/contents.dkansim.com remain separate subdomains by design, unified only via shared shell+nav — confirmed 2026-06-23, this is the final state, not a transition
metadata: 
  node_type: memory
  type: project
  originSessionId: 452de78e-235b-47c1-8dc0-3b3e7175e438
---

**Update 2026-06-23**: re-checked the code during the Phase 5 UI redesign pass ([[ui_redesign_2026-06_status]]). The "통합" mentioned below was already done by the time of this check — `middleware.ts` still rewrites 4 separate subdomains (`hq.`/`report.`/`agent.`/`contents.`) to their own `/hq`, `/report`, `/agent`, `/contents` path prefixes, and that is the **intended final architecture**, not a half-finished migration:

- `/hq` hosts lightweight summary tabs (대시보드/콘텐츠/예약/파이프라인/보고서/인텔리전스/개선요청/AI채팅) that link OUT to the full standalone tools ("YouTube 상세 현황은 agent.dkansim.com에서", "report.dkansim.com 아카이브에 노출", etc.) — by design, not a stub.
- All 4 subdomains share `HqShell`/`AgentLayout`/`ReportLayout`/`ContentsLayout` → same `BrandLockup` + `SubdomainNav` (cross-property switcher) + `cc-` color tokens, giving consistent navigation/branding without merging routes.
- Phase 5 only needed to align the `cc-` token palette with the customer-facing `dk-` tokens (cc-navy, cc-bg) — no routing/structural changes were needed.

**How to apply**: do not attempt to "finish" a subdomain merge — there isn't one in progress. If asked to add a feature to agent/report/contents, add it to that subdomain's own path AND optionally surface a summary card in `/hq` linking out, matching the existing pattern.

---

Original note (2026-06-21, now superseded by the above):

대장이 2026-06-21에 진행 중이라고 밝힘: **`agent.dkansim.com`과 `report.dkansim.com`을 `hq.dkansim.com` 단일 홈으로 통합하는 작업이 진행 중.**
