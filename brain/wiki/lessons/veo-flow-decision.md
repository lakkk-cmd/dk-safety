---
name: veo-flow-decision
description: Decision to postpone direct Veo API calls due to cost — video scenes are produced manually via Google Flow + master character sheet + frame chaining instead
metadata: 
  node_type: memory
  type: project
  originSessionId: 452de78e-235b-47c1-8dc0-3b3e7175e438
---

대장이 2026-06-21에 결정: **Veo API 직접 호출(자동 생성, `USE_VEO_VIDEO=true` 경로)은 비용 문제로 보류.**

**대안 워크플로우**: 콘티 생성(`planVideoScenes`)까지는 그대로 자동화하되, 각 씬의 Veo 프롬프트는 대장이 직접 Google Flow(labs.google/fx)에 수동으로 입력해서 영상을 만든다. 이때:
- **마스터 캐릭터 시트**를 함께 입력해 씬 간 인물/배경 일관성을 유지 (이 안내 문구는 `src/components/hq/hq-content-queue.tsx`의 `buildFlowPromptText`/Flow 미리보기에 각 씬 프롬프트 앞에 자동으로 붙음 — 2026-06-20 작업분)
- **프레임 체이닝**: 이전 씬의 마지막 프레임을 다음 씬 생성의 참조 이미지로 이어 붙여 연속성 확보

**Why**: Veo 3.1 API 비용이 부담되는 수준 — `src/lib/video-pipeline.ts`의 `BUDGET_KRW = 50_000` (30일 한도)로 가드는 되어 있지만, 그 한도 자체를 쓰는 것도 부담스럽다는 판단.

**How to apply**: 영상 제작 관련 작업을 할 때 `USE_VEO_VIDEO=true`(자동 Veo 생성) 경로를 더 다듬는 방향으로 가지 말 것 — 대신 `/contents`(hq-content-queue) 의 "✨ Flow용 프롬프트" UI/복사 기능과 콘티 품질(마스터 캐릭터 시트 안내, 씬 간 일관성 메모)을 개선하는 방향이 맞다. [[five_stage_automation_status]]의 Stage 3 "Veo 비동기 파이프라인"은 기술적으로는 존재하지만 현재 운영 방향은 아니다.
