"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";

interface Apartment {
  id: string;
  name: string;
  apt_code: string;
  logo_url?: string | null;
}

interface Props {
  apartments: Apartment[];
  config?: Record<string, string>;
  apkUrl?: string | null;
}

const SYMPTOMS = [
  { icon: "💥", text: "갑자기 차단기가 내려가요" },
  { icon: "🔥", text: "콘센트에서 탄 냄새가 나요" },
  { icon: "💡", text: "전등이 자꾸 깜빡거려요" },
  { icon: "📈", text: "전기요금이 갑자기 올랐어요" }
];

const TRUST_ITEMS = ["🏅 전기기사 자격", "⚡ 24시간 출동", "📄 디지털 보증서", "⭐ 특허 기술", "💰 150,000원~"];

export default function HomeClient({ apartments, config = {}, apkUrl }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredApartments = useMemo(() => {
    const q = search.trim();
    if (!q) return apartments;
    return apartments.filter((apt) => apt.name.includes(q));
  }, [apartments, search]);

  const heroTitle = config.hero_title ?? "우리집 전기 걱정되시나요?";
  const heroSubtitle = config.hero_subtitle ?? "전기기사가 직접 방문해서 해결해드립니다";
  const heroCta = config.hero_cta ?? "🔴 지금 점검 예약하기";
  const bottomCta = config.bottom_cta ?? "예약하기";
  const noticeActive = config.notice_active === "true";
  const noticeText = config.notice_text ?? "";
  const seasonBannerActive = config.season_banner === "true";
  const seasonBannerText = config.season_banner_text ?? "";

  return (
    <div className="min-h-screen bg-dk-gray pb-24">
      <header className="sticky top-0 z-50 bg-dk-navy">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="우리집 전기주치의" className="h-9 w-auto shrink-0" />
            <p className="text-[15px] font-bold tracking-tight text-white">우리집 전기주치의</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="tel:01094698578"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg"
              aria-label="전화상담"
            >
              📞
            </a>
            <a
              href="https://open.kakao.com/o/pDTgxCri"
              target="_blank"
              rel="noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEE500] text-lg"
              aria-label="카카오톡 상담"
            >
              💬
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        {apkUrl ? (
          <a
            href={apkUrl}
            className="flex items-center justify-center gap-2 rounded-2xl border border-dk-navy/15 bg-white px-4 py-3 text-center text-sm font-bold text-dk-navy"
          >
            📱 안드로이드 앱 다운로드(APK)
          </a>
        ) : null}
        {noticeActive && noticeText ? (
          <div className="rounded-2xl bg-dk-gold/20 px-4 py-3 text-center text-sm font-bold text-dk-navy">
            📢 {noticeText}
          </div>
        ) : null}
        {seasonBannerActive && seasonBannerText ? (
          <div className="rounded-2xl bg-dk-blue/10 px-4 py-3 text-center text-sm font-bold text-dk-blue">
            🌟 {seasonBannerText}
          </div>
        ) : null}

        <section className="rounded-3xl bg-dk-navy p-6 text-center text-white">
          <p className="text-5xl">⚡</p>
          <h1 className="mt-3 text-[28px] font-bold leading-tight">{heroTitle}</h1>
          <p className="mt-2 text-[15px] text-white/70">{heroSubtitle}</p>

          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-dk-blue text-lg font-bold text-white shadow-[0_10px_28px_rgba(26,92,255,0.4)]"
            >
              {heroCta}
            </button>
            <Link
              href="/status"
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-white/70 text-base font-bold text-white"
            >
              📋 내 점검 결과 보기
            </Link>
          </div>
        </section>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {TRUST_ITEMS.map((item) => (
            <span key={item} className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-dk-navy shadow-sm">
              {item}
            </span>
          ))}
        </div>

        <section className="rounded-2xl bg-white p-5 shadow-[0_4px_16px_rgba(11,31,58,0.08)]">
          <h2 className="text-lg font-bold text-dk-navy">이런 증상 있으신가요?</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {SYMPTOMS.map((s) => (
              <div key={s.text} className="rounded-2xl bg-dk-sky p-3 text-center">
                <p className="text-2xl">{s.icon}</p>
                <p className="mt-1.5 text-[13px] font-semibold leading-snug text-dk-navy">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[13px] text-slate-500">하나라도 해당되면 → 지금 바로 예약</p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-dk-red text-base font-bold text-white"
          >
            지금 예약하기
          </button>
        </section>

        <section className="rounded-2xl bg-dk-sky p-5 text-center">
          <p className="text-4xl">👨‍🔧</p>
          <h2 className="mt-2 text-lg font-bold text-dk-navy">우리는 어떤 회사예요?</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
            평소엔 아파트에서 전기를 관리하는 진짜 전기기사가, 저녁이나 주말에 우리 집으로
            직접 찾아가서 위험한 전기 문제를 봐드리는 회사예요.
            <br />
            자격증이 있는 사람이 직접 오니까 안심하고 맡기실 수 있어요.
          </p>
        </section>

        <footer className="pb-2 pt-2 text-center text-xs text-slate-400">
          <p className="font-bold text-dk-gold">⚡ 우리집 전기주치의(대경이엔피)</p>
          <p className="mt-1 leading-relaxed">
            광주광역시 · 대표: 나경문 · 010-9469-8578
            <br />© 2026 우리집 전기주치의(대경이엔피). 특허 출원 완료
          </p>
        </footer>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mx-auto flex min-h-14 max-w-lg items-center justify-center gap-2 rounded-2xl bg-dk-blue text-base font-bold text-white shadow-[0_8px_20px_rgba(26,92,255,0.28)]"
        >
          {bottomCta}
        </button>
      </div>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="우리 단지 찾기">
        <p className="text-[13px] text-slate-500">
          목록에 있는 단지는 바로 예약할 수 있어요. 안 보이셔도 광주 시내라면 대부분 방문 가능하니 아래 번호로 문의해주세요.
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="아파트 이름으로 검색"
          className="soft-input mt-3 w-full text-base"
        />
        <div className="mt-3 max-h-[50vh] space-y-2.5 overflow-y-auto">
          {filteredApartments.map((apt) => (
            <Link
              key={apt.id}
              href={`/apt/${apt.apt_code}`}
              onClick={() => setPickerOpen(false)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-dk-gray p-4 transition active:scale-[0.98]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dk-navy text-xl">🏢</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-slate-800">{apt.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-400">dkansim.com/apt/{apt.apt_code}</p>
              </div>
              <span className="text-lg text-dk-gold">→</span>
            </Link>
          ))}
          {filteredApartments.length === 0 ? (
            <div className="rounded-2xl bg-dk-gray p-4 text-center text-sm text-slate-400">
              {apartments.length === 0 ? "등록된 단지가 없습니다" : "검색 결과가 없어요"}
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-center text-[13px] text-slate-500">
          우리 단지가 없으신가요?{" "}
          <a href="tel:01094698578" className="font-bold text-dk-blue underline">
            010-9469-8578
          </a>
        </p>
      </BottomSheet>
    </div>
  );
}
