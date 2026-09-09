import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgDeleteApartment, pgUpdateApartment } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    code?: string;
    logoUrl?: string;
    bankInfo?: { bankName?: string; accountNumber?: string; accountHolder?: string };
    baseFee?: number;
    district?: string;
    address?: string;
    electricalSafetyManagerName?: string;
    totalUnits?: number | null;
    partnershipType?: string;
  };
  // free_app/demo는 각각 전기과장 가입승인·시연단지 전용 플로우가 관리하는 상태라, 이 일반 수정
  // 폼에서는 "계약미정 ↔ 정식계약" 전환만 허용한다(123).
  if (body.partnershipType !== undefined && body.partnershipType !== "contract" && body.partnershipType !== "unconfirmed") {
    return NextResponse.json({ message: "이 화면에서는 정식계약/계약미정 상태만 변경할 수 있습니다." }, { status: 400 });
  }
  try {
    const apartment = await pgUpdateApartment(id, {
      name: body.name,
      code: body.code,
      logoUrl: body.logoUrl,
      bankInfo: body.bankInfo
        ? {
            bankName: body.bankInfo.bankName?.trim() || "국민은행",
            accountNumber: body.bankInfo.accountNumber?.trim() || "",
            accountHolder: body.bankInfo.accountHolder?.trim() || ""
          }
        : undefined,
      baseFee: body.baseFee,
      district: body.district,
      address: body.address,
      electricalSafetyManagerName: body.electricalSafetyManagerName,
      totalUnits: body.totalUnits,
      partnershipType: body.partnershipType as "contract" | "unconfirmed" | undefined
    });
    if (!apartment) return NextResponse.json({ message: "수정할 항목이 없습니다." }, { status: 400 });
    return NextResponse.json({ apartment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "아파트 수정에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    await pgDeleteApartment(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "아파트 삭제에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
