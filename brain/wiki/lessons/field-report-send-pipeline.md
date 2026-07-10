---
name: field-report-send-pipeline
description: "Field report Solapi 알림톡/SMS 발송 + 통합 실행 버튼 — production에서 실제 알림톡 발송 성공 확인(2026-06-23), Claude 한도도 풀려서 전체 파이프라인 e2e 가능"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f6317eb-e6b5-4bad-8756-04ebc58bed52
---

4단계(알림톡 발송 + 통합 파이프라인 버튼) 구현 완료 + production 실제 발송 검증 완료.

**구성**: `supabase/migrations/044_field_report_send.sql`(send_result JSONB/sent_at + status에 `completed` 추가 + `reservations.landlord_phone` 컬럼), `src/lib/field-report-notification.ts`(`sendFieldReportNotification` — Solapi 알림톡 시도 후 실패 시 동일 발신번호 SMS 폴백), `POST /api/field-report/send-report`, `src/components/worker/field-report-pipeline-button.tsx`(소견생성→PDF생성→발송 3단계 순차 실행 + 단계별 상태 아이콘 + 실패 단계부터 재시도).

**알림톡 변수 불일치는 의도된 설계**: 기존 승인된 템플릿(`SOLAPI_TEMPLATE_ID`, [[solapi_alimtalk_status]]에 기록된 것)은 고객명/점검일시/결과링크/리뷰링크 변수셋으로 승인됨. 이 새 기능은 고객명/세대주소/위험등급/리포트링크라는 다른 변수셋을 같은 템플릿으로 시도하므로, Solapi SDK가 `VariableValidationError`를 던질 가능성이 높음 — `sendFieldReportNotification`이 이 실패를 catch해서 같은 발신번호로 일반 SMS 폴백하도록 이미 구현되어 있음(사용자가 명시적으로 요청한 동작). 신규 템플릿 등록은 하지 않음.

**검증 완료**:
- (로컬, mock 데이터) `/api/field-report/send-report` 직접 호출 → `reservations.landlord_phone` 조회 성공 → `send_result`에 resident/landlord 둘 다 저장 → `status='completed'` DB 반영 확인
- (로컬) `/field-report/preview/[id]`에서 "전체 실행" 버튼 클릭 → 당시 Anthropic 한도가 막혀 있어 1단계에서 ❌ 아이콘 + 재시도 버튼이 정확히 표시되는 것을 Playwright로 확인(에러/재시도 경로 자체는 검증됨)
- **(production, 2026-06-23) 실제 발송 성공**: `SOLAPI_*`가 Vercel production에는 설정되어 있어([[vercel_env_pull_quirk]] 때문에 로컬로는 값을 가져올 수 없었음) `https://dkansim.com`에 배포 후 테스트 field_report(거주자 연락처=010-8945-1111)로 두 차례 호출 → 둘 다 `{channel:"kakao_alimtalk", success:true, messageId:"G4V2026..."}`로 실제 알림톡 발송 성공, `status='completed'` 반영. **단, 사용자가 본인 폰에서 수신을 직접 확인했다는 명시적 확인은 받지 못함** — API/DB 증거만 있음.
- 기존 템플릿(`SOLAPI_TEMPLATE_ID`, [[solapi_alimtalk_status]])이 고객명/세대주소/위험등급/리포트링크 변수셋도 에러 없이 수용함 — 예상(점검완료템플릿과 변수 불일치로 SMS 폴백 예상)과 달리 알림톡이 매번 성공해서, **새로 작성한 SMS 폴백 메시지 포맷(커밋 `3807d8d`)은 실제로 발송된 적이 없음** — 코드는 맞게 들어가 있지만 알림톡이 막히는 상황이 와야 실제 트리거됨.
- [[anthropic_quota_pending_verification]] — 한도가 7/1 전에 풀려서, 통합 버튼을 처음부터 끝까지(소견→PDF→발송) 한 번에 돌리는 e2e도 이제 가능함. 아직 "전체 실행" 버튼으로 3단계를 연속으로 한 번에 끝까지 돌려본 적은 없음(각 단계를 API로 개별 호출해 검증함) — 다음에 한 번 통째로 클릭 테스트 권장.

**How to apply**: SMS 폴백 메시지를 실제로 받아보려면 `SOLAPI_TEMPLATE_ID` 또는 `SOLAPI_PFID`를 일시적으로 비활성화해 알림톡을 강제 실패시켜야 함 — 운영 알림 설정을 건드리는 일이라 사용자 승인 필요(2026-06-23에 한 번 물어봤고 아직 답 없음). 다음에 "전체 실행" 버튼 자체를 한 번에 끝까지 눌러보는 진짜 e2e 테스트도 해볼 것.
