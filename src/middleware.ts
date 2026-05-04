import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE, RESIDENT_AUTH_COOKIE, WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { residentSessionNotRequired } from "@/lib/service-journey";
import { verifyWorkerSessionTokenEdge } from "@/lib/worker-session-verify-edge";

const FIRST_VISIT_COOKIE = "dk_first_visit_checked";

function withFirstVisitCookie(res: NextResponse, isFirstVisit: boolean) {
  if (isFirstVisit) {
    res.cookies.set(FIRST_VISIT_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (/\.[^/]+$/.test(pathname)) {
    return NextResponse.next();
  }

  const isFirstVisit = !request.cookies.get(FIRST_VISIT_COOKIE)?.value;

  let response: NextResponse | null = null;
  if (isFirstVisit) {
    response = NextResponse.next();
    response.cookies.delete(ADMIN_AUTH_COOKIE);
    response.cookies.delete(RESIDENT_AUTH_COOKIE);
    response.cookies.set(FIRST_VISIT_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  const adminAuth =
    response?.cookies.get(ADMIN_AUTH_COOKIE)?.value ?? request.cookies.get(ADMIN_AUTH_COOKIE)?.value;

  if (pathname === "/admin" && adminAuth === "ok") {
    return withFirstVisitCookie(NextResponse.redirect(new URL("/admin/home", request.url)), isFirstVisit);
  }

  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";

  if (isAdminRoute && !isAdminLogin && adminAuth !== "ok") {
    return withFirstVisitCookie(NextResponse.redirect(new URL("/admin/login", request.url)), isFirstVisit);
  }

  const isWorkerRoute = pathname.startsWith("/worker");
  const isWorkerLogin = pathname === "/worker/login";

  if (isWorkerRoute && !isWorkerLogin) {
    const token =
      response?.cookies.get(WORKER_AUTH_COOKIE)?.value ?? request.cookies.get(WORKER_AUTH_COOKIE)?.value;
    if (!(await verifyWorkerSessionTokenEdge(token))) {
      const loginUrl = new URL("/worker/login", request.url);
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return withFirstVisitCookie(NextResponse.redirect(loginUrl), isFirstVisit);
    }
  }

  if (isWorkerRoute || isAdminRoute) {
    return response ?? NextResponse.next();
  }

  const isResidentLogin =
    pathname === "/resident/login" || /^\/apt\/[^/]+\/resident\/login$/.test(pathname);

  if (residentSessionNotRequired(pathname) || isResidentLogin) {
    return response ?? NextResponse.next();
  }

  const residentAuth =
    response?.cookies.get(RESIDENT_AUTH_COOKIE)?.value ?? request.cookies.get(RESIDENT_AUTH_COOKIE)?.value;
  if (residentAuth) {
    return response ?? NextResponse.next();
  }

  const loginUrl = new URL("/resident/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return withFirstVisitCookie(NextResponse.redirect(loginUrl), isFirstVisit);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
