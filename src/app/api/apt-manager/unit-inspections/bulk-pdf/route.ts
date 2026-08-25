/**
 * 전기과장 본인 단지의 점검완료(pdf_url 존재) 세대전기점검표를 zip으로 묶어 다운로드한다.
 * 관리자용 bulk-pdf(/api/admin/unit-inspections/bulk-pdf)와 동일 로직이지만, apartmentId를
 * 클라이언트에서 안 받고 세션의 단지로 고정한다(다른 apt-manager 라우트와 동일한 스코프 원칙).
 */
import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pgListUnitInspectionsForApartment } from "@/lib/unit-inspections";

export const maxDuration = 120;

async function requireScopedApartmentId(): Promise<string | null> {
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) return null;
  const manager = await pgGetApartmentManager(managerId);
  if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) return null;
  return manager.apartmentId;
}

export async function GET(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const apartmentId = await requireScopedApartmentId();
  if (!apartmentId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dongFilter = url.searchParams.get("dong")?.trim();

  try {
    const all = await pgListUnitInspectionsForApartment(apartmentId);
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

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    const results = await Promise.allSettled(
      targets.map(async (item) => {
        const res = await fetch(item.pdfUrl!);
        if (!res.ok) throw new Error(`${item.dong}-${item.ho} PDF 다운로드 실패(${res.status})`);
        const buf = await res.arrayBuffer();
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
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "일괄 다운로드에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
