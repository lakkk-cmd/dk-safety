"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ApartmentOption = { id: string; name: string; totalUnits: number | null };

function AptManagerSignupForm() {
  const searchParams = useSearchParams();
  const qrApartmentId = searchParams.get("apartmentId") ?? "";
  const qrApartmentName = searchParams.get("apartmentName") ?? "";

  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");

  const [apartmentId, setApartmentId] = useState(qrApartmentId);
  const [apartmentQuery, setApartmentQuery] = useState(qrApartmentName);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [newApartmentName, setNewApartmentName] = useState("");
  const [newApartmentAddress, setNewApartmentAddress] = useState("");
  const [newTotalUnits, setNewTotalUnits] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/apt-manager/apartments-search", { cache: "no-store" });
      const data = (await response.json()) as { apartments?: ApartmentOption[] };
      if (response.ok) setApartments(data.apartments ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = apartmentQuery.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter((a) => a.name.toLowerCase().includes(q));
  }, [apartments, apartmentQuery]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (mode === "existing" && !apartmentId) {
      setMessage("단지를 선택해주세요.");
      return;
    }
    if (mode === "new" && (!newApartmentName.trim() || !newTotalUnits.trim())) {
      setMessage("단지명과 예상 세대수를 입력해주세요.");
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
    try {
      const response = await fetch("/api/apt-manager/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          loginId,
          password,
          apartmentId: mode === "existing" ? apartmentId : "",
          apartmentNameRequested: mode === "new" ? newApartmentName : "",
          apartmentAddressRequested: mode === "new" ? newApartmentAddress : "",
          totalUnitsRequested: mode === "new" ? newTotalUnits : undefined
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
      <p className="text-xs font-semibold text-dk-blue">우리집 안심전기(대경이엔피)</p>
      <h1 className="mt-2 text-2xl font-black text-slate-950">공동주택 세대 전기설비점검 가입 신청</h1>
      <p className="mt-2 text-sm text-slate-600">단지 전기안전관리자만 신청해주세요. 신청 후 대표님이 관리사무소로 실존확인 전화드려요.</p>

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold ${mode === "existing" ? "border-dk-blue bg-dk-sky text-dk-navy" : "border-slate-200 text-slate-500"}`}
            >
              단지 선택
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold ${mode === "new" ? "border-dk-blue bg-dk-sky text-dk-navy" : "border-slate-200 text-slate-500"}`}
            >
              목록에 없어요
            </button>
          </div>

          {mode === "existing" ? (
            <div className="relative">
              <input
                value={apartmentQuery}
                onChange={(e) => {
                  setApartmentQuery(e.target.value);
                  setApartmentId("");
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                placeholder="단지명을 검색하세요"
                className="soft-input w-full"
                required
              />
              {dropdownOpen ? (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                  {filtered.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-slate-400">검색 결과가 없어요.</li>
                  ) : (
                    filtered.map((apt) => (
                      <li key={apt.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setApartmentId(apt.id);
                            setApartmentQuery(apt.name);
                            setDropdownOpen(false);
                          }}
                          className={`block w-full px-4 py-3 text-left text-[15px] ${apt.id === apartmentId ? "bg-dk-sky font-bold text-dk-navy" : "hover:bg-slate-50"}`}
                        >
                          {apt.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <input value={newApartmentName} onChange={(e) => setNewApartmentName(e.target.value)} placeholder="단지명" className="soft-input w-full" required />
              <input value={newApartmentAddress} onChange={(e) => setNewApartmentAddress(e.target.value)} placeholder="단지 주소 (선택)" className="soft-input w-full" />
              <input
                value={newTotalUnits}
                onChange={(e) => setNewTotalUnits(e.target.value)}
                placeholder="예상 세대수"
                inputMode="numeric"
                className="soft-input w-full"
                required
              />
            </div>
          )}
        </div>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className="soft-input w-full" required />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="연락처 (예: 010-1234-5678)" inputMode="tel" className="soft-input w-full" required />
        <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="아이디 (영문/숫자 4~20자)" autoComplete="username" className="soft-input w-full" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호 (8자 이상)" type="password" autoComplete="new-password" className="soft-input w-full" required />
        <input value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="비밀번호 확인" type="password" autoComplete="new-password" className="soft-input w-full" required />

        {message ? <p className="text-sm text-rose-700">{message}</p> : null}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm disabled:opacity-60">
          {loading ? "신청 중..." : "가입 신청"}
        </button>
      </form>
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
