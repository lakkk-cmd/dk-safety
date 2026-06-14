import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/pages/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}", "./src/app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 기존 유지
        primary: "#0a5eb0",
        accent: "#f97316",
        // 대경안심전기 브랜드 토큰 추가
        "dk-navy": "#0b1c3a",
        "dk-blue": "#1a4b8c",
        "dk-sky": "#2e7dd1",
        "dk-gold": "#c9922a",
        "dk-red": "#dc2626",
        "dk-green": "#16a34a",
        "dk-amber": "#d97706",
        // AI 사령부(hq/contents/agent/report) 전용 디자인 시스템
        "cc-bg": "#F5F6FA",
        "cc-navy": "#1B2E4B",
        "cc-gold": "#F5A623",
        "cc-green": "#38A169",
        "cc-red": "#E53E3E",
        "cc-text": "#2D3748"
      }
    }
  },
  plugins: []
};

export default config;
