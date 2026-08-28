"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadDaumPostcodeScript } from "@/lib/daum-postcode-client";

const STEP_LABELS = ["단지입력", "정보입력"] as const;

function AptManagerSignupForm() {
  const searchParams = useSearchParams();
  const qrApartmentName = searchParams.get("apartmentName") ?? "";

  const [step, setStep] = useState(0);

  const [apartmentName, setApartmentName] = useState(qrApartmentName);
  const [apartmentAddress, setApartmentAddress] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [totalUnits, setTotalUnits] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [loginIdCheck, setLoginIdCheck] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  const checkLoginId = async () => {
    const trimmed = loginId.trim();
    if (!/^[a-zA-Z0-9_-]{4,20}$/.test(trimmed)) {
      setLoginIdCheck("invalid");
      return;
    }
    setLoginIdCheck("checking");
    try {
      const response = await fetch(`/api/apt-manager/check-login-id?loginId=${encodeURIComponent(trimmed)}`);
      const data = (await response.json()) as { available?: boolean };
      setLoginIdCheck(response.ok && data.available ? "available" : "taken");
    } catch {
      setLoginIdCheck("idle");
    }
  };

  const searchAddress = async () => {
    try {
      await loadDaumPostcodeScript();
      new window.daum!.Postcode({
        oncomplete: (data) => {
          const fullAddress = data.roadAddress || data.jibunAddress || data.address || "";
          setApartmentAddress(fullAddress);
          if (!apartmentName.trim() && data.apartment === "Y" && data.buildingName) {
            setApartmentName(data.buildingName);
          }
        }
      }).open();
    } catch {
      setMessage("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const step0Valid = Boolean(apartmentName.trim() && apartmentAddress.trim() && completionDate && totalUnits.trim());
  const step1Valid = Boolean(
    name.trim() && /^01[0-9]-?\d{3,4}-?\d{4}$/.test(phone.trim()) && /^[a-zA-Z0-9_-]{4,20}$/.test(loginId.trim()) &&
      password.length >= 8 && password === passwordConfirm
  );

  const goNext = () => {
    if (!step0Valid) {
      setMessage("단지명·단지주소·준공일·세대수를 모두 입력해주세요.");
      return;
    }
    setMessage(null);
    setStep(1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!step0Valid) {
      setMessage("단지입력 탭을 먼저 모두 채워주세요.");
      setStep(0);
      return;
    }
    if (!name.trim() || !/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phone.trim())) {
      setMessage("이름과 연락처를 올바르게 입력해주세요.");
      return;
    }
    if (!/^[a-zA-Z0-9_-]{4,20}$/.test(loginId.trim())) {
      setMessage("아이디는 영문/숫자/_/- 4~20자로 입력해주세요.");
      return;
    }
    if (password.length < 8) {
      setMessage("비밀번호는 8자 이상으로 입력해주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setMessage("비밀번호가 서로 달라요.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/apt-manager/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          loginId,
          password,
          apartmentName,
          apartmentAddress,
          completionDate,
          totalUnits
        })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "가입신청에 실패했습니다.");
        return;
      }
      setDone(true);
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    window.location.href = "/apt-manager/pending";
    return <p className="py-10 text-center text-sm text-slate-500">이동 중...</p>;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
      <Link href="/apt-manager/login" className="text-xs font-semibold text-slate-500 hover:text-dk-blue">
        ← 로그인 화면으로 돌아가기
      </Link>
      <p className="mt-3 text-xs font-semibold text-dk-blue">우리집 안심전기(대경이엔피)</p>
      <h1 className="mt-2 text-2xl font-black text-slate-950">공동주택 세대 전기설비점검 가입 신청</h1>
      <p className="mt-2 text-sm text-slate-600">단지 전기안전관리자만 신청해주세요. 신청 후 대표님이 관리사무소로 실존확인 전화드려요.</p>

      <div className="mt-6 flex gap-2">
        {STEP_LABELS.map((label, idx) => (
          <div
            key={label}
            className={`flex-1 rounded-xl border-2 py-2 text-center text-sm font-bold ${
              step === idx
                ? "border-dk-blue bg-dk-sky text-dk-navy"
                : idx < step
                  ? "border-dk-blue/40 bg-white text-dk-blue"
                  : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            {idx + 1}. {label}
          </div>
        ))}
      </div>

      {message ? <p className="mt-4 text-sm text-rose-700">{message}</p> : null}

      {step === 0 ? (
        <div className="mt-4 space-y-3">
          <button type="button" onClick={() => void searchAddress()} className="btn-primary w-full py-3 text-sm">
            🔍 단지 주소 검색
          </button>
          <input value={apartmentName} onChange={(e) => setApartmentName(e.target.value)} placeholder="단지명" className="soft-input w-full" />
          <input value={apartmentAddress} onChange={(e) => setApartmentAddress(e.target.value)} placeholder="단지 주소 (검색 버튼으로 채워짐)" className="soft-input w-full" />
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">준공일</p>
            <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} className="soft-input w-full" />
          </div>
          <input
            value={totalUnits}
            onChange={(e) => setTotalUnits(e.target.value)}
            placeholder="세대수"
            inputMode="numeric"
            className="soft-input w-full"
          />
          <button type="button" onClick={goNext} className="btn-primary w-full py-3 text-sm">
            다음
          </button>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className="soft-input w-full" required />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="연락처 (예: 010-1234-5678)" inputMode="tel" className="soft-input w-full" required />
          <div>
            <div className="flex gap-2">
              <input
                value={loginId}
                onChange={(e) => {
                  setLoginId(e.target.value);
                  setLoginIdCheck("idle");
                }}
                placeholder="아이디 (영문/숫자 4~20자)"
                autoComplete="username"
                className="soft-input flex-1"
                required
              />
              <button
                type="button"
                onClick={() => void checkLoginId()}
                disabled={loginIdCheck === "checking"}
                className="shrink-0 rounded-xl border border-dk-blue px-4 text-sm font-bold text-dk-blue disabled:opacity-50"
              >
                {loginIdCheck === "checking" ? "확인 중..." : "중복확인"}
              </button>
            </div>
            {loginIdCheck === "available" ? <p className="mt-1 text-xs font-semibold text-dk-green">사용 가능한 아이디예요.</p> : null}
            {loginIdCheck === "taken" ? <p className="mt-1 text-xs font-semibold text-rose-600">이미 사용 중인 아이디예요.</p> : null}
            {loginIdCheck === "invalid" ? <p className="mt-1 text-xs font-semibold text-rose-600">영문/숫자/_/- 4~20자로 입력해주세요.</p> : null}
          </div>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호 (8자 이상)" type="password" autoComplete="new-password" className="soft-input w-full" required />
          <input value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="비밀번호 확인" type="password" autoComplete="new-password" className="soft-input w-full" required />

          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(0)} className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-600">
              이전
            </button>
            <button type="submit" disabled={loading || !step1Valid} className="btn-primary flex-1 py-3 text-sm disabled:opacity-50">
              {loading ? "신청 중..." : "가입 신청"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function AptManagerSignupPage() {
  return (
    <main className="page-fit flex max-w-md flex-col justify-center bg-slate-100 py-8">
      <Suspense fallback={null}>
        <AptManagerSignupForm />
      </Suspense>
    </main>
  );
}
