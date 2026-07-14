import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { isBomiAuthenticated } from "@/lib/bomi-auth";
import { deleteBomiCustomer, getBomiCustomer, listBomiDocuments, updateBomiCustomer } from "@/lib/bomi-db";
import { deleteStorageObjects } from "@/lib/supabase-server";

const BOMI_DOCUMENTS_BUCKET = process.env.SUPABASE_BOMI_DOCUMENTS_BUCKET?.trim() || "dk-bomi-documents";

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      phone?: string;
      address?: string;
      birthDate?: string | null;
      gender?: string | null;
      occupation?: string;
      familyNote?: string;
      financialNote?: string;
      memo?: string;
    };
    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ message: "고객 이름은 비울 수 없습니다." }, { status: 400 });
    }
    const customer = await updateBomiCustomer(id, {
      name: body.name,
      phone: body.phone,
      address: body.address,
      birthDate: body.birthDate === undefined ? undefined : body.birthDate || null,
      gender: body.gender === undefined ? undefined : body.gender === "남" || body.gender === "여" ? body.gender : null,
      occupation: body.occupation,
      familyNote: body.familyNote,
      financialNote: body.financialNote,
      memo: body.memo
    });
    return NextResponse.json({ customer });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const { id } = await params;
    // DB 행은 FK cascade로 문서/보장분석/계약 등이 함께 지워지지만, 스토리지의 실제 파일은
    // 남으므로(고아 객체 방지) 먼저 문서 목록을 읽어 스토리지 객체를 정리한다.
    const documents = await listBomiDocuments(id);
    if (documents.length > 0) {
      await deleteStorageObjects(BOMI_DOCUMENTS_BUCKET, documents.map((d) => d.url)).catch(() => {
        // 스토리지 정리 실패는 삭제 자체를 막지 않는다 — 고객 데이터 삭제가 우선.
      });
    }
    await deleteBomiCustomer(id);
    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "삭제 실패" }, { status: 500 });
  }
}
