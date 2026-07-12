"use client";

import { Suspense, useState } from "react";
import ServiceRequestPage from "@/components/reservation/service-request-page";

type ApartmentInfo = {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
  baseFee: number;
  bankInfo?: { bankName: string; accountNumber: string; accountHolder: string };
};

type Props = {
  apartment: ApartmentInfo;
  initialDong: string;
  initialHo: string;
  initialName: string;
  initialPhone: string;
  /** 이미 저장된 동/호/성명/연락처가 유효하면 기본정보 입력 단계를 건너뛰고 바로 접수 화면으로 진입 */
  skipProfileStep: boolean;
  onClose: () => void;
  /** STEP1 확정 시 홈 화면(부모)의 프로필 state도 동기화 — 다음에 다시 열었을 때 STEP1을 건너뛰기 위함 */
  onProfileConfirmed: (profile: { dong: string; ho: string; name: string; phone: string }) => void;
};

const isValidName = (value: string) => /^[\p{L}\s]+$/u.test(value.trim());
const isValidPhone = (value: string) => /^\d{11}$/.test(value.trim());

export default function RepairRequestModal({
  apartment,
  initialDong,
  initialHo,
  initialName,
  initialPhone,
  skipProfileStep,
  onClose,
  onProfileConfirmed
}: Props) {
  const [step, setStep] = useState<"profile" | "flow">(skipProfileStep ? "flow" : "profile");
  const [dong, setDong] = useState(initialDong);
  const [ho, setHo] = useState(initialHo);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [errorMessage, setErrorMessage] = useState("");

  const profileStorageKey = `dk-safety:request-profile:${apartment.code}`;
  const globalProfileStorageKey = "dk-safety:request-profile:global";

  const goToFlow = () => {
    if (!dong.trim() || !ho.trim() || !name.trim() || !phone.trim()) {
      setErrorMessage("동/호수/성함/휴대폰 번호를 모두 입력해주세요.");
      return;
    }
    if (!isValidName(name)) {
      setErrorMessage("성함은 한글 또는 영문만 입력 가능합니다.");
      return;
    }
    if (!isValidPhone(phone)) {
      setErrorMessage("휴대폰 번호는 숫자 11자리만 입력 가능합니다.");
      return;
    }
    setErrorMessage("");
    // 다음 단계(ServiceRequestPage)가 마운트되자마자 세션스토리지에서 즉시 읽어가므로,
    // effect가 아니라 여기서 동기적으로 먼저 저장해 순서 문제를 피한다.
    try {
      const payload = JSON.stringify({ dong: dong.trim(), ho: ho.trim(), name: name.trim(), phone: phone.trim() });
      window.sessionStorage.setItem(profileStorageKey, payload);
      window.sessionStorage.setItem(globalProfileStorageKey, payload);
    } catch {
      // ignore storage quota/private mode errors
    }
    onProfileConfirmed({ dong: dong.trim(), ho: ho.trim(), name: name.trim(), phone: phone.trim() });
    setStep("flow");
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repair-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-dk-gray shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <p id="repair-modal-title" className="text-base font-black text-slate-900">
              🔧 점검·수리 예약
            </p>
            <p className="mt-0.5 text-xs font-bold text-dk-blue">
              {step === "profile" ? "STEP 1 · 기본 정보 입력" : "STEP 2 · 접수 내용 · 일정 · 결제"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-600"
          >
            ×
          </button>
        </div>
        <div className="h-1.5 w-full shrink-0 bg-slate-100">
          <div
            className={`h-full rounded-r-full bg-gradient-to-r from-dk-navy to-dk-blue transition-all ${
              step === "profile" ? "w-1/2" : "w-full"
            }`}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === "profile" ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold leading-relaxed text-slate-600">
                동/호수와 연락처만 입력하면, 이 창에서 접수부터 예약금 결제까지 한 번에 끝낼 수 있어요.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={dong}
                  onChange={(e) => setDong(e.target.value.replaceAll(/[^0-9]/g, ""))}
                  placeholder="동 번호"
                  inputMode="numeric"
                  className="soft-input h-14 w-full text-base"
                />
                <input
                  value={ho}
                  onChange={(e) => setHo(e.target.value.replaceAll(/[^0-9]/g, ""))}
                  placeholder="호수 번호"
                  inputMode="numeric"
                  className="soft-input h-14 w-full text-base"
                />
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="성명 (한글/영문)"
                className="soft-input h-14 w-full text-base"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replaceAll(/[^0-9]/g, "").slice(0, 11))}
                placeholder="휴대폰 11자리 (숫자만)"
                inputMode="numeric"
                className="soft-input h-14 w-full text-base"
              />
              {errorMessage ? <p className="text-sm font-semibold text-rose-600">{errorMessage}</p> : null}
              <button type="button" onClick={goToFlow} className="btn-primary mt-2 h-14 w-full text-base font-extrabold">
                다음 →
              </button>
            </div>
          ) : (
            <Suspense fallback={<div className="py-10 text-center text-sm text-slate-500">불러오는 중...</div>}>
              <ServiceRequestPage apartment={apartment} requestType="repair" />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
