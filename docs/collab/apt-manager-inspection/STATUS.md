# 세대점검표·진단결과 업그레이드 — 현재 상태

작성: Claude Code(로컬) / 갱신 2026-09-22 (2회차)

## 0. 게이트 상태 (2026-09-22, 총괄 회신 반영)

- **G0(조사)**: 완료
- **G1(요구사항 확정)**: 완료 — `HANDOFF_FROM_GROK.md`의 CEO 확정사항 6개
- **G2(샘플)**: **완료(2회차 재샘플까지 완료)** — 브랜치 `sample/unit-inspection-original-form-match`에
  코드 반영 + 샘플 PDF/PNG 2세트 생성(방문점검 1건 + 미방문 간이점검 1건, `samples/` 폴더).
  IT 1차 QA에서 지적된 하단 잘림·N/A 표기·문서 드리프트 전부 해결. **main 병합 안 함, 배포 안 함.**
- **G3(CEO 최종 확정 승인)**: 대기 중 — 승인 전까지 추가 구현/병합 중단
- **G4(본작업)**: 미착수

상세는 `HANDOFF_TO_GROK.md` 3회차 갱신 섹션 참고.

## 1. 결론 요약 (1회차 조사 내용, 그대로 보존)

**기존 구현이 이미 원본 양식(별지 제15호)과 상당히 정확히 일치한다.** 대규모 리팩터가
필요한 상태가 아니라, 이번에 요청받은 "더 디테일하게"의 구체 스펙(3단계 등급 기준, 사진
요구사항 등)이 아직 정의되지 않은 상태다. 아래 2~4절 참고.

## 2. 점검입력 → 진단 → PDF 호출 체인 (조사 결과)

1. **입력 UI**: `src/components/worker/unit-inspection-form.tsx` — 워커 앱과 apt-manager
   앱이 `lockedApartment`/`apartmentsEndpoint`/`submitEndpoint` props로 이 컴포넌트를
   공유한다. 세대방문점검/세대미방문 간이점검 두 모드, 12개 체크리스트 항목 입력.
2. **제출 API**: `src/app/api/worker/unit-inspections/route.ts`,
   `src/app/api/apt-manager/unit-inspections/route.ts` — 제출 즉시:
   - `unit-inspections.ts::createUnitInspectionRecord()`가 별표3 규칙엔진
     (`unit-inspection-rules.ts::diagnoseChecklist`)으로 `auto_diagnosis`를 동기 산출
   - 1차 PDF(`document-pdf.tsx::renderUnitInspectionPdf`)를 즉시 생성해 응답
   - `after()` 콜백으로 `unit-inspection-ai-diagnosis.ts::runUnitInspectionAiDiagnosisAndCorrect()`를
     백그라운드 실행 → Claude 호출로 "AI 안전진단"(상세 설명) 생성 → **정정본 PDF**로 교체
     (원본 `unit_electrical_inspections` 행은 발급 즉시 불변이라 UPDATE 안 함,
     `unit_inspection_pdf_corrections` 오버레이 테이블에만 새 파일 포인터 저장)
3. **진단 로직**:
   - 법정 규칙엔진: `unit-inspection-rules.ts` — 12항목을 4개 카테고리(절연/배선/배선기구/접지)로
     정의, 부적합(X) 항목만 별표3 조항 인용해 `DiagnosisEntry[]` 산출. 절연저항 2항목 +
     누전차단기(ELB) 1항목은 실측값(절연저항/누설전류)으로 **자동판정**(회로수 기반 임계값 계산),
     나머지 9항목은 워커 수기 확인.
   - 회사 자체 기준: `checkCompanyServiceLifeAdvisories()` — 콘센트/스위치 10년 초과 시 권장사항
     (법적 근거 아님, 별표3 결과와 절대 안 섞음 — 화면/PDF에서도 시각적으로 분리).
   - AI 상세설명: `unit-inspection-ai-diagnosis.ts::generateUnitInspectionAiDiagnosis()` —
     적합은 한 문단으로 뭉뚱그리고, 부적합/회사권장/실측값(부하전류·누설전류·절연저항)은 각각
     개별 설명 + 종합총평. Claude 호출, maxTokens 6000.
4. **PDF 렌더링**: `document-pdf.tsx::UnitInspectionElement` — satori(next/og) 기반, 별지15호
   원본 문구·표 구조를 그대로 재현(아래 3절 대조표).

