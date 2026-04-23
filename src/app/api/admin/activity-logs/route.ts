import { NextResponse } from "next/server";
import { readActivityLogs } from "@/lib/activity-log";

export async function GET() {
  const logs = await readActivityLogs(200);
  return NextResponse.json({ logs });
}
