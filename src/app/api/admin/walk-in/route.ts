import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pgCreateWalkInReservation, pgReadWalkInReservations } from "@/lib/reservations-pg";
import { saveImageFiles } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });
  }
  const reservations = await pgReadWalkInReservations();
  return NextResponse.json({ reservations });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let name: string, phone: string, address: string, serviceType: string;
  let workDate: string, workTime: string, detail: string, totalAmount: number;
  let imageUrls: string[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    name = String(form.get("name") ?? "").trim();
    phone = String(form.get("phone") ?? "").trim();
    address = String(form.get("address") ?? "").trim();
    serviceType = String(form.get("serviceType") ?? "").trim();
    workDate = String(form.get("workDate") ?? "").trim();
    workTime = String(form.get("workTime") ?? "").trim();
    detail = String(form.get("detail") ?? "").trim();
    totalAmount = Number(form.get("totalAmount") ?? 0);

    const photos = form.getAll("photos") as File[];
    const validPhotos = photos.filter((f): f is File => f instanceof File && f.size > 0);
    if (validPhotos.length > 0) {
      imageUrls = await saveImageFiles(validPhotos, "field-reports");
    }
  } else {
    const body = (await request.json()) as Record<string, unknown>;
    name = String(body.name ?? "").trim();
    phone = String(body.phone ?? "").trim();
    address = String(body.address ?? "").trim();
    serviceType = String(body.serviceType ?? "").trim();
    workDate = String(body.workDate ?? "").trim();
    workTime = String(body.workTime ?? "").trim();
    detail = String(body.detail ?? "").trim();
    totalAmount = Number(body.totalAmount ?? 0);
    if (Array.isArray(body.imageUrls)) {
      imageUrls = (body.imageUrls as unknown[]).filter((v): v is string => typeof v === "string");
    }
  }

  if (!name || !phone || !address || !serviceType || !workDate) {
    return NextResponse.json({ error: "필수 항목 누락 (고객명, 연락처, 주소, 작업종류, 작업일)" }, { status: 400 });
  }

  const reservation = await pgCreateWalkInReservation({
    name, phone, address, serviceType, workDate, workTime: workTime || "00:00", detail, imageUrls, totalAmount
  });

  return NextResponse.json({ reservation }, { status: 201 });
}
