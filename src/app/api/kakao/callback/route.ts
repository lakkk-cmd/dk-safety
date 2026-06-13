import { isAdminAuthenticated } from "@/lib/admin-auth";
import { exchangeKakaoCode, KAKAO_OAUTH_ENABLED } from "@/lib/kakao-oauth";

export const maxDuration = 60;

function htmlResponse(body: string): Response {
  return new Response(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>카카오 연동</title></head>
<body style="font-family:system-ui,sans-serif;padding:40px;max-width:520px;margin:0 auto">
${body}
<p style="margin-top:24px"><a href="https://contents.dkansim.com" style="color:#2563eb">콘텐츠 사령부로 이동</a></p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return new Response("권한이 없습니다.", { status: 401 });
  }
  if (!KAKAO_OAUTH_ENABLED) {
    return htmlResponse("<h2>❌ KAKAO_REST_API_KEY가 설정되지 않았습니다.</h2>");
  }

  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const code = searchParams.get("code");

  if (error) {
    return htmlResponse(
      `<h2>❌ 카카오 연동 실패</h2><p>error: ${error}</p><p>${searchParams.get("error_description") ?? ""}</p>`,
    );
  }
  if (!code) {
    return htmlResponse("<h2>⚠️ code 파라미터가 없습니다.</h2><p>카카오 연동 URL을 통해 접속하세요.</p>");
  }

  try {
    await exchangeKakaoCode(code);
    return htmlResponse("<h2>✅ 카카오 계정이 연동되었습니다.</h2><p>이제 콘텐츠 사령부에서 카카오 포스트를 실제로 발행할 수 있습니다.</p>");
  } catch (err) {
    return htmlResponse(
      `<h2>❌ 토큰 교환 실패</h2><pre style="white-space:pre-wrap">${err instanceof Error ? err.message : String(err)}</pre>`,
    );
  }
}
