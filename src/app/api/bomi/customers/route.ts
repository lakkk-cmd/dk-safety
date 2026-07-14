import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { isBomiAuthenticated } from "@/lib/bomi-auth";
import { createBomiCustomer, listBomiCustomers } from "@/lib/bomi-db";

export async function GET() {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const customers = await listBomiCustomers();
    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const body = (await request.json()) as {
      name?: string;
      phone?: string;
      address?: string;
      birthDate?: string;
      gender?: string;
      occupation?: string;
      familyNote?: string;
      financialNote?: string;
      memo?: string;
    };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ message: "고객 이름이 필요합니다." }, { status: 400 });
    }
    const customer = await createBomiCustomer({
      name,
      phone: body.phone,
      address: body.address,
      birthDate: body.birthDate || null,
      gender: body.gender === "남" || body.gender === "여" ? body.gender : null,
      occupation: body.occupation,
      familyNote: body.familyNote,
      financialNote: body.financialNote,
      memo: body.memo
    });
    return NextResponse.json({ customer });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "등록 실패" }, { status: 500 });
  }
}
