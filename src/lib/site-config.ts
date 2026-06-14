export const siteConfig = {
  businessPhone: process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? "010-1234-5678",
  kakaoOpenChatUrl: process.env.NEXT_PUBLIC_KAKAO_OPENCHAT_URL ?? "https://open.kakao.com/",
  adminPassword: process.env.ADMIN_PASSWORD ?? "change-this-password",
  defaultBankName: process.env.NEXT_PUBLIC_DEFAULT_BANK_NAME ?? "국민은행",
  defaultBankAccountNumber: process.env.NEXT_PUBLIC_DEFAULT_BANK_ACCOUNT_NUMBER ?? "123-456-789",
  defaultBankAccountHolder: process.env.NEXT_PUBLIC_DEFAULT_BANK_ACCOUNT_HOLDER ?? "우리집 전기주치의(대경이엔피)",
  defaultDispatchFee: Number(process.env.NEXT_PUBLIC_DEFAULT_DISPATCH_FEE ?? "50000")
};

export const ADMIN_AUTH_COOKIE = "dk_admin_auth";
export const RESIDENT_AUTH_COOKIE = "dk_resident_auth";
export const WORKER_AUTH_COOKIE = "dk_worker_auth";

/** 기사 세션 서명용. 운영 환경에서 반드시 임의 문자열로 설정하세요. */
export const WORKER_SESSION_SECRET = process.env.WORKER_SESSION_SECRET ?? "";
