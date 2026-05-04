export type ReservationInput = {
  name?: string;
  phone?: string;
  address?: string;
  serviceType?: string;
  preferredDate?: string;
  preferredTime?: string;
  detail?: string;
};

const PHONE_PATTERN = /^01[0-9]-?\d{3,4}-?\d{4}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizePhone(phone: string): string {
  return phone.replaceAll(/[^0-9]/g, "").replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3");
}

export function validateReservationInput(input: ReservationInput): string | null {
  const serviceType = input.serviceType?.trim() ?? "";
  const preferredDate = input.preferredDate?.trim() ?? "";
  const preferredTime = input.preferredTime?.trim() ?? "";
  const name = input.name?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  const address = input.address?.trim() ?? "";
  const detail = input.detail?.trim() ?? "";

  if (!serviceType || !preferredDate || !preferredTime) {
    return "필수 입력값이 누락되었습니다.";
  }

  if (name && (name.length < 2 || name.length > 20)) {
    return "성함은 2~20자로 입력해주세요.";
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    return "연락처 형식이 올바르지 않습니다. 예: 010-1234-5678";
  }

  if (address && (address.length < 5 || address.length > 120)) {
    return "주소는 5~120자로 입력해주세요.";
  }

  if (detail && (detail.length < 2 || detail.length > 500)) {
    return "증상/요청사항은 2~500자로 입력해주세요.";
  }

  const requestedDate = new Date(preferredDate);
  if (Number.isNaN(requestedDate.getTime())) {
    return "방문 희망일 형식이 올바르지 않습니다.";
  }

  if (!TIME_PATTERN.test(preferredTime)) {
    return "방문 요청시간 형식이 올바르지 않습니다. 예: 14:30";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  requestedDate.setHours(0, 0, 0, 0);
  if (requestedDate < today) {
    return "방문 희망일은 오늘 이후 날짜로 선택해주세요.";
  }

  const isRequestedToday = requestedDate.getTime() === today.getTime();
  if (isRequestedToday) {
    const [hour, minute] = preferredTime.split(":").map(Number);
    const requestedMinutes = hour * 60 + minute;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (requestedMinutes <= nowMinutes) {
      return "지난 시간은 선택할 수 없습니다. 현재 시각 이후 시간대로 선택해주세요.";
    }
  }

  return null;
}

/** `<input type="time">` 등에서 오는 `HH:MM:SS` 앞 5자리로 통일 */
export function normalizePreferredTimeForApi(raw: string | undefined): string {
  const preferredTimeNorm = raw?.trim() || "09:00";
  const preferredTimeMatch = preferredTimeNorm.match(/^(\d{1,2}):(\d{2})/);
  return preferredTimeMatch
    ? `${String(Math.min(23, parseInt(preferredTimeMatch[1], 10))).padStart(2, "0")}:${String(Math.min(59, parseInt(preferredTimeMatch[2], 10))).padStart(2, "0")}`
    : "09:00";
}

/** 관리자 오프라인 접수: 과거 일정·당일 과거 시각 허용, 상세는 짧아도 됨 */
export function validateAdminOfflineReservationInput(input: ReservationInput): string | null {
  const serviceType = input.serviceType?.trim() ?? "";
  const preferredDate = input.preferredDate?.trim() ?? "";
  const preferredTime = normalizePreferredTimeForApi(input.preferredTime);
  const name = input.name?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  const address = input.address?.trim() ?? "";
  const detail = input.detail?.trim() ?? "";

  if (!serviceType || serviceType.length < 2) {
    return "서비스 유형을 2자 이상 입력해주세요.";
  }
  if (!preferredDate) {
    return "방문 희망일을 입력해주세요.";
  }
  if (!TIME_PATTERN.test(preferredTime)) {
    return "방문 요청시간 형식이 올바르지 않습니다. 예: 14:30";
  }
  if (name.length < 2 || name.length > 20) {
    return "성함은 2~20자로 입력해주세요.";
  }
  if (!phone || !PHONE_PATTERN.test(phone)) {
    return "연락처 형식이 올바르지 않습니다. 예: 010-1234-5678";
  }
  if (address.length < 5 || address.length > 120) {
    return "주소는 5~120자로 입력해주세요.";
  }
  if (detail.length > 500) {
    return "요청사항은 500자 이하로 입력해주세요.";
  }
  const requestedDate = new Date(preferredDate);
  if (Number.isNaN(requestedDate.getTime())) {
    return "방문 희망일 형식이 올바르지 않습니다.";
  }
  return null;
}
