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
/** 보미(보험설계사 CRM, bomi.dkansim.com) 전용 인증 — admin/worker/resident와 완전 별도 계정 체계. */
export const BOMI_AUTH_COOKIE = "dk_bomi_auth";
/** 보미 로그인 비밀번호. dk-safety의 ADMIN_PASSWORD와 무관한 별도 값. */
export const BOMI_PASSWORD = process.env.BOMI_PASSWORD ?? "change-this-password";
/** 로그인한 관리자 계정을 식별하는 보조 쿠키 — dk_admin_auth(인증 게이트)와 별개, 없어도 로그인 자체는 된다. */
export const ADMIN_ID_COOKIE = "dk_admin_id";

/** 기사 세션 서명용. 운영 환경에서 반드시 임의 문자열로 설정하세요. */
export const WORKER_SESSION_SECRET = process.env.WORKER_SESSION_SECRET ?? "";
/** 관리자 계정 식별 세션 서명용. 미설정 시 계정 식별 쿠키만 생략되고 로그인은 정상 동작한다. */
export const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET ?? "";
/** 대표님 개인 휴대폰(SMS 긴급/승인대기 알림 수신용) — NEXT_PUBLIC_BUSINESS_PHONE(공개 상담번호)과 다름, 절대 클라이언트 노출 금지. */
export const ADMIN_ALERT_PHONE = process.env.ADMIN_ALERT_PHONE ?? "";
