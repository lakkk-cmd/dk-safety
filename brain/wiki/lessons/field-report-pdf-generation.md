---
name: field-report-pdf-generation
description: "Field report landlord/resident PDF report generation — fully built and e2e verified 2026-06-22 (Claude-independent, not blocked by quota)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f6317eb-e6b5-4bad-8756-04ebc58bed52
---

3단계(세대 진단 리포트 PDF 자동생성) 완료, 2026-06-22, end-to-end 검증까지 완료(Claude API 한도와 무관 — PDF 생성 자체는 Claude를 호출하지 않음, opinion 텍스트만 입력으로 받음).

**PDF 생성 방식**: `@react-pdf/renderer`나 Playwright 대신, 이미 코드베이스에 있던 `next/og`(satori+resvg, `src/lib/scene-cards.tsx`에서 영상 씬카드용으로 이미 사용 중)로 한글 JSX 레이아웃을 PNG로 렌더링한 뒤, `pdf-lib`(보증서 PDF에서 이미 사용 중)로 PDF에 합성하는 하이브리드 방식 채택. 새 의존성 추가 없음, 둘 다 Vercel 서버리스에서 네이티브 바이너리 없이 동작.

**핵심 기술**: 가변 길이 AI 소견 텍스트를 다루기 위해 "표지(고정 1페이지)" + "소견+서명(가변 높이 1장의 긴 PNG)" 두 이미지로 분리 렌더링 후, 긴 PNG를 A4 페이지 높이(842pt)로 나눠 pdf-lib에 여러 페이지로 슬라이스 삽입(`y = (i+1)*842 - totalHeightPt` 공식). 폰트는 `public/fonts/NotoSansKR-Bold.woff` 재사용(모든 텍스트 700 weight로 통일 — 이 폰트엔 regular weight 없음, satori가 같은 family 내에서 가장 가까운 weight로 매칭해줌).

**구성**: `supabase/migrations/043_field_report_pdfs.sql`(pdf_landlord_url/pdf_resident_url/pdf_generated_at + status에 `pdf_generated` 추가), `src/lib/field-report-pdf.tsx`(렌더링+페이지합성+업로드), `POST /api/field-report/generate-pdf`(worker 인증, opinion 존재 확인 후 생성), `/field-report/preview/[id]`에 "PDF 생성" 버튼.

**검증 완료**: 실제 mock opinion 텍스트(사용자 제공)로 테스트 field_report 생성 → API 호출 → Supabase Storage(`dk-safety-uploads/reports/`)에 실제 PDF 2개(각 2페이지, 유효한 PDF 구조) 업로드 확인 → 내용은 임시 디버그 라우트로 동일 렌더 함수의 PNG를 직접 받아 시각 확인(표지: 네이비 헤더+위험등급 배지+계측표 빨간 강조행+KEC 인용+비용+서명란 / 소견 페이지: 줄바꿈 보존된 AI 텍스트+서명란, 거주자용: 색상 배지+체크리스트+위험부위설명+소견+010-8945-1111 긴급연락처) → status='pdf_generated' DB 업데이트 확인 → 테스트 데이터(worker/reservation/task/field_report) 및 Storage 객체 전부 정리 완료.

**How to apply**: 다음 단계(예: PDF를 Kakao로 발송하거나 거주자/임대인에게 전달하는 기능)를 만들 때는 `field_reports.pdf_landlord_url`/`pdf_resident_url`을 그대로 참조하면 됨. [[field_report_ai_opinion_engine]] 검증이 완료되면(7/1 이후) 실제 Claude 생성 소견으로도 같은 파이프라인이 동작하는지 한 번 더 확인할 가치는 있지만, opinion 텍스트 형식(줄바꿈 포함 자유 텍스트)이 동일하므로 코드 변경은 필요 없을 것으로 예상.
