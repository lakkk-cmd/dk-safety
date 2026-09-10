import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { deleteUnitInspectionPdfFiles } from "@/lib/unit-inspection-pdf-storage";
import {
  pgAdminDeleteUnitInspection,
  pgAdminUpdateUnitInspection,
  pgGetUnitInspection,
  pgGetUnitInspectionPdfCorrectionRecord
} from "@/lib/unit-inspections";

/**
 * 관리자 전용 삭제 — 2026-09-10 이전에는 시연전용단지(demo)에 한해서만 허용됐지만, 대표님이
 * "법정 보존의무보다 우선하여 관리자인 나만 유일하게 수정·삭제할 수 있게" 결정해 실고객 단지
 * 점검기록도 삭제 가능해졌다. 실제 우회는 `admin_delete_unit_inspection` RPC(125 마이그레이션)가
 * 하고, 그 안에서 삭제 전 스냅샷을 unit_inspection_admin_audit_log에 자동 기록한다 — 이 라우트는
 * 관리자 인증 확인 + PDF 파일(Storage) 정리만 담당한다.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const inspection = await pgGetUnitInspection(id);
    if (!inspection) {
      return NextResponse.json({ message: "점검 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const correction = await pgGetUnitInspectionPdfCorrectionRecord(id);
    await pgAdminDeleteUnitInspection(id);
    await deleteUnitInspectionPdfFiles({ pdfUrl: inspection.pdfUrl, pdfPrivatePath: inspection.pdfPrivatePath, correction });

    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "삭제에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/**
 * 관리자 전용 수정(2026-09-10 신설) — 세대주/연락처/동·호만 수정 가능(체크리스트·실측값·AI진단
 * 등 판정에 관계된 필드는 이 경로로 손댈 수 없다, 법정서식 판정 내용까지 바꾸는 건 범위 밖).
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const body = (await request.json()) as {
      residentName?: string | null;
      residentPhone?: string | null;
      dong?: string;
      ho?: string;
    };

    const existing = await pgGetUnitInspection(id);
    if (!existing) {
      return NextResponse.json({ message: "점검 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const dong = typeof body.dong === "string" ? body.dong.trim() : existing.dong;
    const ho = typeof body.ho === "string" ? body.ho.trim() : existing.ho;
    if (!dong || !ho) {
      return NextResponse.json({ message: "동/호는 비워둘 수 없습니다." }, { status: 400 });
    }
    const residentName =
      body.residentName === undefined ? existing.residentName : body.residentName?.trim() || null;
    const residentPhone =
      body.residentPhone === undefined ? existing.residentPhone : body.residentPhone?.trim() || null;

    const updated = await pgAdminUpdateUnitInspection(id, { residentName, residentPhone, dong, ho });
    return NextResponse.json({ inspection: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수정에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
