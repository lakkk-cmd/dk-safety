"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

type SectorScore = {
  id: string;
  title: string;
  score: number;
  answeredCount: number;
  questionCount: number;
};

type DiagnosisResultPayload = {
  riskScore: number;
  summary: string;
  sectorScores: SectorScore[];
};

const resultStorageKey = "resident-diagnosis-result-v1";

const sectorComment = (sector: SectorScore) => {
  if (sector.score >= 75) {
    if (sector.id === "breaker") return "차단기·분전반 섹터에서 고위험 징후가 다수 확인되어 긴급 안전점검이 권고됩니다.";
    if (sector.id === "outlet") return "콘센트·배선 섹터에서 과열·스파크 관련 고위험 응답이 집중되어 즉시 조치가 필요합니다.";
    return "생활 습관·환경 섹터에서 감전·화재 연계 가능성이 높은 고위험 패턴이 확인되었습니다.";
  }
  if (sector.score >= 45) {
    if (sector.id === "breaker") return "차단기·분전반 섹터에서 주의 신호가 반복되어 예방 중심의 정밀 점검이 권장됩니다.";
    if (sector.id === "outlet") return "콘센트·배선 섹터에서 잠재 위험 응답이 누적되어 선제 점검이 필요합니다.";
    return "생활 습관·환경 섹터에서 위험 가능성을 높이는 사용 패턴이 일부 확인되었습니다.";
  }
  if (sector.id === "breaker") return "차단기·분전반 섹터는 현재 기준에서 구조적 위험 신호가 낮은 수준으로 평가됩니다.";
  if (sector.id === "outlet") return "콘센트·배선 섹터는 현재 기준에서 사용 중 위험 지표가 낮은 상태로 확인됩니다.";
  return "생활 습관·환경 섹터는 현재 기준에서 전반적으로 안정적인 관리 수준으로 평가됩니다.";
};

function ResidentSafetyResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<DiagnosisResultPayload | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveMessage, setMoveMessage] = useState("");
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [homeLoading, setHomeLoading] = useState(false);
  const [requestModal, setRequestModal] = useState<null | "repair" | "emergency">(null);
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const tenant = searchParams.get("tenant")?.trim();
  const requestProfileStorageKey = useMemo(
    () => `dk-safety:request-profile:${tenant && tenant.length > 0 ? tenant : "common"}`,
    [tenant]
  );
  const globalProfileStorageKey = "dk-safety:request-profile:global";
  const isValidName = (value: string) => /^[\p{L}\s]+$/u.test(value.trim());
  const isValidPhone = (value: string) => /^\d{11}$/.test(value.trim());

  const resolveApartmentCode = async () => {
    if (tenant) return tenant;
    const response = await fetch("/api/resident/apartments", { cache: "no-store" });
    if (!response.ok) throw new Error("아파트 정보를 불러오지 못했습니다.");
    const data = (await response.json()) as { apartments?: Array<{ code?: string }> };
    const fallbackCode = data.apartments?.find((item) => typeof item.code === "string" && item.code.trim())?.code?.trim();
    if (!fallbackCode) throw new Error("이동 가능한 아파트 코드가 없습니다. 관리자에게 문의해주세요.");
    return fallbackCode;
  };

  const openRequestModal = (mode: "repair" | "emergency") => {
    setMoveMessage("");
    if (moveLoading || emergencyLoading || homeLoading) return;
    setRequestModal(mode);
  };

  const submitRequestModal = async () => {
    if (!requestModal) return;
    if (!dong.trim() || !ho.trim() || !name.trim() || !phone.trim()) {
      setMoveMessage("동/호수/성명/연락처를 모두 입력해주세요.");
      return;
    }
    if (!isValidName(name)) {
      setMoveMessage("성함은 한글 또는 영문만 입력 가능합니다.");
      return;
    }
    if (!isValidPhone(phone)) {
      setMoveMessage("휴대폰 번호는 숫자 11자리만 입력 가능합니다.");
      return;
    }
    setMoveMessage("");
    if (moveLoading || emergencyLoading || homeLoading) return;
    if (requestModal === "repair") {
      setMoveLoading(true);
    } else {
      setEmergencyLoading(true);
    }
    try {
      const aptCode = await resolveApartmentCode();
      const params = new URLSearchParams({
        dong: dong.trim(),
        ho: ho.trim(),
        name: name.trim(),
        phone: phone.trim()
      });
      const targetPath = requestModal === "repair" ? `/apt/${encodeURIComponent(aptCode)}/repair` : `/apt/${encodeURIComponent(aptCode)}/emergency`;
      router.push(`${targetPath}?${params.toString()}`);
      setRequestModal(null);
    } catch (error) {
      setMoveMessage(
        error instanceof Error
          ? error.message
          : requestModal === "repair"
            ? "점검/수리 페이지로 이동하지 못했습니다."
            : "긴급출동 페이지로 이동하지 못했습니다."
      );
      if (requestModal === "repair") {
        setMoveLoading(false);
      } else {
        setEmergencyLoading(false);
      }
    }
  };

  const moveToHomePage = async () => {
    setMoveMessage("");
    if (moveLoading || emergencyLoading || homeLoading) return;
    setHomeLoading(true);
    try {
      const aptCode = await resolveApartmentCode();
      router.push(`/apt/${encodeURIComponent(aptCode)}`);
    } catch {
      router.push("/home");
    }
  };

  useEffect(() => {
    const raw = window.sessionStorage.getItem(resultStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as DiagnosisResultPayload;
      if (typeof parsed.riskScore === "number" && typeof parsed.summary === "string" && Array.isArray(parsed.sectorScores)) {
        setResult(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const qDong = (searchParams.get("dong") ?? "").replaceAll(/[^0-9]/g, "");
    const qHo = (searchParams.get("ho") ?? "").replaceAll(/[^0-9]/g, "");
    const qName = (searchParams.get("name") ?? "").trim();
    const qPhone = (searchParams.get("phone") ?? "").replaceAll(/[^0-9]/g, "").slice(0, 11);
    if (qDong || qHo || qName || qPhone) {
      setDong(qDong);
      setHo(qHo);
      setName(qName);
      setPhone(qPhone);
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(requestProfileStorageKey);
      const globalRaw = window.sessionStorage.getItem(globalProfileStorageKey);
      const source = raw || globalRaw;
      if (!source) return;
      const parsed = JSON.parse(source) as { dong?: string; ho?: string; name?: string; phone?: string };
      if (parsed.dong) setDong(String(parsed.dong).replaceAll(/[^0-9]/g, ""));
      if (parsed.ho) setHo(String(parsed.ho).replaceAll(/[^0-9]/g, ""));
      if (parsed.name) setName(String(parsed.name));
      if (parsed.phone) setPhone(String(parsed.phone).replaceAll(/[^0-9]/g, "").slice(0, 11));
    } catch {
      // ignore storage parse errors
    }
  }, [requestProfileStorageKey, globalProfileStorageKey, searchParams]);

  useEffect(() => {
    if (!dong && !ho && !name && !phone) return;
    try {
      window.sessionStorage.setItem(
        requestProfileStorageKey,
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
      // ignore storage errors
    }
  }, [dong, ho, name, phone, requestProfileStorageKey, globalProfileStorageKey]);

  if (!result) {
    return (
      <main className="page-fit max-w-5xl">
        <section className="surface-card rounded-2xl p-6">
          <p className="text-sm text-slate-600">자가진단 결과를 찾을 수 없습니다. 다시 진단을 진행해주세요.</p>
          <Link href="/resident/safety-check" className="btn-primary mt-4 inline-flex px-4 py-2 text-sm">
            자가진단으로 이동
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-fit max-w-5xl">
      <div className="mb-2">
        <Link href="/resident/safety-check" className="btn-outline px-3 py-2 text-sm">
          문항으로 돌아가기
        </Link>
      </div>

      <div className="diag-result-wrap relative overflow-hidden rounded-3xl border border-[#2f4f7e] bg-gradient-to-br from-[#0b1c3a] via-[#102a52] to-[#1a4b8c] p-[clamp(0.85rem,2.2vh,1.6rem)] text-white shadow-[0_22px_54px_rgba(11,28,58,0.45)] ring-4 ring-[#c9922a]/30">
        <div className="absolute right-4 top-4 rounded-full border border-[#f0c96a]/40 bg-[#f0c96a]/20 px-3 py-1 text-xs font-bold text-[#f0c96a]">자가진단 결과</div>
        <p className="text-sm font-semibold text-slate-300">위험지수 (만점 100점)</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-1">
          <span className="text-[clamp(2rem,6vw,3.75rem)] font-extrabold tracking-tight text-white">{result.riskScore}</span>
          <span className="text-2xl font-bold text-slate-400">/ 100</span>
          <span className="ml-1 text-sm text-slate-400">점</span>
        </p>
        <div className="diag-sector-grid mt-3 grid gap-2 md:grid-cols-3">
          {result.sectorScores.map((sector) => (
            <div key={sector.id} className="diag-sector-card rounded-xl border border-white/20 bg-white/10 px-3 py-3 backdrop-blur">
              <p className="text-xs font-semibold text-slate-300">{sector.title}</p>
              <p className="mt-1 text-2xl font-extrabold text-white">
                {sector.score}
                <span className="ml-1 text-sm font-semibold text-slate-300">/100</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                응답 {sector.answeredCount}/{sector.questionCount}
              </p>
              <p className="diag-sector-comment mt-2 text-[11px] leading-relaxed text-slate-200">{sectorComment(sector)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
          <p className="text-xs font-bold tracking-wide text-[#f0c96a]">「우리집 전기 주치의 안내」</p>
          <div className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-100 sm:text-base">
            {result.summary}
          </div>
        </div>
        <div className="diag-actions mt-4 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void moveToHomePage()}
            disabled={moveLoading || emergencyLoading || homeLoading}
            className="inline-flex h-[clamp(2.6rem,5vh,3rem)] w-full items-center justify-center rounded-xl border border-white/35 bg-white/15 px-4 text-center text-sm font-bold text-white shadow hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {homeLoading ? "홈으로 이동 중..." : "홈으로 이동"}
          </button>
          <button
            type="button"
            onClick={() => openRequestModal("repair")}
            disabled={moveLoading || emergencyLoading || homeLoading}
            className="inline-flex h-[clamp(2.6rem,5vh,3rem)] w-full items-center justify-center rounded-xl bg-white px-4 text-center text-sm font-bold text-[#0b1c3a] shadow hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {moveLoading ? "점검/수리 요청 페이지 이동 중..." : "점검/수리 요청 페이지로 이동"}
          </button>
          <button
            type="button"
            onClick={() => openRequestModal("emergency")}
            disabled={moveLoading || emergencyLoading || homeLoading}
            className="inline-flex h-[clamp(2.6rem,5vh,3rem)] w-full items-center justify-center rounded-xl border border-[#f0c96a]/55 bg-[#c9922a] px-4 text-center text-sm font-bold text-white shadow hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {emergencyLoading ? "긴급출동 페이지 이동 중..." : "긴급출동 페이지로 이동"}
          </button>
        </div>
        {moveMessage ? <p className="mt-3 text-sm text-rose-100">{moveMessage}</p> : null}
      </div>

      {requestModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <p className="text-sm font-bold text-slate-500">이동 전 정보 입력</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">{requestModal === "repair" ? "점검/수리" : "긴급출동"} 접수 정보</h2>
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
                placeholder="성함 (한글/영문)"
                className="h-12 rounded-xl border border-slate-300 px-3 text-base"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replaceAll(/[^0-9]/g, "").slice(0, 11))}
                placeholder="휴대폰 11자리 (숫자만)"
                className="h-12 rounded-xl border border-slate-300 px-3 text-base"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRequestModal(null)}
                disabled={moveLoading || emergencyLoading}
                className="h-12 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void submitRequestModal()}
                disabled={moveLoading || emergencyLoading}
                className="h-12 rounded-xl bg-gradient-to-r from-[#0b1c3a] to-[#1a4b8c] text-sm font-extrabold text-white disabled:opacity-50"
              >
                {requestModal === "repair"
                  ? moveLoading
                    ? "이동 중..."
                    : "점검/수리로 이동"
                  : emergencyLoading
                    ? "이동 중..."
                    : "긴급출동으로 이동"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function ResidentSafetyResultPage() {
  return (
    <Suspense
      fallback={
        <main className="page-fit max-w-5xl">
          <section className="surface-card rounded-2xl p-6 text-sm text-slate-600">자가진단 결과를 불러오는 중입니다...</section>
        </main>
      }
    >
      <ResidentSafetyResultContent />
    </Suspense>
  );
}
