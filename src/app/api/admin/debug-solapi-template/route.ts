import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";

/** 임시 진단용 — 세대전기점검 알림 링크가 홈으로 튀는 버그 원인 확인 후 삭제할 것 (2026-08-23). */
export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });

  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const templateId = process.env.SOLAPI_TEMPLATE_ID?.trim();
  if (!apiKey || !apiSecret || !templateId) {
    return NextResponse.json({ message: "SOLAPI 환경변수 미설정", apiKey: !!apiKey, apiSecret: !!apiSecret, templateId }, { status: 400 });
  }

  try {
    const { SolapiMessageService } = await import("solapi");
    const client = new SolapiMessageService(apiKey, apiSecret);
    const template = await client.getKakaoAlimtalkTemplate(templateId);
    return NextResponse.json({ template });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
