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
import { pgListUnitInspectionsForApartment, type UnitInspection } from "@/lib/unit-inspections";
import { pickRepresentativeInspection } from "@/lib/unit-inspection-representative";

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

    // 세대방문점검 우선순위 정책(2026-09-08): 동/호별로 "지금 시점의 대표기록"만 zip에 담는다.
    // (예전엔 그냥 최신 건 1개였는데, 같은 해에 방문점검보다 나중에 간이점검이 들어오면 그게
    // 잘못 최신으로 뽑혔다.) 판정은 전체 이력 기준, 대표기록에 PDF가 없으면 그 세대는 건너뛴다.
    const byUnit = new Map<string, UnitInspection[]>();
    for (const item of scoped) {
      const key = `${item.dong}-${item.ho}`;
      const list = byUnit.get(key);
      if (list) list.push(item);
      else byUnit.set(key, [item]);
    }
    const targets: UnitInspection[] = [];
    for (const records of byUnit.values()) {
      const representative = pickRepresentativeInspection(records);
      if (representative.pdfUrl) targets.push(representative);
    }

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
