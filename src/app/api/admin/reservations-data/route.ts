import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readReservations } from "@/lib/reservations-store";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const reservations = await readReservations();
  return NextResponse.json({ reservations });
}
