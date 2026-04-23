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
  const name = input.name?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  const address = input.address?.trim() ?? "";
  const serviceType = input.serviceType?.trim() ?? "";
  const preferredDate = input.preferredDate?.trim() ?? "";
  const preferredTime = input.preferredTime?.trim() ?? "";
  const detail = input.detail?.trim() ?? "";

  if (!name || !phone || !address || !serviceType || !preferredDate || !preferredTime || !detail) {
    return "필수 입력값이 누락되었습니다.";
  }

  if (name.length < 2 || name.length > 20) {
    return "성함은 2~20자로 입력해주세요.";
  }

  if (!PHONE_PATTERN.test(phone)) {
    return "연락처 형식이 올바르지 않습니다. 예: 010-1234-5678";
  }

  if (address.length < 5 || address.length > 120) {
    return "주소는 5~120자로 입력해주세요.";
  }

  if (detail.length < 2 || detail.length > 500) {
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

  return null;
}
