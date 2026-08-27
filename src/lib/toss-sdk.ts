/** Toss 결제창 SDK v1 로더 — 결제(requestPayment)와 자동결제 카드등록(requestBillingAuth)이 같은
 *  스크립트를 쓰므로, 로딩 Promise를 한 모듈에 모아 두 화면이 같은 인스턴스를 공유하게 한다. */

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      requestPayment: (method: string, payload: Record<string, unknown>) => Promise<void>;
      requestBillingAuth: (method: string, payload: Record<string, unknown>) => Promise<void>;
    };
  }
}

const SCRIPT_ID = "toss-payments-sdk-v1";
const SCRIPT_SRC = "https://js.tosspayments.com/v1/payment";

// 모듈 스코프에 로딩 Promise를 캐싱 — React StrictMode가 effect/핸들러를 두 번
// 실행하거나 이 로더를 쓰는 컴포넌트가 한 페이지에 여러 번 마운트돼도, 이미 있는 <script> 태그를
// "존재하니 완료됐다"고 오판하지 않고 실제 로드 완료(onload)까지 항상 같은 Promise로 기다린다.
let tossScriptPromise: Promise<void> | null = null;

export function loadTossScript(): Promise<void> {
  if (typeof window !== "undefined" && window.TossPayments) return Promise.resolve();
  if (tossScriptPromise) return tossScriptPromise;
  tossScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("결제 SDK 로드 실패")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("결제 SDK 로드 실패"));
    document.body.appendChild(script);
  });
  return tossScriptPromise;
}
