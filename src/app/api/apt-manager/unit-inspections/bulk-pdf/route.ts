/**
 * 전기과장 본인 단지의 점검완료(pdf_url 존재) 세대전기점검표를 zip으로 묶어 다운로드한다.
 * 관리자용 bulk-pdf(/api/admin/unit-inspections/bulk-pdf)와 동일 로직이지만, apartmentId를
 * 클라이언트에서 안 받고 세션의 단지로 고정한다(다른 apt-manager 라우트와 동일한 스코프 원칙).
 *
 * 114부터 개별 다운로드와 같은 구독/무료한도 게이트를 항목마다 통과시킨다 — 구독중이면 전부,
 * 무료 티어면 이미 언락된 건 + 남은 한도까지만 zip에 담고 나머지 개수를 헤더로 알려준다.
 */
import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { pgCheckAndConsumePdfQuotaBulk } from "@/lib/apartment-subscriptions-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { readPrivatePdfBytes, resolveUnitInspectionPrivatePdfPath } from "@/lib/unit-inspection-pdf-storage";
import {
  pgListUnitInspectionPdfCorrectionRecords,
  pgListUnitInspectionsForApartment
} from "@/lib/unit-inspections";

export const maxDuration = 120;

async function requireScopedManager() {
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) return null;
  const manager = await pgGetApartmentManager(managerId);
  if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) return null;
  return { managerId: manager.id, apartmentId: manager.apartmentId };
}

export async function GET(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const scope = await requireScopedManager();
  if (!scope) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dongFilter = url.searchParams.get("dong")?.trim();

  try {
    const all = await pgListUnitInspectionsForApartment(scope.apartmentId);
    const scoped = dongFilter ? all.filter((i) => i.dong === dongFilter) : all;
    const completed = scoped.filter((i) => i.pdfUrl);

    // 동/호별 최신 건만 남긴다 (inspectedAt 내림차순으로 이미 정렬되어 오므로 처음 만난 것을 유지)
    const latestByUnit = new Map<string, (typeof completed)[number]>();
    for (const item of completed) {
      const key = `${item.dong}-${item.ho}`;
      if (!latestByUnit.has(key)) latestByUnit.set(key, item);
    }
    const targets = Array.from(latestByUnit.values());

    if (targets.length === 0) {
      return NextResponse.json({ message: "다운로드할 발급 완료 점검기록표가 없습니다." }, { status: 404 });
    }

    const { allowedIds, skippedCount: skipped } = await pgCheckAndConsumePdfQuotaBulk(
      scope.apartmentId,
      targets.map((item) => item.id),
      scope.managerId
    );
    const allowedIdSet = new Set(allowedIds);
    const allowed = targets.filter((item) => allowedIdSet.has(item.id));

    if (allowed.length === 0) {
      return NextResponse.json(
        { message: "이번 주기 무료 다운로드 5건을 모두 사용했습니다. 구독하시면 무제한으로 받으실 수 있어요." },
        { status: 402 }
      );
    }

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const corrections = await pgListUnitInspectionPdfCorrectionRecords();

    const results = await Promise.allSettled(
      allowed.map(async (item) => {
        const privatePath = await resolveUnitInspectionPrivatePdfPath(item, corrections[item.id] ?? null);
        if (!privatePath) throw new Error(`${item.dong}-${item.ho} PDF 사본을 찾을 수 없음`);
        const buf = await readPrivatePdfBytes(privatePath);
        const dateKey = new Date(item.inspectedAt).toISOString().slice(0, 10);
        zip.file(`${item.dong}동_${item.ho}호_${dateKey}.pdf`, buf);
      })
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.warn(`[apt-manager/bulk-pdf] ${failed.length}건 PDF 수집 실패`, failed);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const filenameSafeDong = dongFilter ? `_${dongFilter}동` : "";
    const fileName = `세대전기점검표${filenameSafeDong}_${new Date().toISOString().slice(0, 10)}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        // 응답 본문이 zip이라 JSON 안내를 실을 수 없어, 제외된 건수는 헤더로 알린다.
        "X-Skipped-Count": String(skipped)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "일괄 다운로드에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
