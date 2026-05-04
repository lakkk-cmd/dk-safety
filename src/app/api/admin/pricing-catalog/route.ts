import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readPricingCatalog, updatePricingCatalog, type PricingCatalogLine } from "@/lib/pricing-catalog";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const lines = await readPricingCatalog();
  return NextResponse.json({ lines });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const body = (await request.json()) as { lines?: PricingCatalogLine[] };
  if (!body.lines || !Array.isArray(body.lines)) {
    return NextResponse.json({ message: "lines 배열이 필요합니다." }, { status: 400 });
  }
  try {
    const lines = await updatePricingCatalog(body.lines);
    return NextResponse.json({ lines });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "저장 실패" }, { status: 400 });
  }
}
