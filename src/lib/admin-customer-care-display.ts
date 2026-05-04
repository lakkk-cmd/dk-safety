import type { AdminCustomerCareRow } from "@/lib/admin-customer-care";

/** 접수 생성 시각(ISO) → 서울 기준 YYYYMMDD */
export function kstDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00000000";
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).replaceAll("-", "");
}

/**
 * 관리자 화면 표시용 예약 번호. DB `id`(UUID)는 그대로 두고,
 * 서울 날짜(접수 생성일)별 `created_at` 오름차순 일련번호로 `YYYYMMDD_NNN` 부여.
 */
export function buildReservationDisplayIdById(rows: AdminCustomerCareRow[]): Map<string, string> {
  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.reservationId.localeCompare(b.reservationId);
  });
  const map = new Map<string, string>();
  let day = "";
  let n = 0;
  for (const r of sorted) {
    const dk = kstDateKeyFromIso(r.createdAt);
    if (dk !== day) {
      day = dk;
      n = 0;
    }
    n += 1;
    map.set(r.reservationId, `${dk}_${String(n).padStart(3, "0")}`);
  }
  return map;
}

export function reservationStatusKo(status: string): string {
  const s = String(status ?? "").trim();
  if (s === "waiting_payment") return "입금대기";
  if (s === "접수") return "접수";
  if (s === "진행중") return "진행중";
  if (s === "완료") return "완료";
  return s || "—";
}

export function orderPaymentStatusKo(v: string | null | undefined): string {
  const u = String(v ?? "").trim().toUpperCase();
  if (!u) return "—";
  const map: Record<string, string> = {
    PENDING: "결제 대기",
    WAITING_FOR_DEPOSIT: "입금 확인 중",
    PAID: "입금 완료",
    FAILED: "결제 실패",
    UNKNOWN: "알 수 없음"
  };
  return map[u] ?? String(v ?? "—");
}

export function orderDispatchStatusKo(v: string | null | undefined): string {
  const u = String(v ?? "").trim().toUpperCase();
  if (!u || u === "UNKNOWN") return "—";
  const map: Record<string, string> = {
    IDLE: "배정 대기",
    ACTIVE: "배정 진행",
    ASSIGNED: "기사 배정됨",
    IN_PROGRESS: "현장 작업 중",
    DONE: "현장 완료",
    BLOCKED: "배정 제한"
  };
  return map[u] ?? String(v ?? "—");
}

export function finalPaymentStatusKo(v: string | null | undefined): string {
  const u = String(v ?? "").trim().toUpperCase();
  if (!u) return "—";
  const map: Record<string, string> = {
    PENDING: "정산 대기",
    REQUESTED: "정산 요청",
    PAID: "정산 완료",
    FAILED: "정산 실패",
    CANCELLED: "정산 취소",
    UNKNOWN: "알 수 없음"
  };
  return map[u] ?? String(v ?? "—");
}

export function taskStatusKo(v: string | null | undefined): string {
  const u = String(v ?? "").trim().toLowerCase();
  if (!u) return "—";
  const map: Record<string, string> = {
    assigned: "배정됨",
    in_progress: "작업 중",
    completed: "완료"
  };
  return map[u] ?? String(v ?? "—");
}
