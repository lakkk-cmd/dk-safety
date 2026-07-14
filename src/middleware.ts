import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE, BOMI_AUTH_COOKIE, RESIDENT_AUTH_COOKIE, WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { residentSessionNotRequired } from "@/lib/service-journey";
import { verifyWorkerSessionTokenEdge } from "@/lib/worker-session-verify-edge";

const FIRST_VISIT_COOKIE = "dk_first_visit_checked";
const HQ_HOST_PREFIX = "hq.";
const REPORT_HOST_PREFIX = "report.";
const AGENT_HOST_PREFIX = "agent.";
const CONTENTS_HOST_PREFIX = "contents.";
// 보미(보험설계사 CRM)는 dk-safety(전기안전) 사업과 별개 서비스 — 라우트만 같은 배포를
// 공유하고, 인증 쿠키(BOMI_AUTH_COOKIE)는 admin/worker/resident와 절대 섞이지 않는다.
const BOMI_HOST_PREFIX = "bomi.";

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

  // hq.dkansim.com / report.dkansim.com / agent.dkansim.com → 같은 배포 안에서 /hq, /report, /agent 경로로 재작성
  let pathname = originalPathname;
  let rewriteUrl: URL | null = null;

  if (host.startsWith(HQ_HOST_PREFIX)) {
    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/hq${pathname === "/" ? "" : pathname}`;
    pathname = rewriteUrl.pathname;
  } else if (host.startsWith(REPORT_HOST_PREFIX)) {
    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/report${pathname === "/" ? "" : pathname}`;
    pathname = rewriteUrl.pathname;
  } else if (host.startsWith(AGENT_HOST_PREFIX)) {
    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/agent${pathname === "/" ? "" : pathname}`;
    pathname = rewriteUrl.pathname;
  } else if (host.startsWith(CONTENTS_HOST_PREFIX)) {
    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/contents${pathname === "/" ? "" : pathname}`;
    pathname = rewriteUrl.pathname;
  } else if (host.startsWith(BOMI_HOST_PREFIX)) {
    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/bomi${pathname === "/" ? "" : pathname}`;
    pathname = rewriteUrl.pathname;
  }

  const baseResponse = () => (rewriteUrl ? NextResponse.rewrite(rewriteUrl as URL) : NextResponse.next());

  const isFirstVisit = !request.cookies.get(FIRST_VISIT_COOKIE)?.value;

  let response: NextResponse | null = null;
  if (isFirstVisit) {
    response = baseResponse();
    if (process.env.NODE_ENV === "production") {
      response.cookies.set(ADMIN_AUTH_COOKIE, "", { path: "/", maxAge: 0, domain: ".dkansim.com" });
      response.cookies.set(BOMI_AUTH_COOKIE, "", { path: "/", maxAge: 0, domain: ".dkansim.com" });
    } else {
      response.cookies.delete(ADMIN_AUTH_COOKIE);
      response.cookies.delete(BOMI_AUTH_COOKIE);
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
    pathname.startsWith("/admin") ||
    pathname.startsWith("/hq") ||
    pathname.startsWith("/report") ||
    pathname.startsWith("/agent") ||
    pathname.startsWith("/contents");
  const isAdminLogin = pathname === "/admin/login" || pathname === "/hq/login";

  if (isAdminRoute && !isAdminLogin && adminAuth !== "ok") {
    if (pathname.startsWith("/report") || pathname.startsWith("/agent") || pathname.startsWith("/contents")) {
      // report/agent/contents에는 자체 로그인 페이지가 없음 → hq 로그인으로 보내고 완료 후 되돌아오게 함
      const hqHost = host.startsWith(REPORT_HOST_PREFIX)
        ? `${HQ_HOST_PREFIX}${host.slice(REPORT_HOST_PREFIX.length)}`
        : host.startsWith(AGENT_HOST_PREFIX)
          ? `${HQ_HOST_PREFIX}${host.slice(AGENT_HOST_PREFIX.length)}`
          : host.startsWith(CONTENTS_HOST_PREFIX)
            ? `${HQ_HOST_PREFIX}${host.slice(CONTENTS_HOST_PREFIX.length)}`
            : host;
      const nextValue = rewriteUrl
        ? `${request.nextUrl.protocol}//${host}${request.nextUrl.pathname}${request.nextUrl.search}`
        : `${request.nextUrl.pathname}${request.nextUrl.search}`;
      const loginUrl = new URL(`${request.nextUrl.protocol}//${hqHost}${rewriteUrl ? "/login" : "/hq/login"}`);
      loginUrl.searchParams.set("next", nextValue);
      return withFirstVisitCookie(NextResponse.redirect(loginUrl), isFirstVisit);
    }

    // SMS/카카오 알림 링크로 특정 페이지(예: /admin/reservations?id=...)에 바로 들어왔을 때,
    // 로그인 후 그 자리로 돌아가지 못하고 항상 홈으로 튕기던 문제 — next 파라미터로 원래
    // 목적지를 들고 가서 로그인 성공 시 되돌려준다(report/agent/contents 케이스와 동일 패턴).
    const originalTarget = `${pathname}${request.nextUrl.search}`;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = pathname.startsWith("/hq") ? (rewriteUrl ? "/login" : "/hq/login") : "/admin/login";
    loginUrl.search = "";
    if (originalTarget && originalTarget !== loginUrl.pathname) {
      loginUrl.searchParams.set("next", originalTarget);
    }
    return withFirstVisitCookie(NextResponse.redirect(loginUrl), isFirstVisit);
  }

  const isWorkerRoute = pathname.startsWith("/worker") || pathname.startsWith("/field-report");
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

  const isBomiRoute = pathname.startsWith("/bomi");
  const isBomiLogin = pathname === "/bomi/login";

  if (isBomiRoute && !isBomiLogin) {
    const bomiAuth =
      response?.cookies.get(BOMI_AUTH_COOKIE)?.value ?? request.cookies.get(BOMI_AUTH_COOKIE)?.value;
    if (bomiAuth !== "ok") {
      // pathname은 rewrite 후 내부 경로(예: "/bomi")라 그대로 next로 넘기면 로그인 후
      // 클라이언트가 다시 그 경로로 이동할 때 미들웨어가 "/bomi"를 한 번 더 붙여
      // "/bomi/bomi"가 되어 404가 난다 — 브라우저가 실제로 보는 originalPathname을 써야 한다.
      const originalTarget = `${originalPathname}${request.nextUrl.search}`;
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = rewriteUrl ? "/login" : "/bomi/login";
      loginUrl.search = "";
      if (originalTarget && originalTarget !== loginUrl.pathname) {
        loginUrl.searchParams.set("next", originalTarget);
      }
      return withFirstVisitCookie(NextResponse.redirect(loginUrl), isFirstVisit);
    }
  }

  if (isWorkerRoute || isAdminRoute || isBomiRoute) {
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
