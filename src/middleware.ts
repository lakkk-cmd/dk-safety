import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE, RESIDENT_AUTH_COOKIE, WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { residentSessionNotRequired } from "@/lib/service-journey";
import { verifyWorkerSessionTokenEdge } from "@/lib/worker-session-verify-edge";

const FIRST_VISIT_COOKIE = "dk_first_visit_checked";
const HQ_HOST_PREFIX = "hq.";
const REPORT_HOST_PREFIX = "report.";
const AGENT_HOST_PREFIX = "agent.";

function withFirstVisitCookie(res: NextResponse, isFirstVisit: boolean) {
  if (isFirstVisit) {
    res.cookies.set(FIRST_VISIT_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export async function middleware(request: NextRequest) {
  const originalPathname = request.nextUrl.pathname;
  if (/\.[^/]+$/.test(originalPathname)) {
    return NextResponse.next();
  }

  const host = request.headers.get("host") ?? "";

  // hq.dkansim.com / report.dkansim.com / agent.dkansim.com → 같은 배포 안에서 /hq, /report 경로로 재작성
  let pathname = originalPathname;
  let rewriteUrl: URL | null = null;

  if (host.startsWith(HQ_HOST_PREFIX)) {
    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/hq${pathname === "/" ? "" : pathname}`;
    pathname = rewriteUrl.pathname;
  } else if (host.startsWith(REPORT_HOST_PREFIX) || host.startsWith(AGENT_HOST_PREFIX)) {
    // agent.dkansim.com은 report.dkansim.com과 동일하게 라우팅 (보고서 아카이브 별칭)
    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/report${pathname === "/" ? "" : pathname}`;
    pathname = rewriteUrl.pathname;
  }

  const baseResponse = () => (rewriteUrl ? NextResponse.rewrite(rewriteUrl as URL) : NextResponse.next());

  const isFirstVisit = !request.cookies.get(FIRST_VISIT_COOKIE)?.value;

  let response: NextResponse | null = null;
  if (isFirstVisit) {
    response = baseResponse();
    if (process.env.NODE_ENV === "production") {
      response.cookies.set(ADMIN_AUTH_COOKIE, "", { path: "/", maxAge: 0, domain: ".dkansim.com" });
    } else {
      response.cookies.delete(ADMIN_AUTH_COOKIE);
    }
    response.cookies.delete(RESIDENT_AUTH_COOKIE);
    response.cookies.set(FIRST_VISIT_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  const adminAuth =
    response?.cookies.get(ADMIN_AUTH_COOKIE)?.value ?? request.cookies.get(ADMIN_AUTH_COOKIE)?.value;

  if (pathname === "/admin" && adminAuth === "ok") {
    return withFirstVisitCookie(NextResponse.redirect(new URL("/admin/home", request.url)), isFirstVisit);
  }

  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/hq") || pathname.startsWith("/report");
  const isAdminLogin = pathname === "/admin/login" || pathname === "/hq/login";

  if (isAdminRoute && !isAdminLogin && adminAuth !== "ok") {
    if (pathname.startsWith("/report")) {
      // report(및 별칭 agent)에는 자체 로그인 페이지가 없음 → hq 로그인으로 보내고 완료 후 되돌아오게 함
      const hqHost = host.startsWith(REPORT_HOST_PREFIX)
        ? `${HQ_HOST_PREFIX}${host.slice(REPORT_HOST_PREFIX.length)}`
        : host.startsWith(AGENT_HOST_PREFIX)
          ? `${HQ_HOST_PREFIX}${host.slice(AGENT_HOST_PREFIX.length)}`
          : host;
      const nextValue = rewriteUrl
        ? `${request.nextUrl.protocol}//${host}${request.nextUrl.pathname}${request.nextUrl.search}`
        : `${request.nextUrl.pathname}${request.nextUrl.search}`;
      const loginUrl = new URL(`${request.nextUrl.protocol}//${hqHost}${rewriteUrl ? "/login" : "/hq/login"}`);
      loginUrl.searchParams.set("next", nextValue);
      return withFirstVisitCookie(NextResponse.redirect(loginUrl), isFirstVisit);
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = pathname.startsWith("/hq") ? (rewriteUrl ? "/login" : "/hq/login") : "/admin/login";
    loginUrl.search = "";
    return withFirstVisitCookie(NextResponse.redirect(loginUrl), isFirstVisit);
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
    return response ?? baseResponse();
  }

  const isResidentLogin =
    pathname === "/resident/login" || /^\/apt\/[^/]+\/resident\/login$/.test(pathname);

  if (residentSessionNotRequired(pathname) || isResidentLogin) {
    return response ?? baseResponse();
  }

  const residentAuth =
    response?.cookies.get(RESIDENT_AUTH_COOKIE)?.value ?? request.cookies.get(RESIDENT_AUTH_COOKIE)?.value;
  if (residentAuth) {
    return response ?? baseResponse();
  }

  const loginUrl = new URL("/resident/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return withFirstVisitCookie(NextResponse.redirect(loginUrl), isFirstVisit);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