## 3. 원본 양식 대조 (별지 제15호, `C:\Users\user\Desktop\[별지 15] 공동주택 세대내 전기설비
점검기록표(전기안전관리자의 직무에 관한 고시).pdf`)

| 원본 요소 | 현재 구현 | 상태 |
|---|---|---|
| 표제 "[별지 제15호 서식]" / "공동주택 세대내 전기설비 점검기록표" | 그대로 렌더링 | ✅ 일치 |
| "OO호 / OOO 귀하 / 년월일" | dong+ho, residentName+"귀하", inspectedAtLabel | ✅ 일치 |
| "귀하의 전기설비 안전점검 결과를..." 문구 | 원문 그대로 | ✅ 일치 |
| "- 아래 -" 구분선 | 그대로 | ✅ 일치 |
| 표 5열(부적합설비\|위험요인\|확인사항\|점검결과\|비고) | **5열 그대로 복원 완료(2026-09-22 샘플)** — 처음엔 4열 통합이었으나 CEO 지시로 위험요인을 별도 열로 분리 | ✅ 일치 (샘플 `samples/sample-unit-inspection-2026-09-22-page1.png`) |
| 12항목 4카테고리 정확히 일치 | `CHECKLIST_ITEMS` 12개 라벨·카테고리·위험요인 전부 원문과 1:1 대조 확인 | ✅ 일치 |
| "기타사항" 행(원본은 자유기재란) | 부하전류/IGR/절연저항 실측값 3종 + etcNotes로 대체 | ✅ 원본보다 정보량 많음(개선) |
| 하단 안내문 "※ 부적합 전기설비는..." | 원문 그대로 | ✅ 일치 |
| "[비고] 점검결과는 O/X/(해당없음)" | 원문 + "세대미방문 시 미점검 항목은 해당없음" 추가 | ✅ 일치+보강 |
| "확인 호 인 / 담당자 인" 서명란 | "세대 확인"(이름+서명이미지) / "담당(전기선임자)"(이름+"(인)") 2열 박스로 재구성 | ⚠️ 레이아웃만 다름, 기능은 동등 |
| (원본에 없음) AI 안전진단 상세설명, 회사 자체 권장사항, 종합총평 | 2페이지에 추가 렌더링 | ✅ 원본 대비 대폭 확장(이미 완료된 작업) |

**결론**: 실측값의 원본 양식 기입, 항목별 부적합 설명, 세대 요약(종합총평)은 이미 구현되어
있다. 표를 5열 그대로 안 쓰는 것과 서명란 레이아웃 차이는 사소한 스타일 차이로 리팩터 대상이
아니라고 판단(임의 변경 안 함, 총괄 확인 필요하면 4절 참고).

## 4. 발견된 진짜 공백 (임의 구현 안 함 — HANDOFF_TO_GROK.md 참고)

1. **사진**: 점검입력 UI/DB/PDF 어디에도 사진 첨부 기능이 없음(코드 전체 grep 확인,
   `photo`/`사진` 0건). `field_reports`(현장점검)는 이미 사진 첨부+PDF 삽입 패턴이 있어
   재사용 가능하지만, 세대점검표는 법정 서식(별지15호)이라 사진을 서식 안에 넣을지/별첨으로
   둘지부터 결정 필요.
2. **항목별 양호·주의·위험 3단계**: 현재는 법정 판정 O(적합)/X(부적합)/N/A(해당없음) 2+1단계뿐이고,
   AI 설명도 "적합(뭉뚱그림)" vs "부적합(개별)" 이진 구조다. "주의" 단계를 어디에 매핑할지
   (예: 회사 자체 권장사항=주의, 별표3 부적합=위험, 별표3 적합=양호?) 정의된 문서 없음.
3. **측정값 vs 기준 구조화 표시**: 현재는 AI 프롬프트 안에서 임계값 비교를 문장으로만 풀어
   설명(`unit-inspection-ai-diagnosis.ts::buildMeasurementLines`). "실측 X / 기준 Y" 형태로
   화면·PDF에 별도 필드로 노출하길 원하는지 미확정.
4. **"세대 요약·권고"**: 종합총평(summary)은 이미 있음. 이와 별도로 "권고사항" 필드를
   따로 원하는지, 지금 총평으로 충분한지 미확정.

## 5. 다음 액션

`HANDOFF_TO_GROK.md`에 위 4가지 결정 필요 사항을 정리해 총괄에게 전달. 총괄/CEO 확정 회신이
`HANDOFF_FROM_GROK.md`에 오면 그때 구현 착수.
