---
name: field-report-input-page
description: /field-report mobile checklist input page — e2e verified 2026-06-22; middleware worker-route gap found+fixed
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f6317eb-e6b5-4bad-8756-04ebc58bed52
---

기사용 현장 점검 계측값 입력 페이지(`/field-report`, `/field-report/preview/[id]`) 2026-06-22 구축, Playwright로 375px 모바일에서 로그인→입력→제출→preview 라우팅까지 e2e 검증 완료. `field_reports` 테이블(마이그레이션 041) 실제 INSERT 확인됨.

**중요 버그 발견+수정**: `src/middleware.ts`의 `isWorkerRoute`가 `pathname.startsWith("/worker")`만 체크해서, `/worker/*` 바깥에 새 워커 전용 페이지를 추가하면(`/field-report`) 거주자 인증 분기로 잘못 빠져 `/resident/login`으로 리다이렉트됨.

**Why**: 기사 인증이 필요한 새 라우트를 `/worker/*` 트리 밖에 추가할 때마다 같은 문제가 재발한다 — 미들웨어가 라우트 prefix 화이트리스트 방식이라 새 prefix는 수동으로 추가해야 함.

**How to apply**: `/worker/*` 외부에 기사 전용 페이지를 새로 추가할 때는 항상 `src/middleware.ts`의 `isWorkerRoute` 조건에 해당 prefix를 추가해야 함. 거주자 로그인으로 잘못 리다이렉트되면 이게 원인일 가능성이 높음 — 먼저 middleware.ts를 확인.
