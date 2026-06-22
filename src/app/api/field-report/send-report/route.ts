import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sendFieldReportNotification } from "@/lib/field-report-notification";
import { pgGetFieldReportForWorker, pgSaveFieldReportSendResult, type FieldReportSendResult } from "@/lib/field-reports";
import { pgGetReservationContact } from "@/lib/reservations-pg";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json()) as { fieldReportId?: string };
  const fieldReportId = body.fieldReportId?.trim();
  if (!fieldReportId) {
    return NextResponse.json({ message: "fieldReportId가 필요합니다." }, { status: 400 });
  }

  try {
    const report = await pgGetFieldReportForWorker(fieldReportId, session.workerId);
    if (!report) {
      return NextResponse.json({ message: "현장 점검 기록을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!report.pdfResidentUrl || !report.pdfLandlordUrl) {
      return NextResponse.json({ message: "PDF 먼저 생성하세요." }, { status: 400 });
    }

    const contact = await pgGetReservationContact(report.reservationId);
    if (!contact) {
      return NextResponse.json({ message: "예약 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const resident = await sendFieldReportNotification({
      phone: contact.phone,
      customerName: contact.name,
      apartmentAddress: report.apartmentAddress,
      riskLevel: report.riskLevel,
      reportUrl: report.pdfResidentUrl
    });

    const landlord = contact.landlordPhone
      ? await sendFieldReportNotification({
          phone: contact.landlordPhone,
          customerName: contact.name,
          apartmentAddress: report.apartmentAddress,
          riskLevel: report.riskLevel,
          reportUrl: report.pdfLandlordUrl
        })
      : null;

    const sendResult: FieldReportSendResult = { resident, landlord };
    const updated = await pgSaveFieldReportSendResult(fieldReportId, sendResult);

    return NextResponse.json({ sendResult: updated.sendResult, status: updated.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "발송에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
