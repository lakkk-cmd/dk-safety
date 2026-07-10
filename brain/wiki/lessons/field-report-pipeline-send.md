---
name: field-report-pipeline-send
description: "Field report alimtalk/SMS send + full pipeline trigger button — built 2026-06-22, structurally verified locally; real Solapi delivery NOT testable locally (no creds in .env.local)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f6317eb-e6b5-4bad-8756-04ebc58bed52
---

4단계(PDF 생성 후 Solapi 알림톡 자동발송 + 전체 파이프라인 통합 트리거) 구축 완료, 2026-06-22. 구조적 검증까지만 완료 — 실제 알림톡/SMS 수신 검증은 미완료(아래 사유).

**구성**: `supabase/migrations/044_field_report_send.sql`(`field_reports.send_result`/`sent_at` + status에 `completed` 추가, `reservations.landlord_phone` 신규 컬럼) · `src/lib/field-report-notification.ts`(`sendFieldReportNotification` — 신규 변수셋(고객명/세대주소/위험등급/리포트링크)으로 알림톡 시도 → 실패 시 동일 발신번호로 일반 SMS 폴백) · `src/lib/reservations-pg.ts`의 `pgGetReservationContact` · `POST /api/field-report/send-report` · `/field-report/preview/[id]`에 `FieldReportPipelineButton`(소견생성→PDF생성→발송 순차 실행, 단계별 ⏳/✅/❌ 표시, 실패 단계부터 재시도).

**중요 — 기존 Solapi 템플릿과 변수 불일치**: `customer-notification.ts`의 기존 승인 템플릿(SOLAPI_TEMPLATE_ID)은 변수가 `고객명/점검일시/결과링크/리뷰링크`인데, 이 기능은 `고객명/세대주소/위험등급/리포트링크`를 보낸다. **같은 SOLAPI_TEMPLATE_ID를 재사용하면 거의 100% 알림톡이 실패하고 SMS로 폴백될 것** — 사용자가 별도로 이 변수셋에 맞는 새 카카오 템플릿을 심사받아 별도 env var(예: 신규 SOLAPI_FIELD_REPORT_TEMPLATE_ID)로 등록하지 않는 한, 실제로는 항상 SMS로만 발송됨. 폴백 자체는 정상 동작이라 기능은 안 깨지지만, "알림톡으로 보내고 싶었는데 SMS만 가는" 상황이 생길 수 있음 — 사용자에게 확인 필요.

**검증 상태**:
- DB/API 로직 전부 실제 호출로 검증: PDF 미생성 시 400 에러 가드 동작 확인, 임대인 연락처 있을 때 양쪽 발송 시도 확인, Solapi 자격증명 없을 때 graceful skip(에러 throw 없이 `{channel:"skipped"}` 반환) 확인, `field_reports.send_result`/`status='completed'` DB 반영 확인.
- **실제 알림톡/SMS 수신 검증은 못함**: `.env.local`에 `SOLAPI_API_KEY`/`SOLAPI_API_SECRET`/`SOLAPI_PFID`/`SOLAPI_SENDER_NUMBER`/`SOLAPI_TEMPLATE_ID`가 전혀 없음(로컬엔 미설정, Vercel 프로덕션에만 있음 — [[solapi_alimtalk_status]] 참고). 실제 수신 확인은 Vercel에 배포한 뒤 프로덕션에서 테스트해야 함.
- 전체 파이프라인 버튼의 1단계(AI 소견 생성)는 [[anthropic_quota_pending_verification]] 한도 때문에 7/1까지 실행 자체가 안 됨 — 사용자도 이미 인지하고 "한도 해제 후 실측"이라고 명시함.

**How to apply**: 다음 세션에서 이 기능을 실제로 검증하려면 (1) 7/1 이후 Anthropic 한도 해제 확인, (2) `npx vercel --prod`로 배포, (3) 프로덕션 `/field-report`에서 실제 워커 계정으로 로그인 후 전체 파이프라인 버튼 클릭, (4) 010-8945-1111(대장 번호)로 실제 수신 확인. 알림톡이 아니라 SMS로 온다면 위 템플릿 변수 불일치가 원인이니 새 템플릿 심사 여부를 사용자에게 먼저 물어볼 것.
