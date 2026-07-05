import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createConsultationLog } from "@/lib/crm-db";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAME_HEADERS = ["이름", "성명", "고객명", "name"];
const PHONE_HEADERS = ["연락처", "전화번호", "휴대폰", "휴대폰번호", "phone"];
const MEMO_HEADERS = ["메모", "비고", "note", "memo"];

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function findColumn(headerRow: string[], candidates: string[]): number {
  const lowered = candidates.map((c) => c.toLowerCase());
  return headerRow.findIndex((h) => lowered.includes(h));
}

/** 엑셀 파일(.xlsx)로 잠재고객(이름/연락처/메모)을 한 번에 등록 — 대량 입력이라 상담 1건 등록의
 *  Gemini 스팸 검증은 건너뛰고 바로 저장한다(사장님이 직접 올리는 명함/연락처 목록이라 위험 낮음). */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file이 필요합니다." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs 타입 정의의 Buffer와 @types/node의 Buffer<ArrayBufferLike>가 구조적으로 안 맞아,
    // load()가 실제로 받는 파라미터 타입 그대로 캐스팅한다(런타임 동작은 동일한 Node Buffer).
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (e) {
    return NextResponse.json({ error: `엑셀 파일을 읽을 수 없습니다: ${e instanceof Error ? e.message : "unknown"}` }, { status: 400 });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "시트를 찾을 수 없습니다." }, { status: 400 });
  }

  const headerRow = (sheet.getRow(1).values as unknown[]).map(normalizeHeader);
  const nameCol = findColumn(headerRow, NAME_HEADERS);
  const phoneCol = findColumn(headerRow, PHONE_HEADERS);
  const memoCol = findColumn(headerRow, MEMO_HEADERS);

  if (nameCol === -1 || phoneCol === -1) {
    return NextResponse.json(
      { error: `헤더에서 이름/연락처 열을 찾을 수 없습니다. 첫 행에 "이름", "연락처" 열이 있는지 확인하세요.` },
      { status: 400 },
    );
  }

  let created = 0;
  const skipped: { row: number; reason: string }[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values = row.values as unknown[];
    if (!values || values.every((v) => v == null || String(v).trim() === "")) continue;

    const name = String(values[nameCol] ?? "").trim();
    const phone = String(values[phoneCol] ?? "").trim();
    const memo = memoCol !== -1 ? String(values[memoCol] ?? "").trim() : "";

    if (!name || !phone) {
      skipped.push({ row: rowNumber, reason: "이름 또는 연락처 누락" });
      continue;
    }

    try {
      await createConsultationLog({
        customer_phone: phone,
        customer_name: name,
        channel: "visit",
        content: memo || "엑셀 일괄등록",
        next_contact_at: null,
        status: "pending",
        result: null,
        worker_id: null,
      });
      created += 1;
    } catch (e) {
      skipped.push({ row: rowNumber, reason: e instanceof Error ? e.message : "저장 실패" });
    }
  }

  return NextResponse.json({ created, skipped, total: created + skipped.length });
}
