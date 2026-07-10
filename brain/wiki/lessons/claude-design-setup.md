---
name: claude-design-setup
description: "Claude Design 프로젝트 연동 상태 — dk-safety 디자인시스템 프로젝트, plan_token 함정, Playwright MCP 설치 필요성"
metadata: 
  node_type: memory
  type: project
  originSessionId: bba89b7f-c8d0-4157-b64c-af67be92f988
---

Claude Design에 "우리집 전기주치의 디자인시스템" 프로젝트(project_id: 86a343a2-4c81-4804-9745-13f018d78ab9)를 생성하고, `src/components/ui/*`의 dk- 토큰 컴포넌트(BigButton/StatusBadge/SectionCard/StepProgress/EmptyState/LoadingOverlay/BottomSheet)를 `디자인시스템.dc.html`로 재현해 업로드함 (2026-07-03).

**Why:** 사용자가 "클로드디자인 로그인해줘" → "우리 프로젝트에 연결"을 요청. 로컬 컴포넌트는 Next.js React(TSX)라 Claude Design의 `.dc.html`(x-dc 런타임) 형식으로 직접 이식이 안 되어, 정적 마크업+CSS로 시각적 재현 후 dc.html 포맷으로 전환함.

**함정 — 두 개의 서로 다른 finalize_plan:**
- `DesignSync` 툴의 `method: "finalize_plan"` → `planId` 반환 (단순 조회 키)
- 별도 raw 툴 `mcp__claude-design__finalize_plan` → `plan_token` 반환 (점(`.`)으로 구분된 서명 JWT)
- `create_support_js`/`mcp__claude-design__write_files`/`delete_files`는 **raw 쪽 `plan_token`**을 요구함. `DesignSync`의 `planId`를 넘기면 "plan_token is malformed (no separator)" 오류. `.dc.html` + `support.js`를 다룰 때는 반드시 raw `mcp__claude-design__*` 툴 계열만 일관되게 사용할 것.

**How to apply:** 다음에 Claude Design `.dc.html` 작업 시 이 두 체계를 섞지 말 것. `create_support_js` 호출 전에 raw `finalize_plan`으로 `plan_token`을 받아야 함.

**Playwright MCP 설치됨(2026-07-03):** 이 환경엔 브라우저 도구(mcp__playwright__* / mcp__claude-in-chrome__*)가 전혀 연결돼 있지 않았음 — Claude Design의 "verify loop"(render → screenshot → gate)를 수행할 수 없었음. `claude mcp add playwright -- npx -y @playwright/mcp@latest`로 설치, `claude mcp list`에서 연결 확인됨. **단, 세션 재시작 전까지는 새 MCP 툴이 현재 세션에 반영 안 됨** (ToolSearch로 확인) — 재시작 후에야 실제 스크린샷 검증 가능.
