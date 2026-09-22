# 세션 로그

## 2026-09-22 (Claude Code, 로컬) — 4회차: CEO 절대기준 경로 A 전면 재작성

- CEO가 2~3회차 satori 기반 샘플(경로 C)을 절대기준 미달로 **폐기**, 기술경로 **A**(원본
  고시 PDF 불변 배경 + pdf-lib 좌표 스탬프) 확정 지시(`claude-paste-pathA-resample.md`).
- 원본 PDF(`public/templates/unit-inspection-form-gazette-original.pdf`, 기존 Desktop
  파일 바이트 그대로 리포에 복사)를 pdfjs-dist로 텍스트 좌표 실측 → 12항목 점검결과/비고,
  호/귀하/일자, 담당자(관리사무소 명의) 빈칸 좌표 산출(`PATH_A_COORDINATES.md`).
- `@pdf-lib/fontkit` 신규 설치, ○/× 글리프 커버리지 검증(이 저장소 NotoSansKR-Bold는
  서브셋이라 ○ 없음 확인, 로컬 샘플은 맑은 고딕으로 검증 — 배포용 폰트 소싱은 잔여 리스크).
- `src/lib/unit-inspection-pdf-path-a.ts` 신규: 원본 PDF를 그대로 로드해 빈칸만 pdf-lib로
  draw. 1차 시도에서 비고란 텍스트가 표 밖으로 넘치는 걸 실제 렌더링으로 발견 → 폰트 실측
  폭 기준 클램프(≈33pt)로 수정.
- `src/lib/unit-inspection-pdf-page2.tsx` 신규: 2페이지 별첨(1p와 완전 분리) — 진단 4절
  (관찰→의미·인과→우선순위→한계) + 종합총평 문단 1개(불릿 금지) + 실측vs기준 표(판정은
  결정론적 계산) + 권고사항(회사 자체 권장사항 통합, 최대 5개).
- `document-pdf.tsx`의 렌더링 헬퍼(PAGE_W_PX 등, renderElementToPng, addSlicedPages 등)를
  export로 변경해 2p 렌더러가 재사용하도록 함 — 기존 로직 자체는 안 건드림.
- `@napi-rs/canvas`+pdfjs-dist로 PDF→PNG 라스터 스크립트 작성해 원본|스탬프본 나란히 대비
  이미지 생성, 육안 대조로 F01–F14 전부 통과 확인.
- 방문 샘플(부적합 5건) + 미방문 샘플(N/A "/" 표기 검증) 2세트 생성, `npm run build` 통과.
- 구 경로(C) 코드(`UnitInspectionElement`/`renderUnitInspectionPdf`, `unit-inspection-ai-diagnosis.ts`
  구 스키마)는 의도적으로 안 건드림 — 삭제/AI 파이프라인 v2 연동은 본작업 범위로 남김.
- 임시 좌표추출/렌더링 스크립트 전부 삭제(repo에 커밋 안 함), 산출물만 보존.
- **여기서 다시 중단** — CEO/총괄 최종 확정 승인 대기.

## 2026-09-22 (Claude Code, 로컬) — 3회차: IT QA 지적 + 품질기준 반영 재샘플 (경로 C, 폐기됨)

- 총괄이 남긴 `IT_RISK_MEMO_*`, `IT_SAMPLE_QA_CHECKLIST_*`, `IT_SAMPLE_QA_RESULT_*`,
  `claude-paste-resample.md`, `진단출력_품질기준안.md`를 전부 읽고 반영(커밋 전 발견 — 병렬로
  같은 폴더에 쌓이고 있었음).
- 하단 "관리사무소" 잘림(IT QA FAIL) 원인 확정: 비고/점검결과 폭까지 줄인 게 문제 —
  두 폭을 원복하고 새 열 폭은 확인사항(flex)에서만 가져오도록 재조정.
- N/A 표기를 "해당없음" 문자열 → "/" 기호로 수정(원본 표기 규칙 일치), 미방문 간이점검 샘플
  1건 추가 생성해 확인.
