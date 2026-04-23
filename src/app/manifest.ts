import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "대경안심전기",
    short_name: "대경안심전기",
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
    ]
  };
}
