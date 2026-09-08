/**
 * 전기과장용 점검표 PDF 다운로드 게이트(114). 공개 pdf_url을 그대로 노출하는 대신 비공개 버킷
 * 사본의 단기 서명 URL을 내주고, 그 앞에 구독/무료한도 검사를 건다.
 * 거주민 공개 결과페이지(/unit-inspection/[id])와 그 pdf_url은 이 게이트와 무관하게 그대로 무료다.
 */
import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { pgCheckAndConsumePdfQuota } from "@/lib/apartment-subscriptions-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { createUnitInspectionPdfSignedUrl, resolveUnitInspectionPrivatePdfPath } from "@/lib/unit-inspection-pdf-storage";
import { pgGetUnitInspection, pgListUnitInspectionsForApartment } from "@/lib/unit-inspections";
import { pickRepresentativeInspection, representativeYearGroupIds } from "@/lib/unit-inspection-representative";

export const maxDuration = 60;

async function requireScopedManager() {
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) return null;
  const manager = await pgGetApartmentManager(managerId);
  if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) return null;
  return { managerId: manager.id, apartmentId: manager.apartmentId };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const scope = await requireScopedManager();
  if (!scope) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const inspection = await pgGetUnitInspection(id);
    // 다른 단지 건은 존재 자체를 알리지 않는다 — 세션의 apartmentId만 신뢰한다.
    if (!inspection || inspection.apartmentId !== scope.apartmentId) {
      return NextResponse.json({ message: "점검 기록을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!inspection.pdfUrl) {
      return NextResponse.json({ message: "PDF가 아직 발급되지 않았습니다." }, { status: 404 });
    }

    // 세대방문점검 우선순위 정책(2026-09-08): 같은 세대·같은 해에 방문점검이 있으면 그게 항상
    // 대표기록이고, 전기과장은 대표기록만 다운로드할 수 있다 — 밀려난 간이점검은 화면에서 대표
    // 기록으로 안내되므로(apt-manager-inspection-history.tsx) 이 요청은 정상 흐름에서는 오지
    // 않지만, 방어적으로 서버에서도 막는다.
    const unitRecords = (await pgListUnitInspectionsForApartment(scope.apartmentId)).filter(
      (r) => r.dong === inspection.dong && r.ho === inspection.ho
    );
    const representative = pickRepresentativeInspection(unitRecords);
    if (representative.id !== inspection.id) {
      return NextResponse.json(
        {
          message: "이후 세대방문점검이 진행되어 이 기록은 더 이상 대표기록이 아닙니다. 최신 방문점검 기록을 다운로드해주세요.",
          representativeId: representative.id
        },
        { status: 409 }
      );
    }
    const groupInspectionIds = representativeYearGroupIds(unitRecords);

    const decision = await pgCheckAndConsumePdfQuota(scope.apartmentId, inspection.id, scope.managerId, groupInspectionIds);
    if (!decision.allowed) {
      return NextResponse.json(
        {
          message: "이번 주기 무료 다운로드 5건을 모두 사용했습니다. 구독하시면 무제한으로 받으실 수 있어요.",
          remainingFree: decision.remainingFree,
          cycleResetAt: decision.cycleResetAt
        },
        { status: 402 }
      );
    }

    const privatePath = await resolveUnitInspectionPrivatePdfPath(inspection);
    if (!privatePath) {
      return NextResponse.json({ message: "PDF 파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const url = await createUnitInspectionPdfSignedUrl(privatePath);
    return NextResponse.json({ url, remainingFree: decision.remainingFree, cycleResetAt: decision.cycleResetAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "다운로드에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
