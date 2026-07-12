import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readPaymentSettings, updatePaymentSettings } from "@/lib/payment-settings";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const settings = await readPaymentSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const body = (await request.json()) as {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
    baseDispatchFee?: number;
    baseDispatchFeeOffline?: number;
  };
  try {
    const settings = await updatePaymentSettings(body);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "설정 저장 실패" }, { status: 400 });
  }
}

