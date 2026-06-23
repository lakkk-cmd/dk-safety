import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/pages/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}", "./src/app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 기존 유지
        primary: "#0a5eb0",
        accent: "#f97316",
        // 우리집 전기주치의(대경이엔피) 브랜드 토큰 — 2026-06 디자인시스템 재설계로 신규 값 적용
        "dk-navy": "#0B1F3A",
        "dk-blue": "#1A5CFF",
        "dk-sky": "#EEF3FF",
        "dk-gold": "#F5A623",
        "dk-red": "#E53E3E",
        "dk-green": "#38A169",
        "dk-amber": "#DD6B20",
        "dk-gray": "#F7F8FA",
        // AI 사령부(hq/contents/agent/report) 전용 디자인 시스템
        "cc-bg": "#F5F6FA",
        "cc-navy": "#1B2E4B",
        "cc-gold": "#F5A623",
        "cc-green": "#38A169",
        "cc-red": "#E53E3E",
        "cc-text": "#2D3748"
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "Helvetica Neue",
          "Segoe UI",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};

export default config;
