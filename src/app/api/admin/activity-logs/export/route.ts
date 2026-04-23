import { NextResponse } from "next/server";
import { readActivityLogs } from "@/lib/activity-log";

function escapeCsv(value: string) {
  return `"${value.replaceAll(`"`, `""`)}"`;
}

export async function GET() {
  const logs = await readActivityLogs(500);
  const header = ["유형", "예약ID", "메시지", "발생시각"];
  const rows = logs.map((log) =>
    [log.action, log.reservationId, log.message, log.createdAt].map((value) => escapeCsv(value)).join(",")
  );
  const csv = [header.map((value) => escapeCsv(value)).join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="activity-logs.csv"'
    }
  });
}
