import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { RESIDENT_AUTH_COOKIE } from "@/lib/site-config";
import { appendActivityLog } from "@/lib/activity-log";
import { createReservation } from "@/lib/reservations-store";
import { appendResidentActivity, getResidentBySessionId } from "@/lib/resident-db";
import { saveImageFiles } from "@/lib/upload-store";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(RESIDENT_AUTH_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const resident = await getResidentBySessionId(sessionId);
  if (!resident) {
    return NextResponse.json({ message: "세션이 만료되었습니다. 다시 로그인해주세요." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let body: { riskScore?: number | null; summary?: string } = {};
  let imageUrls: string[] = [];
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const riskRaw = String(formData.get("riskScore") ?? "");
    body = {
      riskScore: riskRaw ? Number(riskRaw) : null,
      summary: String(formData.get("summary") ?? "")
    };
    const files = formData
      .getAll("photos")
      .filter((item): item is File => item instanceof File && item.size > 0 && item.type.startsWith("image/"))
      .slice(0, 5);
    imageUrls = await saveImageFiles(files, "emergency");
  } else {
    body = (await request.json().catch(() => ({}))) as { riskScore?: number | null; summary?: string };
  }
  const today = new Date().toISOString().slice(0, 10);
  const scoreText =
    typeof body.riskScore === "number" && Number.isFinite(body.riskScore)
      ? `${Math.min(100, Math.round(body.riskScore))}/100점`
      : "미기재";
  const detailLines = [
    "입주민 긴급출동 요청",
    `위험지수(100점 만점): ${scoreText}`,
    `요청메모: ${body.summary?.trim() || "없음"}`
  ];

  const reservation = await createReservation({
    name: resident.name,
    phone: resident.phone,
    address: `${resident.apartmentName} ${resident.unitNumber}`,
    serviceType: "긴급출동",
    preferredDate: today,
    preferredTime: "즉시",
    detail: detailLines.join(" / "),
    imageUrls,
    priority: "emergency"
  });

  await appendActivityLog({
    action: "reservation_created",
    reservationId: reservation.id,
    message: `[긴급출동] ${resident.name} 입주민 긴급출동 요청 접수`
  });
  await appendResidentActivity({
    userId: resident.id,
    action: "emergency_requested",
    message: `${resident.name} 입주민 긴급출동 요청`
  });

  return NextResponse.json(
    {
      message: "긴급출동 요청이 접수되었습니다. 전기 주치의가 빠르게 연락드립니다.",
      reservation
    },
    { status: 201 }
  );
}
