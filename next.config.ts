import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // pdf-parse(pdfjs-dist)는 webpack 번들링 시 Object.defineProperty 오류가 나므로 실제 Node 모듈로 둔다.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/**" }]
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Windows 환경에서 .next 캐시 파일 잠금/손상으로 런타임 모듈 누락이 반복되는 문제를 방지합니다.
      config.cache = false;
      // 네이티브 파일 감시와 충돌 시 청크가 불완전하게 기록되는 경우 완화 (missing ./NNNN.js).
      if (process.platform === "win32") {
        config.watchOptions = {
          ...config.watchOptions,
          poll: 1000,
          aggregateTimeout: 300
        };
      }
    } else if (process.platform === "win32") {
      // 프로덕션 번들에서 남는 웹팩 디스크 캐시가 청크 매니페스트와 어긋나는 경우 완화.
      config.cache = false;
    }
    return config;
  }
};

export default nextConfig;
