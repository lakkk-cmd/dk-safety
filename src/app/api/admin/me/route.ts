import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgGetAdminAccountName } from "@/lib/admin-accounts-pg";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { verifyAdminSessionToken } from "@/lib/admin-session";
import { ADMIN_ID_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const cookieStore = await cookies();
  const session = verifyAdminSessionToken(cookieStore.get(ADMIN_ID_COOKIE)?.value);
  if (!session || !isSupabaseReservationsDbReady()) {
    return NextResponse.json({ accountId: null, name: null });
  }
  try {
    const name = await pgGetAdminAccountName(session.accountId);
    return NextResponse.json({ accountId: session.accountId, name });
  } catch {
    return NextResponse.json({ accountId: null, name: null });
  }
}
