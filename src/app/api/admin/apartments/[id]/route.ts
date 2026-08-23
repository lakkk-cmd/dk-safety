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
    insulationResistanceThresholdMohm?: number | null;
  };
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
      insulationResistanceThresholdMohm: body.insulationResistanceThresholdMohm
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
