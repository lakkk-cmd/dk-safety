import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgApproveApartmentManagerSignup, pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { pgUpdateApartment } from "@/lib/apartments-pg";
import { sendSMS } from "@/lib/solapi-agent";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

function toFiniteNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  // 승인 실존확인 전화 중에 절연저항/누설전류 기준값을 같이 확인해 받아온 경우(2026-08-25) —
  // 신규단지든 기존단지든, 아직 기준값이 없는 단지만 관리자 화면이 입력칸을 보여준다.
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const insulationResistanceThresholdMohm = toFiniteNumberOrUndefined(body.insulationResistanceThresholdMohm);
  const leakageCurrentThresholdMa = toFiniteNumberOrUndefined(body.leakageCurrentThresholdMa);
  // 신규단지 자기신고 세대수 재확인/수정(2026-08-28) — 구독 요금이 세대수 기준(≤300/>300)으로
  // 갈리므로, 실존확인 전화 중 확인한 실제 세대수로 덮어쓸 수 있게 한다. apartments 행 생성과
  // 동시에 반영해야 해서(생성 후 UPDATE가 아니라) pgApproveApartmentManagerSignup 호출 시 넘긴다.
  const totalUnits = toFiniteNumberOrUndefined(body.totalUnits);

  try {
    await pgApproveApartmentManagerSignup(id, totalUnits);
    const manager = await pgGetApartmentManager(id);

    if (manager?.apartmentId && (insulationResistanceThresholdMohm !== undefined || leakageCurrentThresholdMa !== undefined)) {
      await pgUpdateApartment(manager.apartmentId, {
        ...(insulationResistanceThresholdMohm !== undefined ? { insulationResistanceThresholdMohm } : {}),
        ...(leakageCurrentThresholdMa !== undefined ? { leakageCurrentThresholdMa } : {})
      });
    }

    let smsSent = false;
    if (manager) {
      try {
        await sendSMS(
          manager.phone,
          `[대경이엔피] 세대전기점검 앱 가입이 승인됐습니다. 등록하신 아이디로 지금 로그인하실 수 있어요. inspect.dkansim.com`
        );
        smsSent = true;
      } catch (error) {
        console.error("[admin/apartment-managers/approve] 승인 알림 SMS 발송 실패:", error);
      }
    }

    return NextResponse.json({ message: "승인되었습니다.", smsSent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "승인 처리에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
