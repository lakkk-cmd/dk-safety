import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config, { dev }) => {
    if (dev) {
      // Windows 환경에서 .next 캐시 파일 잠금/손상으로 런타임 모듈 누락이 반복되는 문제를 방지합니다.
      config.cache = false;
    }
    return config;
  }
};

export default nextConfig;
