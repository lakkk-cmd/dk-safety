# 2026-09-23 AI 상세진단 대기 UX 리뷰

## 결정사항
- 우선순위 문장 분리(`/[.。](?!\d)/`)는 실측값 소수점(`0.018`)에서 잘리지 않는 것을 확인했고 그대로 둔다.
- 대기 안내는 "정정본 없음 + 점검시각이 지금 기준 ±5분"일 때만 켠다. 브라우저 시계가 서버보다 늦어
  inspectedAt이 미래로 보여도 같은 창 안이면 대기 중으로 본다.
- 전기과장 이력과 관리자 점검 목록은 대기 건이 있을 때만 15초마다 다시 조회한다. 조회가 실패해도
  시각은 흘러서 5분이 지나면 폴링이 멈춘다. 관리자 쪽 재조회는 목록 스피너를 켜지 않는다.
- 전기과장 목록 API는 정정본 URL을 자기 단지 점검 id로만 잘라 돌려준다.

## 변경된 파일
- `src/lib/unit-inspection-ai-pending.ts`: 대기 창·폴링 간격·`isAiDiagnosisPending()`
- `src/components/apt-manager/apt-manager-inspection-history.tsx`: 판별 통일, 실패 시에도 폴링이 끝나게
- `src/components/admin/admin-unit-inspections-panel.tsx`: 같은 안내를 조용히 재조회해 지우게, 줄바꿈
- `src/app/api/apt-manager/unit-inspections/route.ts`: 정정본 맵을 세션 단지로 제한

## 알게 된 것
- 관리자 화면은 이미 `correctedPdfUrls`를 갖고 있었는데, 이번 안내는 그 값을 보지 않고 렌더 시점의
  `Date.now()`만 써서 정정본이 생겨도 새로고침 전에는 안내가 남았다.
- 전기과장 폴링은 `inspections`가 바뀔 때만 인터벌을 정리해서, 조회가 계속 실패하면 5분이 지나도
  요청이 멈추지 않았다. `age >= 0` 조건은 시계가 조금만 늦으면 자동 갱신 자체를 시작하지 않았다.
- `pgListUnitInspectionPdfCorrections()`는 단지 필터가 없고, 정정본 URL은 공개 버킷 주소다.
- 위키(`brain/wiki/systems/`)에는 이 대기 UX를 적은 문서가 없어 기존 문서는 고치지 않았다.

## 미해결
- 로그인·5분 이내 미정정 점검이 있는 세션 없이는 배지가 뜨고 사라지는 화면을 브라우저에서 끝까지
  눌러 보지 못했다. dev 서버 Ready와 `/home` 200, 두 경로는 로그인으로 리다이렉트되는 것까지 확인.
- `project_features`는 동작 설명이 바뀐 새 기능이 아니라 대기 안내 버그 수정이라 행을 추가하지 않았다.
