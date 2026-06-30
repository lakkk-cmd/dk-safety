import { NextResponse } from "next/server";
import { fetchRestoreData } from "@/lib/chat-restore";

function checkReadAuth(request: Request): boolean {
  const secret =
    process.env.AGENT_READ_SECRET?.trim() || process.env.AGENT_WRITE_SECRET?.trim() || "";
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!checkReadAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  try {
    const data = await fetchRestoreData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "복원 실패" },
      { status: 500 },
    );
  }
}
