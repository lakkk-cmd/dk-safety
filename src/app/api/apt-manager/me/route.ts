import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET() {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const manager = await pgGetApartmentManager(managerId);
    if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    const apartment = await pgFindApartmentByIdentifier(manager.apartmentId);
    return NextResponse.json({
      manager: { id: manager.id, name: manager.name },
      apartment: apartment ? { id: apartment.id, name: apartment.name, totalUnits: apartment.totalUnits } : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
