# FlutterFlow Import + Page Checklist

이 문서는 FlutterFlow에서 마지막 구현을 빠르게 끝내기 위한 실행 체크리스트입니다.

## 1) Custom Actions 등록 순서

소스 파일: `flutterflow/custom_actions/daekyung_actions.dart`

FlutterFlow -> `Custom Code` -> `Actions`에서 아래 순서대로 생성/붙여넣기:

1. `parseAptCodeFromUrl(String? currentUri) -> String?`
2. `loadApartmentData(String aptCode) -> Future<Map<String, dynamic>?>`
3. `createOrder(...) -> Future<String>`
4. `confirmPrepayment(...) -> Future<bool>`
5. `assignTechnician(String orderId, String workerId) -> Future<void>`
6. `uploadSitePhoto(...) -> Future<String>`
7. `submitExtraFee(...) -> Future<void>`
8. `confirmExtraFee(String orderId) -> Future<void>`
9. `calculateAndSettle(String orderId) -> Future<void>`
10. `issueWarranty(String orderId, {required String appBaseUrl}) -> Future<String>`
11. `verifyWarranty(String warrantyNumber) -> Future<Map<String, dynamic>?>`
12. `updateServiceFee(...) -> Future<void>`

권장: 1~4를 먼저 등록해 입주민 핵심 플로우를 즉시 동작시킨 뒤, 관리자/기사 액션을 추가합니다.

## 2) App State 변수 생성

FlutterFlow -> `App State`:

- `currentAptCode` (String)
- `currentAptId` (String)
- `currentOrderId` (String)
- `currentResidentPhone` (String)
- `currentWorkerId` (String)

## 3) 페이지별 클릭 설정 (입주민)

## `LandingPage`
- `On Page Load`
  - Action 1: `parseAptCodeFromUrl(currentUri)`
  - Action 2: 결과를 `AppState.currentAptCode`에 저장
  - Action 3: Backend Query `apartments` (`apt_code == currentAptCode`, `is_active == true`)
  - Action 4: `currentAptId` 저장 후 `ServiceListPage` 이동

## `ServiceListPage`
- Backend Query 1: `service_items` (`apt_id == currentAptId`, `is_active == true`)
- Backend Query 2(조건부 fallback): `service_items` (`apt_id is null`, `is_active == true`)
- 카드 클릭:
  - 선택한 `service_type`를 페이지 변수에 저장
  - `BookingPage` 이동

## `BookingPage`
- 제출 버튼:
  - Action: `createOrder(...)`
  - 성공 시 반환 id를 `AppState.currentOrderId` 저장
  - `PaymentPage` 이동

## `PaymentPage`
- 결제 성공 콜백:
  - Action: `confirmPrepayment(orderId, txId, paidAmount, baseFee)`
  - 결과가 `true`이면 `OrderStatusPage` 이동

## `OrderStatusPage`
- Backend Query `reservations` (`id == currentOrderId`)
- `Enable Realtime` ON
- 상태 텍스트 매핑:
  - `PENDING`: 결제 대기
  - `PREPAID`: 배정 대기
  - `ASSIGNED`: 기사 배정 완료
  - `IN_PROGRESS`: 작업 진행 중
  - `SETTLED`: 정산 완료

## `WarrantyPage`
- Backend Query `warranties` (`reservation_id == currentOrderId`)
- 버튼:
  - `verify_url` 열기
  - `warranty_number` 복사

## 4) 페이지별 클릭 설정 (관리자)

## `AdminOrderApprovalPage`
- Query: `reservations`
  - `prepayment_confirmed == true`
  - `payment_status == PREPAID`
- 배정 버튼:
  - `assignTechnician(orderId, selectedWorkerId)`

## `ExtraFeeConfirmPage`
- Query: `reservations` (`payment_status == CONFIRMING`)
- 승인 버튼:
  - `confirmExtraFee(orderId)`

## `ServiceItemEditPage`
- 저장 버튼:
  - `updateServiceFee(serviceItemId, minFee, maxFee)`

## 5) 페이지별 클릭 설정 (기사)

## `TechDashboard`
- Query: `reservations`
  - `worker_id == currentWorkerId`
  - `prepayment_confirmed == true`
  - `payment_status in (ASSIGNED, IN_PROGRESS)`
- `Enable Realtime` ON

## `ExtraFeeInputPage`
- 사진 업로드 버튼:
  - `uploadSitePhoto(orderId, bytes)` 반복 -> URL 배열 수집
- 제출 버튼:
  - `submitExtraFee(orderId, extraFee, note, photoUrls)`

## `SettlementPage`
- 정산 완료 버튼:
  - `calculateAndSettle(orderId)`
  - 내부에서 `issueWarranty` 자동 호출

## 6) 최종 수동 QA

- [ ] `?id=APT001` 진입 시 단지 로드
- [ ] 결제 전 주문은 관리자/기사 배정 목록에 미노출
- [ ] 결제 후 `prepayment_confirmed=true`로 바뀌고 배정 가능
- [ ] 정산 후 `warranties` 생성 + `reservations.warranty_id` 연결
- [ ] 보증번호 입력 시 진위확인 성공
