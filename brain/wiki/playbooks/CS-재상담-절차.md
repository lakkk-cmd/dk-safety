---
title: "CS 재상담·팔로업 절차"
category: playbooks
tags: ["playbook", "cs", "crm"]
---

`crm-db.ts`의 `listFollowUpReminders()`가 재상담 대상을 뽑고, SMS(Solapi)로 발송한다.

## 절차

1. 재상담 대상 목록은 `/api/crm/follow-up-send`(`src/app/api/crm/follow-up-send/route.ts`)가
   `listFollowUpReminders()`로 조회.
2. 발송 방식 2가지: **단건 수동 발송**(관리자가 id 지정, 어드민 인증 또는
   `AGENT_WRITE_SECRET`로 호출) / **일괄 자동 발송**(id 없이 호출 시 전체 대상 처리 —
   에이전트가 크론성으로 호출하는 경로).
3. 발송 성공 시 `updateFollowUpStatus(id, "sent")`로 상태 갱신 — 같은 대상에게 중복 발송
   방지.
4. 실제 SMS 발송은 `sendSMS()`(`src/lib/solapi-agent.ts`) — 카카오 알림톡이 아니라 **SMS**임에
   주의(현장보고서 알림과 발송 경로가 다름, → [[알림-인프라]]).

## 확인할 것

- `/api/crm/follow-up-send`는 관리자 세션 쿠키 **또는** `AGENT_WRITE_SECRET` 둘 중 하나로만
  인증됨 — 다른 경로로는 호출 불가.

관련: [[CRM-ERP]] [[알림-인프라]]
