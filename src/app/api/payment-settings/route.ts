import { NextResponse } from "next/server";
import { readPaymentSettings } from "@/lib/payment-settings";

export async function GET() {
  const settings = await readPaymentSettings();
  return NextResponse.json({ settings });
}

