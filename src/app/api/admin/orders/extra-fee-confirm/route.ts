import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { calculate_final_fee, type ServiceItem } from "@/lib/daekyung-fee-logic";
import { pgFindOrderByReservationId, pgIssueWarrantyAndSettle } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady, requireSupabaseAdmin } from "@/lib/supabase-pg";
import { pushReservationProgressNotifications } from "@/lib/live-notify";

type ServiceItemRow = {
  id: string;
  service_type: string;
  name: string;
  min_fee: number | null;
  max_fee: number | null;
  unit_price: number | null;
  surcharge_flag: boolean | null;
  bulk_discount_flag: boolean | null;
  bulk_threshold: number | null;
  bulk_discount_rate: number | null;
  deductible_flag: boolean | null;
  negotiation_flag: boolean | null;
  required_cert?: string | null;
};

function mapServiceTypeToPatentKey(serviceType: string): string {
  const value = serviceType.trim();
  if (value.includes("누전")) return "LEAKAGE";
  if (value.includes("정기") || value.includes("진단")) return "DIAGNOSIS";
  if (value.includes("콘센트") || value.includes("스위치")) return "OUTLET";
  if (value.includes("전등")) return "LIGHT";
  return "VISIT";
}

function mapServiceItem(row: ServiceItemRow): ServiceItem {
  return {
    id: row.id,
    service_type: row.service_type,
    name: row.name,
    min_fee: Number.isFinite(row.min_fee) ? Number(row.min_fee) : 0,
    max_fee: Number.isFinite(row.max_fee) ? Number(row.max_fee) : 0,
    unit_price: Number.isFinite(row.unit_price) ? Number(row.unit_price) : undefined,
    surcharge_flag: Boolean(row.surcharge_flag),
    bulk_discount_flag: Boolean(row.bulk_discount_flag),
    bulk_threshold: Number.isFinite(row.bulk_threshold) ? Number(row.bulk_threshold) : 5,
    bulk_discount_rate: Number.isFinite(row.bulk_discount_rate) ? Number(row.bulk_discount_rate) : 0,
    deductible_flag: Boolean(row.deductible_flag),
    negotiation_flag: Boolean(row.negotiation_flag)
  };
}

