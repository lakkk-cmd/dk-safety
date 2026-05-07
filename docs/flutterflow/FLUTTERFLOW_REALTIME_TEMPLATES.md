# FlutterFlow Realtime Templates

FlutterFlow에서 `Backend Query -> Enable Realtime` 토글을 켠 뒤, 아래 필터 템플릿을 그대로 적용하세요.

## 1) Supabase 사전 설정

Supabase Dashboard -> Database -> Replication:

- `reservations` 추가
- `warranties` 추가
- `live_notifications` 추가 (알림 UI 사용 시)

## 2) 입주민 상태 추적

대상 페이지: `OrderStatusPage`

- Table: `reservations`
- Filters:
  - `id == AppState.currentOrderId`
- Realtime: ON

UI 반영:
- `payment_status` 변경 시 스텝 UI 갱신
- `worker_id`가 채워지면 기사 배정 정보 섹션 표시

## 3) 관리자 배정 대기 목록

대상 페이지: `AdminOrderApprovalPage`

- Table: `reservations`
- Filters:
  - `prepayment_confirmed == true`
  - `payment_status == PREPAID`
- Order: `created_at DESC`
- Realtime: ON

효과:
- 결제 완료(`PREPAID`) 주문이 자동으로 목록에 등장

## 4) 기사 작업 목록

대상 페이지: `TechDashboard`

- Table: `reservations`
- Filters:
  - `worker_id == AppState.currentWorkerId`
  - `prepayment_confirmed == true`
  - `payment_status in (ASSIGNED, IN_PROGRESS)`
- Realtime: ON

효과:
- 관리자 배정 직후 기사 앱에 자동 노출

## 5) 보증서 상태 화면

대상 페이지: `WarrantyPage`

- Table: `warranties`
- Filters:
  - `reservation_id == AppState.currentOrderId`
  - `status == ISSUED`
- Realtime: ON

효과:
- 정산 완료 후 보증서 발급 레코드가 자동 반영

## 6) 알림 토스트 (선택)

대상 페이지: 관리자/기사/입주민 공통 레이아웃

- Table: `live_notifications`
- Filters:
  - 관리자: `role == admin`
  - 기사: `role == worker` and `target_worker_id == currentWorkerId`
  - 입주민: `role == resident` and `target_phone == currentResidentPhone`
- Realtime: ON

## 7) 장애 대응 체크

- Realtime가 안 오면:
  1. Replication 등록 여부 확인
  2. RLS 정책에서 `select` 허용 확인
  3. 필터 값(AppState) 초기화 타이밍 확인
  4. 같은 row를 실제로 UPDATE/INSERT 했는지 SQL Editor에서 확인
