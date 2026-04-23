import { NextResponse } from "next/server";
import { previewBackupSnapshot, restoreBackupSnapshot } from "@/lib/reservations-store";
import { appendActivityLog } from "@/lib/activity-log";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName")?.trim() ?? "";
  if (!fileName) {
    return NextResponse.json({ message: "미리볼 백업 파일을 선택해주세요." }, { status: 400 });
  }

  try {
    const preview = await previewBackupSnapshot(fileName);
    return NextResponse.json({ preview });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "백업 미리보기 중 오류가 발생했습니다." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json()) as { fileName?: string; checkpointReason?: string };
  const fileName = body.fileName?.trim() ?? "";
  const checkpointReason = body.checkpointReason?.trim() ?? "";
  if (checkpointReason.length > 80) {
    return NextResponse.json({ message: "체크포인트 라벨은 80자 이하로 입력해주세요." }, { status: 400 });
  }
  if (!fileName) {
    return NextResponse.json({ message: "복원할 백업 파일을 선택해주세요." }, { status: 400 });
  }

  try {
    const restored = await restoreBackupSnapshot(fileName, checkpointReason);
    await appendActivityLog({
      action: "backup_restored",
      reservationId: "system",
      message: `백업 파일(${fileName})로 예약 데이터가 복원되었습니다. (체크포인트: ${restored.checkpointFileName})`
    });
    return NextResponse.json({
      message: "백업 복원이 완료되었습니다.",
      count: restored.reservations.length,
      checkpointFileName: restored.checkpointFileName,
      diff: restored.diff
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "백업 복원 중 오류가 발생했습니다." },
      { status: 400 }
    );
  }
}
