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

export default function HomeClient({ apartments }: Props) {
  return (
    <div className="min-h-screen" style={{ background: "#f0f4f8" }}>
      <header style={{ background: "#0b1c3a" }} className="sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="우리집 전기주치의" className="h-9 w-auto shrink-0" />
            <div className="leading-tight">
              <p className="text-sm font-black text-white tracking-tight">우리집 전기주치의</p>
              <p className="text-[10px] font-bold" style={{ color: "#f0c96a" }}>(대경이엔피)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="tel:01094698578"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
            >
              📞 전화상담
            </a>
            <a
              href="https://open.kakao.com/o/pDTgxCri"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ background: "#FEE500", color: "#1b1b1b" }}
            >
              💬 카톡
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pb-16">
        <div
          className="rounded-2xl mt-4 mb-4 overflow-hidden"
          style={{ background: "linear-gradient(135deg,#0b1c3a 0%,#1a3460 100%)" }}
        >
          <div className="px-5 pt-7 pb-5">
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-4"
              style={{
                background: "rgba(201,146,42,0.18)",
                border: "1px solid rgba(201,146,42,0.35)",
                color: "#f0c96a"
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              광주 아파트 전기 안전 특화
            </div>
            <h1 className="text-2xl font-black text-white leading-tight mb-2">
              우리 집 전기,
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg,#c9922a,#f0c96a)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent"
                }}
              >
                안심하고 맡기세요
              </span>
            </h1>
            <p className="text-sm text-white/55 leading-relaxed mb-5">
              선결제 기반 노쇼 없는 출동 · 디지털 기술 보증서 · 단지별 맞춤 요금. 특허 출원 기술로
              운영합니다.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { n: "14개", l: "특허 청구항" },
                { n: "12개월", l: "기술 보증" },
                { n: "24시간", l: "긴급출동" }
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-xl py-3 text-center"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                >
                  <div className="text-base font-black" style={{ color: "#f0c96a" }}>
                    {s.n}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <a
            href="tel:01094698578"
            className="flex items-center gap-3 px-5 py-4 transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#dc2626,#991b1b)" }}
          >
            <span className="text-xl">🚨</span>
            <div className="flex-1">
              <div className="text-sm font-black text-white">긴급출동</div>
              <div className="text-xs text-white/60">지금 당장 위험하다면 즉시 전화</div>
            </div>
            <span
              className="text-xs font-bold text-white px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              010-9469-8578
            </span>
          </a>
        </div>

        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: "#c9922a" }} />
            <h2 className="text-base font-black" style={{ color: "#0b1c3a" }}>
              단지별 전용 홈
            </h2>
          </div>
          <p className="text-xs mb-4" style={{ color: "#64748b" }}>
            단지 카드를 탭하면 해당 단지 전용 서비스 화면으로 이동합니다.
          </p>
          <div className="space-y-2.5">
            {apartments.map((apt) => (
              <Link
                key={apt.id}
                href={`/apt/${apt.apt_code}`}
                className="flex items-center gap-3 p-4 rounded-xl transition-all active:scale-[0.98]"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: "linear-gradient(135deg,#1a4b8c,#0b1c3a)" }}
                >
                  🏢
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: "#1e293b" }}>
                    {apt.name}
                  </div>
                  <div className="text-xs font-mono mt-0.5" style={{ color: "#94a3b8" }}>
                    dkansim.com/apt/{apt.apt_code}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-xs text-green-600 font-medium">서비스 운영 중</span>
                  </div>
                </div>
                <span className="text-lg" style={{ color: "#c9922a" }}>
                  →
                </span>
              </Link>
            ))}
            {apartments.length === 0 && (
              <div
                className="p-4 rounded-xl text-center text-sm"
                style={{ background: "#f8fafc", color: "#94a3b8" }}
              >
                등록된 단지가 없습니다
              </div>
            )}
            <div
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: "#f8fafc", border: "1px dashed #e2e8f0", opacity: 0.6 }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl bg-slate-100">
                ＋
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-400">단지 추가 예정</div>
                <div className="text-xs text-slate-300 mt-0.5">관리자에게 문의</div>
              </div>
            </div>
          </div>
          <div
            className="mt-4 p-3 rounded-xl text-xs"
            style={{
              background: "rgba(201,146,42,0.08)",
              border: "1px solid rgba(201,146,42,0.2)",
              color: "#92400e"
            }}
          >
            💡 우리 단지가 없으신가요?{" "}
            <a href="tel:01094698578" className="font-bold underline">
              010-9469-8578
            </a>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: "#1a4b8c" }} />
            <h2 className="text-base font-black" style={{ color: "#0b1c3a" }}>
              주요 서비스
            </h2>
          </div>
          <div className="space-y-3">
            {[
              {
                icon: "🚨",
                title: "24시간 긴급출동",
                desc: "스파크·타는 냄새·차단기 반복 하강 등 위험 상황 즉시 대응",
                bg: "#fff5f5"
              },
              {
                icon: "🔧",
                title: "정밀 점검·수리",
                desc: "분전반, 누전, 콘센트, 전등 교체 — 날짜와 증상 접수 후 기술자 방문",
                bg: "#eff6ff"
              },
              {
                icon: "🛡️",
                title: "디지털 기술 보증서",
                desc: "작업 완료 후 고유 보증번호 자동 발급. QR로 진위 확인 가능",
                bg: "#fffbeb"
              },
              {
                icon: "📊",
                title: "전기 안전 자가진단",
                desc: "15문항으로 우리 집 위험도 확인. 결과에 맞는 서비스 안내",
                bg: "#f0fdf4"
              },
              {
                icon: "⚡",
                title: "단지별 맞춤 요금",
                desc: "단지마다 협의된 요금 체계. URL 하나로 전용 화면 자동 설정",
                bg: "#f5f3ff"
              },
              {
                icon: "📋",
                title: "선결제 노쇼 없음",
                desc: "기본 출장비 선결제 확인 후에만 기사 배정. 시스템적 신뢰 보장",
                bg: "#fffbeb"
              }
            ].map((s) => (
              <div key={s.title} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: s.bg }}>
                <div className="text-2xl mt-0.5 shrink-0">{s.icon}</div>
                <div>
                  <div className="text-sm font-bold mb-1" style={{ color: "#1e293b" }}>
                    {s.title}
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                    {s.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: "#c9922a" }} />
            <h2 className="text-base font-black" style={{ color: "#0b1c3a" }}>
              왜 우리집 전기주치의(대경이엔피)인가
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { n: "99%", l: "약속 이행률" },
              { n: "12개월", l: "기술 보증" },
              { n: "24시간", l: "긴급출동" },
              { n: "특허", l: "14개 청구항" }
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl p-4 text-center"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
              >
                <div className="text-lg font-black" style={{ color: "#c9922a" }}>
                  {s.n}
                </div>
                <div className="text-xs mt-1" style={{ color: "#64748b" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[
              {
                t: "특허 기술 기반 플랫폼",
                d: "URL 파라미터 다중 테넌트, 선결제 게이트웨이, 디지털 보증서 발급 — 14개 청구항 특허 출원 완료."
              },
              {
                t: "아파트 단지 전문 기술자",
                d: "공동주택 분전반·세대 배선·공용 전기실 구조를 정확히 이해하는 전문 기술자가 직접 출동."
              },
              {
                t: "투명한 정산과 보증서",
                d: "현장 추가 비용 발생 시 사전 확인 후 정산. 모든 작업에 디지털 기술 보증서 자동 발급."
              }
            ].map((e, i) => (
              <div key={e.t} className="flex gap-3 items-start">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                  style={{ background: "linear-gradient(135deg,#c9922a,#f0c96a)", color: "#0b1c3a" }}
                >
                  {i + 1}
                </div>
                <div>
                  <div className="text-sm font-bold mb-0.5" style={{ color: "#1e293b" }}>
                    {e.t}
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                    {e.d}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-5 mb-4" style={{ background: "linear-gradient(135deg,#0b1c3a,#1a3460)" }}>
          <h2 className="text-base font-black text-white mb-1">📞 언제든 연락주세요</h2>
          <p className="text-xs text-white/50 mb-4">점검 문의·예약·긴급 출동 모두 가능합니다</p>
          <div className="space-y-2.5">
            <a
              href="tel:01094698578"
              className="flex items-center gap-3 w-full p-4 rounded-xl text-left transition-all active:scale-[0.98]"
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <span className="text-xl">📞</span>
              <div>
                <div className="text-sm font-bold text-white">010-9469-8578</div>
                <div className="text-xs text-white/40">전화 통화</div>
              </div>
            </a>
            <a
              href="https://open.kakao.com/o/pDTgxCri"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 w-full p-4 rounded-xl text-left transition-all active:scale-[0.98]"
              style={{ background: "#FEE500" }}
            >
              <span className="text-xl">💬</span>
              <div>
                <div className="text-sm font-bold" style={{ color: "#1b1b1b" }}>
                  카카오톡 채널 상담
                </div>
                <div className="text-xs" style={{ color: "rgba(0,0,0,0.5)" }}>
                  메시지로 편하게 문의
                </div>
              </div>
            </a>
          </div>
        </div>

        <div className="pt-4 pb-2 text-center" style={{ color: "#94a3b8" }}>
          <div className="text-xs font-bold mb-1" style={{ color: "#c9922a" }}>
            ⚡ 우리집 전기주치의(대경이엔피)
          </div>
          <div className="text-xs leading-relaxed mb-2">
            광주광역시 · 브랜드: 우리집 안심전기
            <br />
            대표: 나경문 · 010-9469-8578
          </div>
          <div className="text-xs">© 2026 우리집 전기주치의(대경이엔피). 특허 출원 완료</div>
        </div>
      </div>
    </div>
  );
}
