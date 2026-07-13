import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { isBomiAuthenticated } from "@/lib/bomi-auth";
import { getBomiCustomer } from "@/lib/bomi-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const customer = await getBomiCustomer(id);
    if (!customer) {
      return NextResponse.json({ message: "고객을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ customer });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}
