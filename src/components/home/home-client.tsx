"use client";

import Link from "next/link";

interface Apartment {
  id: string;
  name: string;
  apt_code: string;
  logo_url?: string | null;
}

interface Props {
  apartments: Apartment[];
}

const SYMPTOMS = [
  { icon: "💥", text: "갑자기 차단기가 내려가요" },
  { icon: "🔥", text: "콘센트에서 탄 냄새가 나요" },
  { icon: "💡", text: "전등이 자꾸 깜빡거려요" },
  { icon: "📈", text: "전기요금이 갑자기 올랐어요" }
];

const TRUST_ITEMS = ["🏅 전기기사 자격", "⚡ 24시간 출동", "📄 디지털 보증서", "⭐ 특허 기술"];

const FLOW_STEPS = [
  { icon: "1️⃣", label: "예약" },
  { icon: "2️⃣", label: "방문 점검" },
  { icon: "3️⃣", label: "리포트 받기" }
];

export default function HomeClient({ apartments }: Props) {
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
        <section className="rounded-3xl bg-dk-navy p-6 text-center text-white">
          <p className="text-5xl">⚡</p>
          <h1 className="mt-3 text-[28px] font-bold leading-tight">
            우리집 전기
            <br />
            걱정되시나요?
          </h1>
          <p className="mt-2 text-[15px] text-white/70">전기기사가 직접 방문해서 해결해드립니다</p>

          <div className="mt-5 space-y-2.5">
            <a
              href="#apartments"
              className="flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-dk-blue text-lg font-bold text-white shadow-[0_10px_28px_rgba(26,92,255,0.4)]"
            >
              🔴 지금 점검 예약하기
            </a>
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
          <a
            href="#apartments"
            className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-dk-red text-base font-bold text-white"
          >
            지금 예약하기
          </a>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-[0_4px_16px_rgba(11,31,58,0.08)]">
          <h2 className="text-lg font-bold text-dk-navy">서비스 흐름</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {FLOW_STEPS.map((step) => (
              <div key={step.label}>
                <p className="text-3xl">{step.icon}</p>
                <p className="mt-1.5 text-[13px] font-bold text-slate-700">{step.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="apartments" className="rounded-2xl bg-white p-5 shadow-[0_4px_16px_rgba(11,31,58,0.08)]">
          <h2 className="text-lg font-bold text-dk-navy">단지별 전용 홈</h2>
          <p className="mt-1 text-[13px] text-slate-500">단지 카드를 탭하면 해당 단지 전용 서비스 화면으로 이동합니다.</p>
          <div className="mt-3 space-y-2.5">
            {apartments.map((apt) => (
              <Link
                key={apt.id}
                href={`/apt/${apt.apt_code}`}
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
            {apartments.length === 0 ? (
              <div className="rounded-2xl bg-dk-gray p-4 text-center text-sm text-slate-400">등록된 단지가 없습니다</div>
            ) : null}
          </div>
          <p className="mt-3 text-center text-[13px] text-slate-500">
            우리 단지가 없으신가요?{" "}
            <a href="tel:01094698578" className="font-bold text-dk-blue underline">
              010-9469-8578
            </a>
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
        <a
          href="#apartments"
          className="mx-auto flex min-h-14 max-w-lg items-center justify-center gap-2 rounded-2xl bg-dk-blue text-base font-bold text-white shadow-[0_8px_20px_rgba(26,92,255,0.28)]"
        >
          예약하기
        </a>
      </div>
    </div>
  );
}
