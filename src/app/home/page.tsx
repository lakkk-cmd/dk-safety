import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { RESIDENT_AUTH_COOKIE, siteConfig } from "@/lib/site-config";
import ResidentWelcomeBanner from "@/components/resident/resident-welcome-banner";
import { BoltIcon, ChatIcon, PhoneIcon, ShieldIcon } from "@/components/ui/icons";

const toLoginWithNext = (path: string) => `/resident/login?next=${encodeURIComponent(path)}`;

const featuredProjects = [
  {
    title: "입주민 전기 안전 자가진단",
    description: "15문항 점검 설문으로 위험도를 빠르게 확인하고 결과를 이력으로 저장합니다.",
    href: toLoginWithNext("/resident/safety-check"),
    cta: "자가진단 시작"
  },
  {
    title: "전기 점검 예약 접수",
    description: "희망 날짜와 증상을 남기면 전기 주치의가 배정되어 방문 일정을 안내합니다.",
    href: "/reservation",
    cta: "점검 예약하기"
  },
  {
    title: "긴급출동 실시간 요청",
    description: "스파크·타는 냄새·차단기 반복 하강 상황에서 즉시 출동 요청이 가능합니다.",
    href: "#emergency",
    cta: "긴급 대응 보기"
  }
];

const processSteps = [
  "문제 증상 입력 또는 자가진단 진행",
  "긴급도 기반으로 자동 분류 및 접수",
  "담당 기술자 배정 후 일정 확정",
  "처리 결과 기록 및 재발 방지 안내"
];

export default async function MainHomePage() {
  const businessPhone = siteConfig.businessPhone.replaceAll("-", "");
  const cookieStore = await cookies();
  const isResidentLoggedIn = Boolean(cookieStore.get(RESIDENT_AUTH_COOKIE)?.value);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:py-14">
      <ResidentWelcomeBanner />

      <header className="surface-editorial overflow-hidden rounded-[2rem] p-7 md:p-10">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div className="relative">
            <p className="section-kicker">전기 안전 서비스</p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] text-slate-950 md:text-5xl">
              <span className="inline-block whitespace-nowrap">우리집 프로젝트를 위한</span>
              <br />
              전기 안전 플랫폼
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
              디자인과 사용성을 동시에 강화해, 접수부터 출동까지 한 화면에서 자연스럽게 연결되는
              운영 경험을 제공합니다.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/reservation" className="btn-primary inline-flex items-center px-5 py-3 text-sm">
                점검 예약 시작
              </Link>
              {!isResidentLoggedIn ? (
                <Link href={toLoginWithNext("/resident/safety-check")} className="btn-outline inline-flex items-center px-5 py-3 text-sm">
                  입주민 로그인
                </Link>
              ) : null}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_30px_65px_rgba(15,23,42,0.15)]">
            <Image src="/logo-daekyung.png" alt="대경안심전기 로고" width={560} height={280} priority className="mx-auto h-auto w-1/2 rounded-2xl object-contain" />
            <p className="mt-3 text-center text-sm font-bold text-slate-800">우리집전기 주치의</p>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <p className="info-chip w-fit">24시간 상담</p>
              <p className="info-chip w-fit">실시간 긴급출동</p>
              <p className="info-chip w-fit">점검 결과 히스토리</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="section-kicker">주요 서비스</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">핵심 기능 영역</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featuredProjects.map((service, idx) => (
            <article key={service.title} className="surface-card-strong rounded-2xl p-5">
            <span className="icon-dot mb-3">
              {idx === 0 ? <BoltIcon className="h-3.5 w-3.5" /> : idx === 1 ? <ShieldIcon className="h-3.5 w-3.5" /> : "✓"}
            </span>
            <h2 className="text-lg font-semibold">{service.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{service.description}</p>
            <div className="mt-5">
              <Link href={service.href} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                {service.cta}
              </Link>
            </div>
          </article>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-blue-700 p-8 text-white shadow-[0_16px_40px_rgba(10,94,176,0.35)]">
          <h3 className="text-2xl font-bold">예약부터 방문까지 간단하게</h3>
          <p className="mt-2 text-blue-100">희망 날짜와 증상을 남기면 전기 주치의가 빠르게 연락드립니다.</p>
          <ol className="mt-5 grid gap-2 text-sm text-blue-50">
            {processSteps.map((step) => (
              <li key={step} className="rounded-lg border border-white/25 bg-white/10 px-3 py-2">
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/reservation"
              className="inline-flex items-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              전기 점검 예약하기
            </Link>
            <a
              href={`tel:${businessPhone}`}
              className="inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary"
            >
              <PhoneIcon className="mr-1 h-4 w-4" />
              전화 문의
            </a>
            <a
              href={siteConfig.kakaoOpenChatUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl border border-white/50 px-5 py-3 text-sm font-semibold text-white"
            >
              <ChatIcon className="mr-1 h-4 w-4" />
              카카오톡 상담
            </a>
          </div>
        </div>
        <div id="emergency" className="surface-card-strong rounded-3xl p-6">
          <p className="section-kicker w-fit">긴급</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">전기 긴급 출동</h3>
          <p className="mt-2 text-sm text-slate-600">
            스파크·타는 냄새·차단기 반복 하강 등 위험 상황에서는 즉시 요청해 주세요.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <Link
              href="/emergency"
              className="btn-primary inline-flex items-center justify-center px-5 py-3 text-center text-sm font-semibold"
            >
              긴급 출동 요청하기
            </Link>
            <a
              href={`tel:${businessPhone}`}
              className="btn-outline inline-flex items-center justify-center px-5 py-3 text-center text-sm font-semibold"
            >
              <PhoneIcon className="mr-2 h-4 w-4" />
              전화로 알리기
            </a>
          </div>
        </div>
      </section>

      <section className="surface-card-strong mt-8 rounded-3xl p-8">
        <h3 className="text-2xl font-bold text-slate-900">입주민 전기 안전 자가진단</h3>
        <p className="mt-2 text-slate-600">
          아파트 입주민이 직접 차단기 노후화, 콘센트 스파크 위험을 15문항으로 점검하고 결과를 저장할 수 있습니다.
        </p>
        <div className="mt-5">
          <Link
            href={toLoginWithNext("/resident/safety-check")}
            className="btn-primary inline-flex items-center px-6 py-3 text-base shadow-[0_12px_24px_rgba(29,78,216,0.35)] ring-2 ring-blue-200"
          >
            전기 안전 자가진단 시작하기
          </Link>
        </div>
      </section>
    </main>
  );
}
