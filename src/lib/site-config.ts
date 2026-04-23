export const siteConfig = {
  businessPhone: process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? "010-1234-5678",
  kakaoOpenChatUrl: process.env.NEXT_PUBLIC_KAKAO_OPENCHAT_URL ?? "https://open.kakao.com/",
  adminPassword: process.env.ADMIN_PASSWORD ?? "change-this-password"
};

export const ADMIN_AUTH_COOKIE = "dk_admin_auth";
export const RESIDENT_AUTH_COOKIE = "dk_resident_auth";