- `unit-inspection-rules.ts`의 autoJudge 노트 문구 단축("AI판정"/회로수 부연 제거).
- 2p 제목 "AI 안전진단 결과 (상세)" + 상단 고정 캡션 추가.
- 종합총평 부적합 건수를 `autoDiagnosis.length` 기준으로 동적 계산(하드코딩 금지).
- "우리집 전기주치의 자체 권장사항" 박스와 "권고사항" 박스를 하나로 통합.
- 실측표에 접지저항(미측정) 행 추가.
- `unit-inspection-ai-diagnosis.ts` SYSTEM_PROMPT에 톤 규칙(공포조성·시공지시·과태료단정·
  당사시공약속 금지) + `recommendations` 출력 스키마 추가, 파싱 함수도 실제로 연결(클램프
  포함) — 2회차엔 "타입만 추가"였던 부분을 실제 프롬프트 계약으로 승격.
- `npm run build` 재통과 확인.
- 방문점검(부적합 5건)·미방문 간이점검(N/A 다수) 두 케이스로 샘플 재생성, 전부 육안 확인
  (페이지 겹침/잘림 없음, 문서 라벨 일관성 확인).
- STATUS.md 5열 반영 동기화, HANDOFF_TO_GROK.md에 IT 자가체크 A~E 기록.
- **여기서 다시 중단** — CEO/총괄 최종 확정 승인 대기.

## 2026-09-22 (Claude Code, 로컬) — 2회차: 샘플 산출

- 브랜치 `sample/unit-inspection-original-form-match` 생성(main 아님).
- `src/lib/document-pdf.tsx`: 5열 표 복원(부적합설비/위험요인 분리), ○/× 기호 표기(○는
  폰트 미지원이라 CSS 원으로 대체), 하단 "{아파트명} 관리사무소" 문구, "실측값 vs 판정기준"
  구조화 박스 신설, "권고사항" 목록 박스 신설.
- `src/lib/unit-inspection-ai-diagnosis.ts`: `UnitInspectionAiDiagnosis`에 `recommendations?`
  필드 추가(타입만, 실제 프롬프트 연동은 본작업에서).
- `UnitInspectionPdfData`에 `circuitBreakerCount` 추가 + 호출부 6곳(worker/apt-manager 제출
  API, admin pdf/reissue-pdf API, ai-diagnosis 사후보정, backfill 스크립트) 배선.
- 표 폭 재배분 중 높이 추정 상수 미스매치로 하단 줄이 페이지 경계에서 잘리는 버그를 실측
  렌더링으로 발견+수정(비고/점검결과 폭은 유지, 확인사항 열에서만 새 폭 확보).
- `npm run build` 통과, `npm run dev` Ready + curl 200대 확인.
- 임시 검증 스크립트(`scripts/_tmp-sample-unit-inspection.ts`)로 샘플 PDF/PNG 1건 생성 후
  스크립트는 삭제(repo에 커밋 안 함), 산출물만 `samples/`에 보존.
- **여기서 중단** — CEO/총괄 최종 확정 승인 대기. main 병합·배포 안 함.

## 2026-09-22 (Claude Code, 로컬) — 1회차: 조사

- 작업 내용: 조사만. 코드 변경 없음.
- 점검입력→진단→PDF 호출 체인 전체 확인(제출 API → 별표3 규칙엔진 즉시판정 →
  1차 PDF 응답 → `after()` 백그라운드 AI 안전진단 → 정정본 PDF 오버레이 교체).
- 원본 양식(별지15호) PDF를 실제로 읽어 현재 PDF 렌더링(`document-pdf.tsx`)과 항목별 대조 —
  12개 체크리스트 라벨/카테고리/위험요인 전부 원문과 1:1 일치 확인. 실측값 기입, 부적합
  개별설명, 서명/일자도 이미 구현돼 있음을 확인.
- 진짜 공백 4가지(사진, 3단계 양호/주의/위험, 측정값-기준 구조화 표시, 권고 별도필드) 식별
  — 스펙 미정이라 구현하지 않고 `docs/collab/apt-manager-inspection/` 폴더(STATUS/
  HANDOFF_TO_GROK/HANDOFF_FROM_GROK/REQUIREMENTS) 신설 후 결정 필요 사항으로 정리.
- 배포/Play 업로드/비밀키 관련 작업 없음.
