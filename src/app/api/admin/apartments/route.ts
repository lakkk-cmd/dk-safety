import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgCreateApartment, pgListApartments } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const apartments = await pgListApartments();
  return NextResponse.json({ apartments });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const body = (await request.json()) as {
    name?: string;
    code?: string;
    logoUrl?: string;
    bankInfo?: { bankName?: string; accountNumber?: string; accountHolder?: string };
    baseFee?: number;
    district?: string;
    address?: string;
  };
  const name = body.name?.trim() ?? "";
  const code = body.code?.trim().toLowerCase() ?? "";
  if (!name || !code) {
    return NextResponse.json({ message: "name, code는 필수입니다." }, { status: 400 });
  }
  try {
    const apartment = await pgCreateApartment({
      name,
      code,
      logoUrl: body.logoUrl ?? "",
      bankInfo: {
        bankName: body.bankInfo?.bankName?.trim() || "국민은행",
        accountNumber: body.bankInfo?.accountNumber?.trim() || "",
        accountHolder: body.bankInfo?.accountHolder?.trim() || name
      },
      baseFee: typeof body.baseFee === "number" ? body.baseFee : 50000,
      district: body.district ?? "",
      address: body.address ?? ""
    });
    return NextResponse.json({ apartment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "아파트 생성에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
