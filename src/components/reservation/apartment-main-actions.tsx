"use client";

import Image from "next/image";
import PartnerWorkCarousel from "@/components/reservation/partner-work-carousel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { siteConfig } from "@/lib/site-config";

type ApartmentInfo = {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
};

export type ApartmentUrlProfile = {
  dong: string;
  ho: string;
  name: string;
  phone: string;
};

export type ElectricalTipPublic = {
  id: string;
  category: string;
  title: string;
  summary: string;
  content: string;
  service_type: string | null;
};

type Props = {
  apartment: ApartmentInfo;
  /** 서버에서 읽은 쿼리(클라이언트 `useSearchParams` 지연·CSR 펜딩으로 클릭이 먹지 않는 문제 방지) */
  urlProfile: ApartmentUrlProfile;
  /** 발행된 생활전기정보(아파트 홈 상단에서 서버 조회) */
  electricalTips?: ElectricalTipPublic[];
};

type RequestKind = "repair" | "emergency";

const requestConfig: Record<RequestKind, { title: string; href: string; tone: string }> = {
  repair: { title: "점검/수리", href: "repair", tone: "from-[#6d93a8] to-[#4a6575]" },
  emergency: { title: "긴급출동", href: "emergency", tone: "from-[#df8068] to-[#a85d48]" }
};

const TIP_CATEGORY_LABEL: Record<string, string> = {
  safety: "안전",
  saving: "절약",
  selfcheck: "자가점검",
  seasonal: "계절별"
};

/** 출장비·정밀진단 → 기타점검 플로우, 그 외 → 점검/수리 */
function serviceTypeToBookingSubpath(serviceType: string | null): "repair" | "etc-check" {
  if (!serviceType) return "repair";
  if (serviceType === "VISIT" || serviceType === "DIAGNOSIS") return "etc-check";
  return "repair";
}

function tipBadgeClass(category: string) {
  switch (category) {
    case "safety":
      return "bg-red-50 text-red-700";
    case "saving":
      return "bg-green-50 text-green-700";
    case "selfcheck":
      return "bg-blue-50 text-blue-700";
    case "seasonal":
      return "bg-orange-50 text-orange-700";
    default:
      return "bg-slate-50 text-slate-700";
  }
}

