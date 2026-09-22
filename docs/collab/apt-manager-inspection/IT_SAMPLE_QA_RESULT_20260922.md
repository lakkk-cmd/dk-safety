# IT 샘플 QA 결과 — A~E (2026-09-22)
대상: `dk-safety/docs/collab/apt-manager-inspection/samples/`
배포·본작업·비밀키: 미실시

## 판정 요약
| 항목 | 결과 |
|---|---|
| A 빌드·미리보기 | 부분통과 — samples PDF/PNG 존재·육안 실시. 이번 턴 `npm run build` 재실행 안 함 |
| B 별지15 육안 | **부분실패** — 5열·○/×·2p 실측/기준·권고 OK. **하단 관리사무소 잘림 FAIL** |
| C satori 스트레스 | **실패** — page1 하단 잘림 + page2 상단에 관리사무소 잔상(페이지 경계 오버플로) |
| D 회귀 스모크 | 미실시 — 배포 금지·실서버 로그인 스모크 생략(샘플 단계) |
| E 게이트 | 샘플 CEO 최종통과 전 — 본작업 중단 유지 |

## 중점 3건
1. **하단 관리사무소 잘림 (FAIL)**  
   `sample-unit-inspection-page1.png` 하단 `{아파트명} 관리사무소` 글자 하단 절반 절단.  
   `page2` 상단에도 관리사무소 문구 잔상 → `beforeDiagnosisHeight` 과소추정·PAGE 경계 오버플로로 판단.
2. **N/A→「/」 (미충족·코드 불일치)**  
   비고 안내문은 `/(해당없음)` 표기.  
   본 샘플은 방문점검(○/×만)이라 표 칸 `/` 미출현.  
   코드 `checklistResultSymbol`: N/A → `"해당없음"` 문자열 (「/」 아님). 미방문 샘플 재검수 필요.
3. **STATUS 5열 동기화 (FAIL)**  
   로컬 `STATUS.md` 3절 표가 여전히 「4열로 통합」. 코드·samples는 5열. 문서 드리프트.

## 통과한 것
- 5열 헤더·구조 육안 확인
- 점검결과 ○(원/ResultCircle)·× 사용
- 2p: 실측값 vs 판정기준, 권고사항 목록, 사진·3단계 배지 없음

## 권고 (본작업 전)
1. satori 높이/하단 여백 보정 후 page1·page2 샘플 재생성
2. N/A 셀을 `/`로 맞추고 미방문 샘플 1건 추가
3. STATUS.md 5열·하단·기호 반영 동기화
4. 그다음 CEO 샘플 재확인

증빙(박스): `sample-page1.png`, `_qa_page1_bottom.png`, `_qa_page2_top.png`
