import { NextResponse } from "next/server";
import { createReservation, hasReservationTimeConflict, readReservations } from "@/lib/reservations-store";
import { normalizePhone, validateReservationInput } from "@/lib/reservation-validation";
import { appendActivityLog } from "@/lib/activity-log";
import { saveImageFiles } from "@/lib/upload-store";

export async function GET() {
  const reservations = await readReservations();
  return NextResponse.json({ reservations });
}

export async function POST(request: Request) {
  let body: {
    name?: string;
    phone?: string;
    address?: string;
    serviceType?: string;
    preferredDate?: string;
    preferredTime?: string;
    detail?: string;
  };
  let imageUrls: string[] = [];

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      serviceType: String(formData.get("serviceType") ?? ""),
      preferredDate: String(formData.get("preferredDate") ?? ""),
      preferredTime: String(formData.get("preferredTime") ?? ""),
      detail: String(formData.get("detail") ?? "")
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

  const hasConflict = await hasReservationTimeConflict(body.preferredDate!.trim(), body.preferredTime!.trim());
  if (hasConflict) {
    return NextResponse.json({ message: "선택하신 방문 요청시간은 이미 예약되어 있습니다. 다른 시간을 선택해주세요." }, { status: 409 });
  }

  const created = await createReservation({
    name: body.name!.trim(),
    phone: normalizePhone(body.phone!),
    address: body.address!.trim(),
    serviceType: body.serviceType!.trim(),
    preferredDate: body.preferredDate!,
    preferredTime: body.preferredTime!,
    detail: body.detail!.trim(),
    imageUrls,
    priority: "normal"
  });

  await appendActivityLog({
    action: "reservation_created",
    reservationId: created.id,
    message: `${created.name} 고객 예약이 접수되었습니다.`
  });

  return NextResponse.json({ message: "예약이 등록되었습니다.", reservation: created }, { status: 201 });
}
