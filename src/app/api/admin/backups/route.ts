import { NextResponse } from "next/server";
import { createManualBackup, listBackupSnapshots, readBackupStatus } from "@/lib/reservations-store";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const [status, snapshots] = await Promise.all([readBackupStatus(), listBackupSnapshots(30)]);
  return NextResponse.json({ status, snapshots });
}

export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const snapshot = await createManualBackup();
  return NextResponse.json({ message: "수동 백업이 생성되었습니다.", snapshot }, { status: 201 });
}
