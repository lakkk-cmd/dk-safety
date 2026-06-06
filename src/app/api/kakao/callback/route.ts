const REST_API_KEY = process.env.KAKAO_REST_API_KEY ?? "";
const REDIRECT_URI = "https://dkansim.com/api/kakao/callback";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return new Response(
      `<html><body style="font-family:monospace;padding:40px">
        <h2>❌ 카카오 인증 실패</h2>
        <p>error: ${error}</p>
        <p>description: ${searchParams.get("error_description")}</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!code) {
    return new Response(
      `<html><body style="font-family:monospace;padding:40px">
        <h2>⚠️ code 파라미터 없음</h2>
        <p>카카오 인증 URL을 통해 접속하세요.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!REST_API_KEY) {
    return new Response(
      `<html><body style="font-family:monospace;padding:40px">
        <h2>❌ KAKAO_REST_API_KEY 환경변수 미설정</h2>
        <p>Vercel Dashboard → Settings → Environment Variables 에서<br>
        <b>KAKAO_REST_API_KEY</b> 를 추가하고 재배포하세요.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: REST_API_KEY,
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });

  const tokenData = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || tokenData.error) {
    return new Response(
      `<html><body style="font-family:monospace;padding:40px">
        <h2>❌ 토큰 발급 실패</h2>
        <pre>${JSON.stringify(tokenData, null, 2)}</pre>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const { access_token, refresh_token } = tokenData;

  return new Response(
    `<html>
<head><meta charset="UTF-8"><title>카카오 토큰 발급 완료</title></head>
<body style="font-family:monospace;padding:40px;background:#f9f9f9">
  <h2>✅ 카카오 토큰 발급 완료</h2>
  <p>아래 값을 <b>.env.local</b>과 <b>Vercel 환경변수</b>에 추가하세요.</p>

  <h3>KAKAO_ACCESS_TOKEN</h3>
  <textarea rows="3" style="width:100%;padding:10px;font-size:13px" onclick="this.select()">${access_token}</textarea>

  <h3>KAKAO_REFRESH_TOKEN</h3>
  <textarea rows="3" style="width:100%;padding:10px;font-size:13px" onclick="this.select()">${refresh_token}</textarea>

  <hr style="margin:30px 0">
  <h3>.env.local에 추가할 내용</h3>
  <textarea rows="4" style="width:100%;padding:10px;font-size:13px" onclick="this.select()">KAKAO_ACCESS_TOKEN=${access_token}
KAKAO_REFRESH_TOKEN=${refresh_token}</textarea>

  <p style="color:#888;margin-top:20px">⚠️ access_token 만료: ${tokenData.expires_in}초 (약 ${Math.round((tokenData.expires_in ?? 0) / 3600)}시간)<br>
  refresh_token으로 갱신 필요 시 <code>/api/kakao/refresh</code> 호출</p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
