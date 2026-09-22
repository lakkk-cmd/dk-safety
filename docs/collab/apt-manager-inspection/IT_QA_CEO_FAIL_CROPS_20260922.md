# IT 검수 추가 — CEO CRITICAL 스크린샷 (2026-09-22 · 폰트·명의)

경로 A · v2 · 산출 대기. 코드·배포 금지.

## 근거 PNG
- 비고 넘침 / 확인란 셀·숫자 위치 (기존)
- `CEO_fail_measured_font_too_small.png` — 실측값 < 바로 위 셀
- `CEO_fail_confirm_font_too_small.png` — 해당호·점검자명 < 확인란 라벨
- `CEO_fail_office_name_position.png` — 관리사무소 위치·정렬

## 합격 (추가)
1. 실측값 줄 폰트 = **바로 위 셀과 동일** (F20)
2. 확인란 숫자·점검자명 폰트 = **확인란 라벨과 동일** (F21)
3. `{아파트명} 관리사무소` = 현 위치보다 **약 4줄 아래** + **오른쪽 정렬** + 잘림0 (F18)
4. 기존: 비고 셀밖0 · 상단왼=숫자만·「호」비겹침 · 상단오른=인만 · 하단오른=이름

## crop 필수
crop-remarks / crop-confirm / crop-measured-font-match / crop-office-name-footer
