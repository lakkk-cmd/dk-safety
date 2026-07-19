import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createReservation, hasReservationTimeConflict, readReservations } from "@/lib/reservations-store";
import { normalizePhone, validateReservationInput } from "@/lib/reservation-validation";
import { appendActivityLog } from "@/lib/activity-log";
import { saveImageFiles } from "@/lib/upload-store";
import { readPaymentSettings } from "@/lib/payment-settings";
import { getResidentBySessionId } from "@/lib/resident-db";
import { RESIDENT_AUTH_COOKIE } from "@/lib/site-config";
import { pushReservationProgressNotifications } from "@/lib/live-notify";
import { sendAdminAlertSms } from "@/lib/solapi-agent";

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(RESIDENT_AUTH_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ message: "로그인이 필요합니다.", reservations: [] }, { status: 401 });
  }
  const resident = await getResidentBySessionId(sessionId);
  if (!resident) {
    return NextResponse.json({ message: "로그인 세션이 유효하지 않습니다.", reservations: [] }, { status: 401 });
  }

  const reservations = await readReservations();
  const residentPhone = normalizePhone(resident.phone);
  const residentUnit = resident.unitNumber.trim();
  const residentApartment = resident.apartmentName.trim();
  const normalizedResidentUnit = residentUnit.replaceAll(/\s/g, "");
  const normalizedResidentApartment = residentApartment.replaceAll(/\s/g, "");
  const normalizedResidentName = resident.name.trim().replaceAll(/\s/g, "");

  const parseDongHo = (value: string) => {
    const compact = value.replaceAll(/\s/g, "");
    const match = compact.match(/(\d+)동(\d+)호/);
    if (!match) return null;
    return `${match[1]}-${match[2]}`;
  };

  const residentDongHo = parseDongHo(residentUnit);
  const filtered = reservations.filter((item) => {
    const samePhone = normalizePhone(item.phone) === residentPhone;
    if (!samePhone) return false;

    const normalizedAddress = item.address.replaceAll(/\s/g, "");
    const normalizedItemApartment = (item.apartmentName ?? "").trim().replaceAll(/\s/g, "");
    const normalizedItemName = item.name.trim().replaceAll(/\s/g, "");
    const itemDongHo = parseDongHo(item.address);

    const sameUnit =
      (normalizedResidentUnit && normalizedAddress.includes(normalizedResidentUnit)) ||
      (residentDongHo && itemDongHo ? residentDongHo === itemDongHo : false);
    const sameApartment =
      !normalizedResidentApartment || (normalizedItemApartment && normalizedItemApartment.includes(normalizedResidentApartment));
    const sameName = normalizedItemName === normalizedResidentName;

    // 전화번호를 기본 식별자로 사용하고, 주소/아파트/이름 중 하나라도 맞으면 본인 예약으로 판단.
    return sameUnit || sameApartment || sameName;
  });
  return NextResponse.json({ reservations: filtered });
}

export async function POST(request: Request) {
  let body: {
    apartmentId?: string;
    apartmentName?: string;
    apartmentCode?: string;
    name?: string;
    phone?: string;
    address?: string;
    serviceType?: string;
    preferredDate?: string;
    preferredTime?: string;
    detail?: string;
    baseFee?: number;
  };
  let imageUrls: string[] = [];

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const baseFeeRaw = formData.get("baseFee");
    body = {
      name: String(formData.get("name") ?? ""),
      apartmentId: String(formData.get("apartmentId") ?? ""),
      apartmentName: String(formData.get("apartmentName") ?? ""),
      apartmentCode: String(formData.get("apartmentCode") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      serviceType: String(formData.get("serviceType") ?? ""),
      preferredDate: String(formData.get("preferredDate") ?? ""),
      preferredTime: String(formData.get("preferredTime") ?? ""),
      detail: String(formData.get("detail") ?? ""),
      baseFee: baseFeeRaw != null ? Number(baseFeeRaw) : undefined
    };
    const files = formData
      .getAll("photos")
      .filter((item): item is File => item instanceof File && item.size > 0 && item.type.startsWith("image/"))
      .slice(0, 5);
    imageUrls = await saveImageFiles(files, "reservations");
  } else {
    body = (await request.json()) as typeof body;
  }

  const error = validateReservationInput(body);
  if (error) {
    return NextResponse.json({ message: error }, { status: 400 });
  }

  const normalizedName = (body.name?.trim() || "비로그인 사용자").slice(0, 20);
  const normalizedPhone = normalizePhone(body.phone?.trim() || "01000000000");
  const normalizedAddress = (body.address?.trim() || `${body.apartmentName?.trim() || "아파트"} 방문 요청`).slice(0, 120);
  const normalizedDetail = (body.detail?.trim() || `${body.serviceType?.trim() || "점검"} 아이콘 접수`).slice(0, 500);

  const hasConflict = await hasReservationTimeConflict(body.preferredDate!.trim(), body.preferredTime!.trim());
  if (hasConflict) {
    return NextResponse.json({ message: "선택하신 방문 요청시간은 이미 예약되어 있습니다. 다른 시간을 선택해주세요." }, { status: 409 });
  }

  const paymentSettings = await readPaymentSettings();
  // 요청 유형(긴급/간단교체 등)에 따라 클라이언트가 실제 청구액을 함께 보내면 그 값을 쓰고,
  // 없으면(레거시 호출부) 일반 출장비로 대체한다 — orders.base_fee와 항상 같은 값을 쓰기 위함.
  const requestedBaseFee = Number.isFinite(body.baseFee) ? Math.round(Number(body.baseFee)) : NaN;
  const baseFee = Number.isFinite(requestedBaseFee) && requestedBaseFee >= 10000 ? requestedBaseFee : paymentSettings.baseDispatchFee;
  const created = await createReservation({
    name: normalizedName,
    apartmentId: body.apartmentId?.trim() || undefined,
    apartmentName: body.apartmentName?.trim() || undefined,
    apartmentCode: body.apartmentCode?.trim() || undefined,
    phone: normalizedPhone,
    address: normalizedAddress,
    serviceType: body.serviceType!.trim(),
    preferredDate: body.preferredDate!,
    preferredTime: body.preferredTime!,
    detail: normalizedDetail,
    imageUrls,
    priority: "normal",
    baseFee
  });

  await appendActivityLog({
    action: "reservation_created",
    reservationId: created.id,
    message: `${created.name} 고객 예약이 입금대기 상태로 접수되었습니다.`
  });
  await pushReservationProgressNotifications({
    reservationId: created.id,
    customerName: created.name,
    customerPhone: created.phone,
    adminMessage: `${created.name}님의 예약이 접수 대기 상태로 생성되었습니다.`,
    residentMessage: `${created.name}님 예약이 접수되었습니다. 결제 완료 후 기사 배정이 시작됩니다.`
  });
  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://dkansim.com").replace(/\/$/, "");
    await sendAdminAlertSms(
      `[새 예약] ${created.name}님 · ${created.apartmentName ?? created.address} · ${created.serviceType}\n${created.preferredDate} ${created.preferredTime}\n${appUrl}/admin/reservations?id=${created.id}`
    );
  } catch (err) {
    await appendActivityLog({
      action: "reservation_created",
      reservationId: created.id,
      message: `관리자 SMS 알림 발송 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`
    });
  }

  return NextResponse.json({ message: "접수되었습니다. 입금 확인 후 연락드립니다.", reservation: created }, { status: 201 });
}