async function findApplicableServiceItem(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  params: { apartmentId?: string | null; serviceType: string }
): Promise<ServiceItem | null> {
  const patentType = mapServiceTypeToPatentKey(params.serviceType);
  const apartmentId = params.apartmentId ?? null;
  const { data, error } = await supabase
    .from("service_items")
    .select(
      "id, service_type, name, min_fee, max_fee, unit_price, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, deductible_flag, negotiation_flag, apt_id, display_order"
    )
    .eq("service_type", patentType)
    .or(apartmentId ? `apt_id.eq.${apartmentId},apt_id.is.null` : "apt_id.is.null")
    .order("apt_id", { ascending: false })
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`서비스 항목 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapServiceItem(data as unknown as ServiceItemRow);
}

async function resolveServiceItemForReservation(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  row: {
    apartment_id: string | null;
    service_item_id: string | null;
    service_type: string | null;
  }
): Promise<ServiceItem> {
  if (row.service_item_id) {
    const { data: itemById, error: itemByIdErr } = await supabase
      .from("service_items")
      .select(
        "id, service_type, name, min_fee, max_fee, unit_price, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, deductible_flag, negotiation_flag"
      )
      .eq("id", row.service_item_id)
      .maybeSingle();
    if (itemByIdErr) {
      throw new Error(`서비스 항목 조회 실패: ${itemByIdErr.message}`);
    }
    if (itemById) {
      return mapServiceItem(itemById as unknown as ServiceItemRow);
    }
  }
  const found = await findApplicableServiceItem(supabase, {
    apartmentId: row.apartment_id,
    serviceType: row.service_type ?? "VISIT"
  });
  if (found) return found;
  return {
    id: "fallback",
    service_type: "VISIT",
    name: "기본 출장비",
    min_fee: 50000,
    max_fee: 50000,
    surcharge_flag: false,
    bulk_discount_flag: false,
    bulk_threshold: 5,
    bulk_discount_rate: 0,
    deductible_flag: true,
    negotiation_flag: false
  };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  let body: { reservationId?: string; extraFee?: number; note?: string } = {};
  try {
    body = (await request.json()) as { reservationId?: string; extraFee?: number; note?: string };
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const reservationId = body.reservationId?.trim() ?? "";
  const extraFeeRaw = body.extraFee;
  const extraFee = typeof extraFeeRaw === "number" && Number.isFinite(extraFeeRaw) ? Math.max(0, Math.round(extraFeeRaw)) : NaN;
  if (!reservationId) {
    return NextResponse.json({ message: "reservationId가 필요합니다." }, { status: 400 });
  }
  if (!Number.isFinite(extraFee)) {
    return NextResponse.json({ message: "extraFee(숫자)가 필요합니다." }, { status: 400 });
  }

  try {
    const supabase = requireSupabaseAdmin();
    const { data: reservation, error: resErr } = await supabase
      .from("reservations")
      .select(
        "id, name, phone, service_type, preferred_date, preferred_time, extra_fee_confirm_request_count, apartments(name, apt_code)"
      )
      .eq("id", reservationId)
      .maybeSingle();
    if (resErr || !reservation) {
      return NextResponse.json({ message: "예약을 찾지 못했습니다." }, { status: 404 });
    }

    const currentCount = Number.isFinite(Number(reservation.extra_fee_confirm_request_count))
      ? Number(reservation.extra_fee_confirm_request_count)
      : 0;
    if (currentCount >= 3) {
      return NextResponse.json({ message: "추가비용 확인 요청은 최대 3회까지 발송할 수 있습니다." }, { status: 400 });
    }

    const order = await pgFindOrderByReservationId(reservationId);
    if (!order) {
      return NextResponse.json({ message: "연결된 주문(order)을 찾지 못했습니다." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const nextCount = currentCount + 1;
    const note = body.note?.trim() ?? null;

    const { error: resUpdateErr } = await supabase
      .from("reservations")
      .update({
        extra_fee: extraFee,
        extra_fee_note: note,
        extra_fee_confirm_request_count: nextCount,
        extra_fee_confirm_requested_at: nowIso,
        status: "extra_fee_confirming",
        payment_status: "CONFIRMING",
        extra_fee_added_at: extraFee > 0 ? nowIso : null
      })
      .eq("id", reservationId);
    if (resUpdateErr) {
      return NextResponse.json({ message: resUpdateErr.message }, { status: 400 });
    }

    const { error: ordUpdateErr } = await supabase
      .from("orders")
      .update({
        extra_fee_confirm_request_count: nextCount,
        extra_fee_confirm_requested_at: nowIso,
        extra_fee_details: {
          extraFee,
          note,
          requestSeq: nextCount,
          requestedAt: nowIso
        },
        updated_at: nowIso
      })
      .eq("id", order.id);
    if (ordUpdateErr) {
      return NextResponse.json({ message: `주문 동기화 실패: ${ordUpdateErr.message}` }, { status: 500 });
    }

    const { error: logErr } = await supabase.from("extra_fee_confirm_logs").insert({
      order_id: order.id,
      reservation_id: reservationId,
      request_seq: nextCount,
      requested_at: nowIso,
      extra_fee: extraFee,
      note
    });
    if (logErr) {
      return NextResponse.json({ message: `확인 이력 저장 실패: ${logErr.message}` }, { status: 500 });
    }

    const apt = reservation.apartments as { name?: string; apt_code?: string } | { name?: string; apt_code?: string }[] | null;
    const aptOne = Array.isArray(apt) ? apt[0] : apt;
    const apartmentName = aptOne?.name?.trim() ?? "";

    try {
      await pushReservationProgressNotifications({
        reservationId,
        customerName: String(reservation.name ?? ""),
        customerPhone: String(reservation.phone ?? ""),
        adminMessage: `[추가비용 확인 ${nextCount}/3] ${apartmentName ? `${apartmentName} ` : ""}${reservation.service_type ?? ""} — 추가 ${extraFee.toLocaleString()}원 확인이 필요합니다.`,
        residentMessage: `현장 추가 비용 ${extraFee.toLocaleString()}원에 대한 확인 요청이 도착했습니다. (${nextCount}/3회) 서비스: ${reservation.service_type ?? ""}`
      });
    } catch (notifyErr) {
      return NextResponse.json(
        {
          message: notifyErr instanceof Error ? notifyErr.message : "알림 전송 실패",
          requestCount: nextCount
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "추가비용 확인 요청이 발송되었고 요청 횟수가 반영되었습니다.",
      reservationId,
      requestCount: nextCount,
      extraFee
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "추가비용 확인 요청 처리 실패" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  let body: { reservationId?: string; confirmedBy?: string } = {};
  try {
    body = (await request.json()) as { reservationId?: string; confirmedBy?: string };
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const reservationId = body.reservationId?.trim() ?? "";
  const confirmedByRaw = (body.confirmedBy ?? "").trim().toUpperCase();
  if (!reservationId) {
    return NextResponse.json({ message: "reservationId가 필요합니다." }, { status: 400 });
  }
  if (confirmedByRaw !== "ADMIN" && confirmedByRaw !== "USER") {
    return NextResponse.json({ message: "confirmedBy는 ADMIN 또는 USER 여야 합니다." }, { status: 400 });
  }

  try {
    const supabase = requireSupabaseAdmin();
    const { data: existingWarranty, error: wErr } = await supabase
      .from("warranties")
      .select("id")
      .eq("reservation_id", reservationId)
      .maybeSingle();
    if (wErr) {
      return NextResponse.json({ message: `보증서 조회 실패: ${wErr.message}` }, { status: 500 });
    }
    if (existingWarranty) {
      return NextResponse.json({ message: "이미 발급된 보증서가 있어 확인 완료 처리를 할 수 없습니다." }, { status: 409 });
    }

    const { data: reservation, error: resErr } = await supabase
      .from("reservations")
      .select(
        "id, name, phone, apartment_id, technician_id, service_item_id, service_type, detail, image_urls, base_fee, extra_fee, extra_fee_note, apartments(apt_code, name)"
      )
      .eq("id", reservationId)
      .maybeSingle();
    if (resErr || !reservation) {
      return NextResponse.json({ message: "예약을 찾지 못했습니다." }, { status: 404 });
    }
    if (!reservation.apartment_id) {
      return NextResponse.json({ message: "아파트 정보가 없어 정산·보증서를 처리할 수 없습니다." }, { status: 400 });
    }

    const aptJoin = reservation.apartments as { apt_code?: string; name?: string } | { apt_code?: string; name?: string }[] | null;
    const aptOne = Array.isArray(aptJoin) ? aptJoin[0] : aptJoin;
    const aptCode = String(aptOne?.apt_code ?? "").trim();
    if (!aptCode) {
      return NextResponse.json({ message: "단지 공개 코드(apt_code)가 비어 있습니다." }, { status: 400 });
    }

    const order = await pgFindOrderByReservationId(reservationId);
    if (!order) {
      return NextResponse.json({ message: "연결된 주문(order)을 찾지 못했습니다." }, { status: 404 });
    }

    const baseFee = Number.isFinite(Number(reservation.base_fee)) ? Number(reservation.base_fee) : 50000;
    const extraFee = Number.isFinite(Number(reservation.extra_fee)) ? Number(reservation.extra_fee) : 0;
    const serviceItem = await resolveServiceItemForReservation(supabase, {
      apartment_id: reservation.apartment_id,
      service_item_id: reservation.service_item_id,
      service_type: reservation.service_type
    });

    const calc = calculate_final_fee({
      base_fee: baseFee,
      extra_fee: extraFee,
      extra_fee_note: reservation.extra_fee_note ?? undefined,
      service_item: serviceItem,
      work_proceeded: true
    });
    if (!calc.validation.is_valid) {
      return NextResponse.json(
        { message: "정산 검증에 실패했습니다.", errors: calc.validation.errors },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const sitePhotos = asStringArray(reservation.image_urls);
    const phone = String(reservation.phone ?? "").trim();

    let result: { warrantyId: string; warrantyNumber: string; verifyUrl: string };
    try {
      result = await pgIssueWarrantyAndSettle({
        reservationId,
        orderId: order.id,
        apartmentId: reservation.apartment_id,
        technicianId: reservation.technician_id ?? null,
        serviceType: reservation.service_type ?? "VISIT",
        serviceSummary: `${reservation.detail ?? reservation.service_type ?? "현장 작업"} / ${calc.breakdown.join(" | ")}`,
        finalAmount: calc.total_fee,
        sitePhotos,
        reservationExtra: {
          status: "완료",
          extra_fee_confirmed: true,
          extra_fee_confirmed_at: nowIso,
          extra_fee_confirmed_by: confirmedByRaw
        },
        orderExtra: {
          extra_fee_confirmed: true,
          extra_fee_confirmed_at: nowIso,
          extra_fee_confirmed_by: confirmedByRaw,
          extra_fee_details: {
            breakdown: calc.breakdown,
            total_fee: calc.total_fee,
            confirmedBy: confirmedByRaw,
            confirmedAt: nowIso
          }
        },
        customer: phone ? { name: String(reservation.name ?? "").trim() || "고객", phone } : undefined,
        orderLogActor: `EXTRA_FEE_CONFIRM:${confirmedByRaw}`
      });
    } catch (issueError) {
      const message = issueError instanceof Error ? issueError.message : "보증서 발급 실패";
      return NextResponse.json({ message }, { status: message.includes("duplicate") ? 409 : 500 });
    }

    const { data: openLog, error: logSelErr } = await supabase
      .from("extra_fee_confirm_logs")
      .select("id")
      .eq("order_id", order.id)
      .is("confirmed_at", null)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (logSelErr) {
      return NextResponse.json({ message: `확인 이력 조회 실패: ${logSelErr.message}` }, { status: 500 });
    }
    if (openLog) {
      const { error: logUpdErr } = await supabase
        .from("extra_fee_confirm_logs")
        .update({
          confirmed_at: nowIso,
          confirmed_by: confirmedByRaw
        })
        .eq("id", openLog.id);
      if (logUpdErr) {
        return NextResponse.json({ message: `확인 이력 갱신 실패: ${logUpdErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: "추가비용 확인이 완료되어 정산·보증서가 반영되었습니다.",
      total_fee: calc.total_fee,
      breakdown: calc.breakdown,
      warrantyNumber: result.warrantyNumber,
      verifyUrl: result.verifyUrl
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "추가비용 확인 완료 처리 실패" },
      { status: 500 }
    );
  }
}
