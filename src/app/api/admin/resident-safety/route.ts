import { NextResponse } from "next/server";
import { getResidentSafetyAnalytics } from "@/lib/resident-db";

export async function GET() {
  const analytics = await getResidentSafetyAnalytics();
  return NextResponse.json({ analytics });
}
