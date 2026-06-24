import type { NextConfig } from "next";

const PDF_PARSE_TRACE_INCLUDES = ["./node_modules/pdfjs-dist/**", "./node_modules/pdf-parse/**", "./node_modules/@napi-rs/canvas*/**"];

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // pdf-parse(pdfjs-dist)는 webpack 번들링 시 Object.defineProperty 오류가 나므로 실제 Node 모듈로 둔다.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // pdfjs-dist의 워커(.mjs)/canvas 네이티브 바이너리는 동적 경로로 로드되어 Vercel의 파일 트레이싱이
  // 자동으로 포함시키지 못한다 — pdf-parse를 쓰는 라우트에 한해 명시적으로 포함시킨다.
  outputFileTracingIncludes: {
    "/api/admin/knowledge/classify": PDF_PARSE_TRACE_INCLUDES,
    "/api/admin/knowledge/process": PDF_PARSE_TRACE_INCLUDES,
    "/api/admin/knowledge/relearn": PDF_PARSE_TRACE_INCLUDES,
    "/api/share-target/knowledge-pdf": PDF_PARSE_TRACE_INCLUDES
  },
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
