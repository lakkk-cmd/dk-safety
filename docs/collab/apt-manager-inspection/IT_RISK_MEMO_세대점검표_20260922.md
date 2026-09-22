# IT 기술 리스크 메모 — 세대점검표(별지15) 5열 복원·샘플
작성: IT·디지털팀 / 2026-09-22 / 배포·Play·비밀키·본작업 없음(검수 전)

근거: CEO PC `dk-safety` 소스 실독 (`src/lib/document-pdf.tsx` UnitInspectionElement, `unit-inspection-ai-diagnosis.ts` 정정본 오케스트레이션, `docs/collab/apt-manager-inspection/*`, samples/).

## 1. 현황 (코드 기준)
- 5열 복원·하단 `{아파트명} 관리사무소`·실측/기준·권고 목록은 **이미 샘플 반영된 상태**(코드 주석 2026-09-22).
- 샘플 산출물(로컬): `docs/collab/apt-manager-inspection/samples/sample-unit-inspection-*.pdf|png`
- 총괄 박스 미러: `/workspace/ansim-jeongi/collab/apt-manager-inspection/` (핸드오프·원본 HWP)
- `STATUS.md`(로컬)는 여전히 “4열 통합”로 남아 **문서 드리프트** — 코드와 불일치. 샘플 검수 전 STATUS/HANDOFF 동기화 권고.

## 2. satori 레이아웃 리스크
| 리스크 | 왜 위험한가 | 완화 |
|---|---|---|
| 높이 수동 추정 | satori에 실측 API 없음. `estimateHeightBeforeDiagnosisBlock` / `estimateTableHeight` 손합산. 과소추정 시 flex-shrink로 하단(관리사무소) 짓눌림·소실 이력 있음 | 긴 비고·미방문·부적합 다건 케이스에서 `renderUnitInspectionPreviewPng` + page PNG 육안 |
| 5열→비고폭 140px | 폭 166→140 축소로 줄바꿈·표 높이 증가. 주석에 “실측 재검증 필요” | 비고 긴문구 샘플 필수 |
| ○ 글리프 | NotoSansKR 서브셋에 ○ 없음 → satori 폰트 실패. `ResultCircle`(CSS 원) 우회 중 | 텍스트 ○ 재도입 금지. 비고란 안내도 ResultCircle 유지 |
| N/A 표기 | CEO 스펙은 `/`(해당없음). 코드 `checklistResultSymbol`은 N/A를 **"해당없음" 문자열**로 출력 | 샘플에서 `/` vs 문구 여부를 CEO 확인. 셀·비고 안내 기호 일치 여부 체크 |
| lineHeight 미지정 | 비고 줄바꿈 겹침 버그 이력 | 표 셀에 lineHeight 명시 유지 |
| 페이지 스페이서 | 1p 서명 고정 + 2p AI블록. beforeDiagnosisHeight > PAGE_H_PX면 spacer만으로 해결 불가 | heightPx를 실측 before 기준(이미 반영) — 회귀 시 하단 잘림만 보면 됨 |

## 3. unit_inspection_pdf_corrections 오버레이 리스크
- 흐름: 제출 즉시 1차 PDF → `after()` AI 진단 → **원본행 UPDATE 금지** → `unit_inspection_pdf_corrections`에 정정본 URL만 저장.
- 레이아웃 변경은 **1차 발급과 정정본 재렌더 모두** `renderUnitInspectionPdf` 동일 경로를 탐 → 샘플 레이아웃 오류가 정정본에도 복제됨.
- 기존 발급건은 원본 불변; 새 레이아웃은 신규·정정본에만 적용. 과거 건 일괄 재발급은 **본작업·승인 후** 별도 작업.
- 샘플 단계: 미리보기 PNG/샘플 PDF만 권장. 운영 버킷·실고객 정정본 업로드·배포 금지.

## 4. 범위 밖(구현 금지 확인)
- 사진, 양호·주의·위험 3단계 배지: 미구현·미승인 유지.
- main 병합·Play·비밀키: 금지.

## 5. 권고 (샘플 게이트)
1. 로컬 STATUS를 5열 반영본으로 갱신(문서=코드).
2. 아래 체크리스트로 samples PNG 육안 + 로그인/구독/이력 스모크.
3. N/A를 `/`로 맞출지 CEO 한 줄 확인 후 본작업.
