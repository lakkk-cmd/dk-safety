# 2026-09-22 세대점검표 경로 A 발급 코드 리뷰

## 결정사항
- 경로 A(고시 PDF 배경 + 좌표 스탬프 + AI v2 2페이지)를 발급 유일 경로로 두는 방향은 유지한다.
- 스탬프 폰트는 배포에서 NanumGothic-Regular.ttf를 직접 읽고, 맑은 고딕은 환경변수로만 덮어쓴다.
- 2페이지 진단의 부적합 건수는 1페이지 체크리스트 X 건수를 따른다. 적합 요약이 있어도 부적합 문장을 지우지 않는다.
- 서명 PNG가 깨져도 점검표 발급은 계속하고 서명만 비운다.
- 점검일 라벨은 Asia/Seoul 기준이다.

## 변경된 파일
- `src/lib/unit-inspection-pdf-issue.ts`
- `src/lib/unit-inspection-pdf-path-a.ts`
- `src/lib/document-pdf.tsx`
- `src/lib/unit-inspection-ai-diagnosis.ts`
- `src/app/api/worker/unit-inspections/route.ts`
- `src/app/api/apt-manager/unit-inspections/route.ts`
- `src/app/api/admin/unit-inspections/[id]/pdf/route.ts`
- `src/app/api/admin/unit-inspections/[id]/reissue-pdf/route.ts`
- `scripts/backfill-unit-inspection-pdfs.ts`
- `next.config.ts`

## 알게 된 것
- 폰트 후보를 배열로 돌려 `existsSync`하는 방식은 standalone 파일 트레이싱이 ttf를 빠뜨릴 수 있다. 발급 라우트 4곳의 nft 결과에 나눔고딕·고시 PDF·Noto가 포함되는 것을 빌드 산출물로 확인했다.
- `adaptAiDiagnosisToV2`가 `okSummary`만 관찰란에 넣으면, 적합 문단이 있는 보통 건에서 부적합 건수가 2페이지에서 빠진다.
- `renderUnitInspectionPreviewPng`가 1x1 PNG를 반환하고 있었다. 지금은 1페이지 생성을 확인한 뒤 2페이지 PNG를 반환한다.
- 구 satori `buildUnitInspectionPng`는 발급 경로에서 호출되지 않아 lint warning만 남는다. 렌더러 본체는 이번 리뷰에서 삭제하지 않았다.

## 미해결
- 프로덕션 방문/미방문 PDF 육안 스모크는 배포 후.
- `project_features` 설명 행은 구독 게이트 서술이라 이번 렌더 경로 변경과 문장이 어긋나지 않아 DB는 건드리지 않았다.
