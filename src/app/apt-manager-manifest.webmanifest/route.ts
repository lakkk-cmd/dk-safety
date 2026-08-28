import { NextResponse } from "next/server";

/**
 * 세대전기점검 앱(inspect.dkansim.com) 전용 PWA 설치정보 — 사이트 전체가 쓰는 루트
 * manifest.ts(이름 "우리집 전기주치의", start_url "/")와 분리한다. 이 경로는 확장자(.webmanifest)가
 * 있어 src/middleware.ts의 서브도메인 host rewrite를 그대로 통과하므로(파일 확장자 있는 요청은
 * rewrite 건너뜀) 어느 호스트에서 요청해도 동일하게 서빙된다. 안드로이드 앱(mobile/apt-manager-app)
 * 과 이름·아이콘을 통일했다(2026-08-28).
 */
export async function GET() {
  return NextResponse.json(
    {
      name: "우리집 안심전기",
      short_name: "안심전기",
      description: "세대전기점검(직무고시) 전기과장 전용 앱",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#eef4fb",
      theme_color: "#0a5eb0",
      icons: [{ src: "/apt-manager-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" }]
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
