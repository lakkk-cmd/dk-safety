import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pgFindApartmentByCode } from "@/lib/apartments-pg";

type ServiceItemRow = {
  id: string;
  service_type: string;
  name: string;
  min_fee: number | null;
  max_fee: number | null;
  display_order: number | null;
  apt_id: string | null;
  is_active: boolean;
};

export async function GET(_: Request, context: { params: Promise<{ code: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { code } = await context.params;
  const apartment = await pgFindApartmentByCode(code.trim().toLowerCase());
  if (!apartment) {
    return NextResponse.json({ message: "아파트를 찾을 수 없습니다." }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase 설정이 올바르지 않습니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("service_items")
    .select("id, service_type, name, min_fee, max_fee, display_order, apt_id, is_active")
    .eq("is_active", true)
    .or(`apt_id.eq.${apartment.id},apt_id.is.null`)
    .order("apt_id", { ascending: false })
    .order("display_order", { ascending: true });
  if (error) {
    return NextResponse.json({ message: `서비스 항목 조회 실패: ${error.message}` }, { status: 500 });
  }

  const items = (data as ServiceItemRow[] | null) ?? [];
  const deduped = new Map<string, ServiceItemRow>();
  for (const item of items) {
    if (!deduped.has(item.service_type)) deduped.set(item.service_type, item);
  }

  return NextResponse.json({
    apartment: {
      id: apartment.id,
      code: apartment.code,
      name: apartment.name,
      logoUrl: apartment.logoUrl,
      baseFee: apartment.baseFee
    },
    serviceItems: Array.from(deduped.values()).map((item) => ({
      id: item.id,
      serviceType: item.service_type,
      name: item.name,
      minFee: Number.isFinite(item.min_fee) ? Number(item.min_fee) : null,
      maxFee: Number.isFinite(item.max_fee) ? Number(item.max_fee) : null
    }))
  });
}
