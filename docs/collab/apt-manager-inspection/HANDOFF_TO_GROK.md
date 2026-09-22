# HANDOFF: 경로 A 본작업·배포 (IT·디지털팀)

날짜: 2026-09-22 22:35 KST
작업: satori 기본 발급 → 경로 A만 연결 + 빌드 통과 + main 배포 진행

## 한 일
1. `src/lib/unit-inspection-pdf-issue.ts` 신설 — page1 PathA + page2 v2 merge, 맑은고딕 스탬프, 레거시 AI→v2 어댑터
2. `document-pdf.tsx` `renderUnitInspectionPdf` / preview가 PathA만 호출(동적 import, 순환참조 방지)
3. `npm run build` 통과 (Next 15.5.15)
4. 구 `buildUnitInspectionPng`/UnitInspectionElement는 파일에 남되 **발급 진입점에서 미사용**(경고 only)

## 배포
- 브랜치: `sample/unit-inspection-original-form-match` → `main` 병합 후 Vercel production(평소 절차)
- URL: https://dkansim.com (프로덕션 앱)
- 커밋/버전: 병합 후 이 문서에 SHA 갱신

## 잔여
- 서버(Linux) 배포 환경에 malgun.ttf 없으면 `UNIT_INSPECTION_STAMP_FONT_PATH` 필요 — Vercel 빌드/런타임에 폰트 파일 포함 여부 확인 필수
- AI generate 프롬프트를 네이티브 v2 JSON으로 바꾸는 작업은 어댑터로 우회 중(품질 고도화 잔여)
- 고정영역 마스크 자동화 미포함
- Play/모바일 APK와 무관(웹 Vercel)

## 금지 준수
시크릿 값 노출·결제·불가역 삭제 없음.
