import { NextResponse } from "next/server";
import { getResidentSafetyAnalytics } from "@/lib/resident-db";

function csvValue(value: string | number) {
  return `"${String(value).replaceAll(`"`, `""`)}"`;
}

export async function GET() {
  const { highRiskCases } = await getResidentSafetyAnalytics();
  const header = ["입주민명", "연락처", "아파트", "동호수", "위험지수(/100)", "요약", "진단시각"];
  const rows = highRiskCases.map((item) =>
    [
      item.residentName,
      item.phone,
      item.apartmentName,
      item.unitNumber,
      item.riskScore,
      item.summary,
      item.createdAt
    ]
      .map((v) => csvValue(v))
      .join(",")
  );
  const csv = [header.map((v) => csvValue(v)).join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="resident-high-risk.csv"'
    }
  });
}
