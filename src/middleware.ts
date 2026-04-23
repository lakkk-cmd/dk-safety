import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE, RESIDENT_AUTH_COOKIE } from "@/lib/site-config";

const FIRST_VISIT_COOKIE = "dk_first_visit_checked";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStaticAsset = /\.[^/]+$/.test(pathname);
  if (isStaticAsset) {
    return NextResponse.next();
  }

  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";
  const isResidentLogin = pathname === "/resident/login";
  const isPublicHome = pathname === "/" || pathname === "/home";
  const isFirstVisit = !request.cookies.get(FIRST_VISIT_COOKIE)?.value;

  let response: NextResponse | null = null;
  if (isFirstVisit) {
    // 브라우저 세션의 첫 진입에서는 항상 로그아웃 상태로 시작합니다.
    response = NextResponse.next();
    response.cookies.delete(ADMIN_AUTH_COOKIE);
    response.cookies.delete(RESIDENT_AUTH_COOKIE);
    response.cookies.set(FIRST_VISIT_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  if (isAdminRoute && !isAdminLogin) {
    const adminAuth =
      response?.cookies.get(ADMIN_AUTH_COOKIE)?.value ?? request.cookies.get(ADMIN_AUTH_COOKIE)?.value;
    if (adminAuth !== "ok") {
      const loginUrl = new URL("/admin/login", request.url);
      const redirectResponse = NextResponse.redirect(loginUrl);
      if (isFirstVisit) {
        redirectResponse.cookies.set(FIRST_VISIT_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
      }
      return redirectResponse;
    }
  }

  if (!isAdminRoute && !isResidentLogin && !isPublicHome) {
    const residentAuth =
      response?.cookies.get(RESIDENT_AUTH_COOKIE)?.value ?? request.cookies.get(RESIDENT_AUTH_COOKIE)?.value;
    if (!residentAuth) {
      const loginUrl = new URL("/resident/login", request.url);
      const redirectResponse = NextResponse.redirect(loginUrl);
      if (isFirstVisit) {
        redirectResponse.cookies.set(FIRST_VISIT_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
      }
      return redirectResponse;
    }
  }

  return response ?? NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
