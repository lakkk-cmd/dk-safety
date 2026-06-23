import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "우리집 전기주치의(대경이엔피)",
    short_name: "전기주치의",
    description: "우리집 전기 주치의 - 자가진단, 예약, 긴급출동",
    start_url: "/",
    display: "standalone",
    background_color: "#eef4fb",
    theme_color: "#0a5eb0",
    icons: [
      {
        src: "/logo-daekyung.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/logo-daekyung.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    // 안드로이드에서 카카오톡/메일 공유 시트의 "전기주치의"로 PDF를 직접 보낼 수 있게 한다.
    // (iOS Safari는 Web Share Target API 수신을 지원하지 않아 안드로이드 전용 경로)
    share_target: {
      action: "/api/share-target/knowledge-pdf",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [{ name: "pdf", accept: ["application/pdf"] }]
      }
    }
  };
}
