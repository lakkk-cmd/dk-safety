import { NextResponse } from "next/server";
import { readReservations } from "@/lib/reservations-store";

function escapeCsvValue(value: string) {
  return `"${value.replaceAll(`"`, `""`)}"`;
}

export async function GET() {
  const items = await readReservations();
  const header = [
    "고객명",
    "연락처",
    "주소",
    "우선순위",
    "서비스",
    "희망일",
    "요청시간",
    "상태",
    "배정기사",
    "작업상태",
    "입금상태",
    "출장비",
    "추가비",
    "총금액",
    "요청사항",
    "접수첨부이미지URL",
    "관리메모",
    "메모수정일",
    "접수일"
  ];
  const rows = items.map((item) =>
    [
      item.name,
      item.phone,
      item.address,
      item.priority === "emergency" ? "긴급출동" : "일반",
      item.serviceType,
      item.preferredDate,
      item.preferredTime ?? "",
      item.status,
      item.assignedWorkerName ?? "",
      item.taskStatus ?? "",
      item.isPaid ? "입금완료" : "미입금",
      String(item.baseFee),
      String(item.extraFee),
      String(item.totalAmount),
      item.detail,
      item.imageUrls.join(" | "),
      item.note,
      item.noteUpdatedAt ?? "",
      item.createdAt
    ]
      .map((v) => escapeCsvValue(v))
      .join(",")
  );

  const csv = [header.map((v) => escapeCsvValue(v)).join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="reservations.csv"'
    }
  });
}