export default function ApartmentMainActions({ apartment, urlProfile, electricalTips = [] }: Props) {
  const [modalKind, setModalKind] = useState<RequestKind | null>(null);
  const [consultModalOpen, setConsultModalOpen] = useState(false);
  const [tipDetail, setTipDetail] = useState<ElectricalTipPublic | null>(null);
  const [dong, setDong] = useState(urlProfile.dong);
  const [ho, setHo] = useState(urlProfile.ho);
  const [name, setName] = useState(urlProfile.name);
  const [phone, setPhone] = useState(urlProfile.phone);
  const [requestMessage, setRequestMessage] = useState("");
  const businessPhone = siteConfig.businessPhone.replaceAll(/[^0-9+]/g, "");
  const kakaoOpenChatUrl = useMemo(() => {
    try {
      const url = new URL(siteConfig.kakaoOpenChatUrl);
      url.searchParams.set("apt", apartment.name);
      return url.toString();
    } catch {
      return siteConfig.kakaoOpenChatUrl;
    }
  }, [apartment.name]);

  const isValidName = (value: string) => /^[\p{L}\s]+$/u.test(value.trim());
  const isValidPhone = (value: string) => /^\d{11}$/.test(value.trim());
  const canMove = useMemo(
    () => Boolean(dong.trim() && ho.trim() && isValidName(name) && isValidPhone(phone)),
    [dong, ho, name, phone]
  );
  const profileStorageKey = `dk-safety:request-profile:${apartment.code}`;
  const globalProfileStorageKey = "dk-safety:request-profile:global";

  const moveHrefFor = useCallback(
    (kind: RequestKind) => {
      const params = new URLSearchParams({
        dong: dong.trim(),
        ho: ho.trim(),
        name: name.trim(),
        phone: phone.trim()
      });
      return `/apt/${encodeURIComponent(apartment.code)}/${requestConfig[kind].href}?${params.toString()}`;
    },
    [apartment.code, dong, ho, name, phone]
  );

  const bookingHrefForSubpath = useCallback(
    (subpath: "repair" | "etc-check") => {
      const params = new URLSearchParams({
        dong: dong.trim(),
        ho: ho.trim(),
        name: name.trim(),
        phone: phone.trim()
      });
      return `/apt/${encodeURIComponent(apartment.code)}/${subpath}?${params.toString()}`;
    },
    [apartment.code, dong, ho, name, phone]
  );

  const urlSeeded = Boolean(urlProfile.dong || urlProfile.ho || urlProfile.name || urlProfile.phone);

  useEffect(() => {
    if (urlSeeded) return;
    try {
      const raw = window.sessionStorage.getItem(profileStorageKey);
      const globalRaw = window.sessionStorage.getItem(globalProfileStorageKey);
      const source = raw || globalRaw;
      if (!source) return;
      const parsed = JSON.parse(source) as { dong?: string; ho?: string; name?: string; phone?: string };
      if (parsed.dong) setDong(String(parsed.dong).replaceAll(/[^0-9]/g, ""));
      if (parsed.ho) setHo(String(parsed.ho).replaceAll(/[^0-9]/g, ""));
      if (parsed.name) setName(String(parsed.name));
      if (parsed.phone) setPhone(String(parsed.phone).replaceAll(/[^0-9]/g, "").slice(0, 11));
    } catch {
      // ignore parse/storage errors
    }
  }, [profileStorageKey, urlSeeded]);

  useEffect(() => {
    if (!dong && !ho && !name && !phone) return;
    try {
      window.sessionStorage.setItem(
        profileStorageKey,
        JSON.stringify({
          dong: dong.trim(),
          ho: ho.trim(),
          name: name.trim(),
          phone: phone.trim()
        })
      );
      window.sessionStorage.setItem(
        globalProfileStorageKey,
        JSON.stringify({
          dong: dong.trim(),
          ho: ho.trim(),
          name: name.trim(),
          phone: phone.trim()
        })
      );
    } catch {
      // ignore storage quota/private mode errors
    }
  }, [dong, ho, name, phone, profileStorageKey, globalProfileStorageKey]);

  useEffect(() => {
    if (!tipDetail) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [tipDetail]);

  const startRequest = (kind: RequestKind) => {
    setRequestMessage("");
    if (canMove) {
      window.location.assign(moveHrefFor(kind));
      return;
    }
    setModalKind(kind);
  };

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 pb-8">
      <section className="warranty-band relative overflow-hidden rounded-[1.75rem] p-5">
        <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/15 blur-2xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          {apartment.logoUrl ? (
            <Image
              src={apartment.logoUrl}
              alt={`${apartment.name} 로고`}
              width={64}
              height={64}
              className="h-16 w-16 rounded-2xl bg-white/95 p-1.5 object-contain shadow-md"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/95 text-2xl shadow-md">🏢</div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-snug tracking-tight text-slate-900">대경안심전기 · {apartment.name}</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{apartment.name} 입주민 전용 전기 안전 서비스</p>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => startRequest("repair")}
            className="inline-flex h-14 items-center justify-center rounded-xl bg-white/95 px-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-white"
          >
            🔧 점검·수리
          </button>
          <button
            type="button"
            onClick={() => window.location.assign(`/resident/safety-check?tenant=${encodeURIComponent(apartment.code)}`)}
            className="inline-flex h-14 items-center justify-center rounded-xl bg-white/95 px-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-white"
          >
            🛡️ 자가진단
          </button>
          <button
            type="button"
            onClick={() => setConsultModalOpen(true)}
            className="inline-flex h-14 items-center justify-center rounded-xl bg-white/95 px-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-white"
          >
            💬 상담
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={() => startRequest("emergency")}
        className="w-full rounded-2xl bg-gradient-to-r from-[#c0392b] to-[#922b21] p-4 text-left text-white shadow-[0_14px_36px_rgba(146,43,33,0.35)] transition hover:brightness-105"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold">🚨 긴급출동</p>
            <p className="mt-0.5 text-sm text-white/90">지금 당장 위험하다면</p>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">즉시 접수 →</span>
        </div>
      </button>

      {electricalTips.length > 0 ? (
        <section className="partner-panel-glass relative z-[1] border-t border-slate-200/90 p-4 sm:p-5 dark:border-slate-600/80">
          <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm dark:border-slate-600 dark:bg-slate-900/60">
            <p className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-50">💡 생활전기정보</p>
            <p className="mt-1 text-sm font-medium leading-snug text-slate-600 dark:text-slate-400">대경안심전기가 알려드리는 전기 안전</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {electricalTips.slice(0, 4).map((tip) => (
              <article
                key={tip.id}
                role="button"
                tabIndex={0}
                onClick={() => setTipDetail(tip)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setTipDetail(tip);
                  }
                }}
                className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-950 dark:hover:border-slate-500"
              >
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tipBadgeClass(tip.category)}`}>
                  {TIP_CATEGORY_LABEL[tip.category] ?? tip.category}
                </span>
                <h2 className="mt-2 line-clamp-2 text-base font-extrabold leading-snug text-slate-900 dark:text-slate-50">{tip.title}</h2>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{tip.summary}</p>
                <span className="mt-3 inline-flex text-xs font-bold text-[#4a6575] dark:text-[#8eb4c9]">더보기 →</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <PartnerWorkCarousel />

      <button
        type="button"
        onClick={() => setConsultModalOpen(true)}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left shadow-sm transition hover:bg-slate-100"
      >
        <span className="text-base font-bold text-slate-800">💬 전화 · 카카오톡 상담</span>
        <span className="text-lg font-bold text-slate-500">→</span>
      </button>

      {modalKind ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <p className="text-sm font-bold text-slate-500">이동 전 4가지만 입력</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">{requestConfig[modalKind].title} 접수 정보</h2>
            <div className="mt-3 grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={dong}
                  onChange={(e) => setDong(e.target.value.replaceAll(/[^0-9]/g, ""))}
                  placeholder="동 번호"
                  className="h-12 rounded-xl border border-slate-300 px-3 text-base"
                />
                <input
                  value={ho}
                  onChange={(e) => setHo(e.target.value.replaceAll(/[^0-9]/g, ""))}
                  placeholder="호수 번호"
                  className="h-12 rounded-xl border border-slate-300 px-3 text-base"
                />
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="성명 (한글/영문)"
                className="h-12 rounded-xl border border-slate-300 px-3 text-base"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replaceAll(/[^0-9]/g, "").slice(0, 11))}
                placeholder="휴대폰 11자리 (숫자만)"
                className="h-12 rounded-xl border border-slate-300 px-3 text-base"
              />
            </div>
            {requestMessage ? <p className="mt-2 text-sm font-semibold text-rose-600">{requestMessage}</p> : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRequestMessage("");
                  setModalKind(null);
                }}
                className="h-12 rounded-xl border border-slate-300 text-sm font-bold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!dong.trim() || !ho.trim() || !name.trim() || !phone.trim()) {
                    setRequestMessage("동/호수/성함/휴대폰 번호를 모두 입력해주세요.");
                    return;
                  }
                  if (!isValidName(name)) {
                    setRequestMessage("성함은 한글 또는 영문만 입력 가능합니다.");
                    return;
                  }
                  if (!isValidPhone(phone)) {
                    setRequestMessage("휴대폰 번호는 숫자 11자리만 입력 가능합니다.");
                    return;
                  }
                  setRequestMessage("");
                  window.location.assign(moveHrefFor(modalKind));
                }}
                className={`inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r text-sm font-extrabold text-white ${
                  canMove ? requestConfig[modalKind].tone : "from-slate-300 to-slate-400"
                }`}
              >
                이동하기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tipDetail ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] cursor-default bg-slate-950/45"
            aria-label="닫기"
            onClick={() => setTipDetail(null)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[61] max-h-[88vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-950"
            role="dialog"
            aria-modal="true"
            aria-labelledby="electrical-tip-detail-title"
          >
            <div className="mx-auto max-w-lg px-5 pb-8 pt-4">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-start justify-between gap-3">
                <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tipBadgeClass(tipDetail.category)}`}>
                  {TIP_CATEGORY_LABEL[tipDetail.category] ?? tipDetail.category}
                </span>
                <button
                  type="button"
                  onClick={() => setTipDetail(null)}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  닫기
                </button>
              </div>
              <h2 id="electrical-tip-detail-title" className="mt-3 text-xl font-extrabold leading-snug tracking-tight text-slate-900 dark:text-slate-50">
                {tipDetail.title}
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">{tipDetail.summary}</p>
              <div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 text-sm leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                {tipDetail.content}
              </div>
              {tipDetail.service_type ? (
                <a
                  href={bookingHrefForSubpath(serviceTypeToBookingSubpath(tipDetail.service_type))}
                  className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#6d93a8] to-[#4a6575] text-base font-extrabold text-[#fffefc] shadow-[0_10px_26px_rgba(74,101,117,0.28)]"
                >
                  전문가에게 점검 받기
                </a>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {consultModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <p className="text-sm font-bold text-slate-500">상담 방식 선택</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">전화/카톡 상담</h2>
            <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">현재 단지: {apartment.name}</p>
            <div className="mt-4 grid gap-2">
              <a
                href={`tel:${businessPhone}`}
                className="inline-flex h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-[#cf6b4e] to-[#b8573d] text-base font-bold text-[#fffefc] shadow-[0_10px_26px_rgba(207,107,78,0.28)]"
              >
                전화상담 연결
              </a>
              <a
                href={kakaoOpenChatUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-14 items-center justify-center rounded-2xl border-2 border-[#ead9c8] bg-[#fffbf7] text-base font-bold text-[#4d4039] shadow-sm transition hover:bg-[#fff5eb]"
              >
                카톡상담 채팅방 이동
              </a>
            </div>
            <button type="button" onClick={() => setConsultModalOpen(false)} className="mt-3 h-12 w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-700">
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
