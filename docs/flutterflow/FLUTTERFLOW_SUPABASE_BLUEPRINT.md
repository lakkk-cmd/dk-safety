# FlutterFlow x Supabase Blueprint (Daekyung)

FlutterFlow에서 바로 구현 가능한 통합 설계서입니다.  
기준: `flutterflow_supabase_integration.html` 6개 탭 + 현재 서버 스키마.

## 0) 스키마 매핑 (중요)

아티팩트는 `orders`, `technicians` 테이블명을 사용하지만 현재 프로젝트는 아래를 사용합니다.

- `orders` -> `reservations`
- `technicians` -> `workers`
- `order_logs.order_id` -> `order_logs.reservation_id`
- `warranties.order_id` -> `warranties.reservation_id`

FlutterFlow Query 작성 시 반드시 위 이름으로 매핑하세요.

## 1) 전역 AppState

FlutterFlow `App State` 변수:

- `currentAptCode` (String)
- `currentAptId` (String)
- `currentOrderId` (String)
- `currentResidentPhone` (String)
- `currentWorkerId` (String)

## 2) 핵심 3개 Custom Action

### A. `parseAptCodeFromUrl`

- 실행 시점: 앱 시작 `LandingPage` `On Page Load`
- 입력: `currentUri`
- 출력: apt code (`APT001`)
- 저장: `AppState.currentAptCode`

### B. `confirmPrepayment`

- 실행 시점: PG 결제 성공 콜백 직후
- 목적: `prepayment_confirmed=true` + `payment_status='PREPAID'`
- 규칙: `paidAmount >= baseFee` 검증 실패 시 업데이트 금지

### C. `issueWarranty`

- 실행 시점: 정산 완료 직후 (`SETTLED`)
- 목적: 보증 번호 생성 -> `warranties` insert -> `reservations.warranty_id` 연결

## 3) 페이지 구조와 쿼리

### 3.1 입주민 앱

1. `LandingPage`
   - Action: `parseAptCodeFromUrl`
   - Query: `apartments` where `apt_code = AppState.currentAptCode`, `is_active=true`
   - Success: `currentAptId` 저장 후 `ServiceListPage`

2. `ServiceListPage`
   - Query A: `service_items` where `apt_id = currentAptId`, `is_active=true`
   - Query B(없으면): `service_items` where `apt_id is null`, `is_active=true`
   - 표시: `min_fee ~ max_fee`, 할인 라벨

3. `BookingPage`
   - 입력: `name/phone/dong/ho/service_type/date/time`
   - Action: `createOrder` (실제 테이블 `reservations`)
   - 생성 규칙: `prepayment_confirmed=false`, `payment_status='PENDING'`
   - 결과: `currentOrderId` 저장 후 `PaymentPage`

4. `PaymentPage`
   - 표시: 기본 출장비 `50,000`
   - PG 성공 후: `confirmPrepayment`
   - 성공 시: `OrderStatusPage`

5. `OrderStatusPage`
   - Query: `reservations` by `id = currentOrderId` + **Enable Realtime**
   - 상태 라벨: `PENDING -> PREPAID -> ASSIGNED -> IN_PROGRESS -> SETTLED`

6. `WarrantyPage`
   - Query: `warranties` by `reservation_id = currentOrderId`
   - 버튼: `verify_url` 열기 / 보증번호 복사

### 3.2 관리자 앱

1. `AdminDashboard`
   - Query: `reservations` where `payment_status in ('PREPAID','ASSIGNED','CONFIRMING')`
   - 정렬: `created_at desc`

2. `OrderApprovalPage`
   - Query 필수조건:
     - `prepayment_confirmed = true`
     - `payment_status = 'PREPAID'`
   - Action: `assignTechnician`

3. `ExtraFeeConfirmPage`
   - Query: `payment_status='CONFIRMING'`
   - Action: `confirmExtraFee` -> `payment_status='CONFIRMED'`

4. `ServiceItemEditPage`
   - Update: `service_items.min_fee/max_fee/...`

### 3.3 기사 앱

1. `TechDashboard`
   - Query 필수조건:
     - `technician_id = currentWorkerId`
     - `prepayment_confirmed = true`
     - `payment_status in ('ASSIGNED','IN_PROGRESS')`
   - **Enable Realtime**

2. `WorkDetailPage`
   - Action: 시작 -> `IN_PROGRESS`, 완료 -> 정산 페이지 이동

3. `ExtraFeeInputPage`
   - Action: `uploadSitePhoto`, `submitExtraFee`

4. `SettlementPage`
   - Action: `calculateAndSettle` -> 내부에서 `issueWarranty`

## 4) Realtime 체크리스트

1. FlutterFlow Backend Query에서 **Enable Realtime ON**
2. Supabase Replication에서 테이블 추가:
   - `reservations`
   - `warranties`
   - `live_notifications` (사용 시)
3. 필터가 있는 실시간 쿼리는 앱 상태값(`currentOrderId`, `currentWorkerId`) 초기화 완료 후 연결

## 5) 특허 로직 무결성 체크

- [ ] URL `?id=APTxxx` 파싱 실패 시 예약 플로우 진입 금지
- [ ] `prepayment_confirmed=false` 주문은 관리자/기사 배정 목록에서 제외
- [ ] `confirmPrepayment`는 금액 검증 실패 시 `false` 반환
- [ ] 정산 완료 시 `issueWarranty` 자동 호출
- [ ] 보증번호 형식 `WST-{year}-{APT_CODE}-{SEQ5}` 고정
- [ ] `verify_url = {domain}/verify/{warranty_number}` 저장

## 6) 권장 도메인 상수

- `appBaseUrl = "http://www.dkansim.com"`

모든 보증서 `verify_url` 생성에 동일하게 사용하세요.
