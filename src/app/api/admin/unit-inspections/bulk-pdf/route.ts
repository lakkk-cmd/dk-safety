/**
 * 단지(선택: 동)별 점검완료(pdf_url 존재) 세대전기점검표를 zip 하나로 묶어 다운로드한다.
 * 같은 세대(동/호)를 재점검한 기록이 여러 건 있으면 최신 건 1개만 포함한다 — 하자보수 후
 * 재확인 등으로 중복이 쌓여도 zip에는 최신 상태만 담기게 한다.
 *
 * 대단지(수백 세대)는 zip이 수십MB까지 커질 수 있어 Vercel 서버리스 응답 한도에 걸릴 수
 * 있다 — 그래서 dong 쿼리파라미터로 동 단위 분할 다운로드를 지원한다.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pgListUnitInspectionsForApartment } from "@/lib/unit-inspections";

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  const url = new URL(request.url);
  const apartmentId = url.searchParams.get("apartmentId")?.trim();
  const dongFilter = url.searchParams.get("dong")?.trim();
  if (!apartmentId) {
    return NextResponse.json({ message: "apartmentId가 필요합니다." }, { status: 400 });
  }

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
      console.warn(`[bulk-pdf] ${failed.length}건 PDF 수집 실패`, failed);
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
