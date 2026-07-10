---
name: ui-redesign-2026-06-status
description: Full 6-phase UI/UX redesign of dk-safety (design system → worker → customer → admin → hq → integration verification) — completed 2026-06-23
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f6317eb-e6b5-4bad-8756-04ebc58bed52
---

6-phase UI redesign completed and deployed to production 2026-06-23 (commits 469b56c through 0a2c101).

**Phases:**
1. Design system foundation — Pretendard font, new `dk-` color tokens (navy #0B1F3A/blue #1A5CFF/gold #F5A623/red #E53E3E/gray #F7F8FA), 7 new components in `src/components/ui/` (BigButton/StatusBadge/SectionCard/StepProgress/EmptyState/LoadingOverlay/BottomSheet), `/design-system` reference page.
2. Worker UI — `worker-dashboard` redesign, `/field-report` rewritten as 4-step `field-report-wizard` replacing the old accordion form.
3. Customer UI — `/home` fully rebuilt on `dk-` tokens (was raw inline-hex styles), new `/status` (phone lookup → reservation timeline, `GET /api/reservations/by-phone`), new `/diagnosis/[id]` (public field-report viewer).
4. Admin UI — brand-accent pass on `admin-shell-critical-css.ts` (gold/navy sidebar), new shared `AdminPageHeader` component applied to 8 screens that had English titles/ad-hoc headers.
5. hq integration — discovered the structural consolidation (shared `HqShell`/`SubdomainNav`/`BrandLockup` across hq/agent/report/contents subdomains) was already done in a prior session; this phase just unified the `cc-` token palette with `dk-` (cc-navy, cc-bg) for full visual consistency.
6. Integration verification — full real-data chain tested (booking → admin → dispatch → worker dashboard → hq dashboard), production smoke test across all subdomains, build/lint clean.

**Key non-obvious decisions:**
- `/diagnosis/[id]` is named that way (not `/report/[id]` as originally planned) because `/report*` is already claimed by the admin-protected 경영보고서 archive and the `report.dkansim.com` subdomain rewrite in middleware — see [[diagnosis_route_naming]] if that memory exists, otherwise this is the only record.
- `/apt/[code]` per-apartment architecture was deliberately kept rather than replaced with a single global booking funnel — multi-tenant apartments can't be collapsed into one generic `/home` CTA.
- Admin theme stays slate/dark (not switched to the bright customer `dk-` palette) — operator console intentionally reads as a professional dashboard, not a consumer app; only accent colors (gold/navy) were unified.
- The hq "통합" was mostly already complete before this redesign project — don't assume structural work is needed there again without checking `src/components/hq/hq-shell.tsx` and `src/components/subdomain-nav.tsx` first.

**How to apply**: when adding new customer-facing pages, default to the `dk-` token classes (cascades automatically, no inline hex). When adding new admin pages, use `AdminPageHeader` for the top band. When touching hq/agent/report/contents, reuse `HqShell`-style layout, not a one-off header.
