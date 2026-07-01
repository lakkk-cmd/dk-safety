"use client";

import { useEffect, useRef, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";

const SERVICE_TYPES = [
  "누전차단기 교체",
  "콘센트/스위치 교체",
  "전등 교체",
  "분전반 점검",
  "배선 교체",
  "형광등/LED 교체",
  "전기 안전점검",
  "기타"
];

function formatDateTime(dateStr: string, timeStr: string) {
  return `${dateStr} ${timeStr}`.trim();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

type CompleteResult = {
  warrantyNumber: string;
  verifyUrl: string;
  sentChannels: string[];
  channelAddUrl: string | null;
};

type CompleteTarget = Pick<Reservation, "id" | "name" | "phone" | "serviceType" | "preferredDate" | "preferredTime" | "totalAmount">;

export default function WalkInPage() {
  const [tab, setTab] = useState<"form" | "list">("form");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // 즉시입력 폼 상태
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0]);
  const [workDate, setWorkDate] = useState(todayStr());
  const [workTime, setWorkTime] = useState(nowTimeStr());
  const [detail, setDetail] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ id: string; name: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 완료 처리 모달 상태
  const [completeTarget, setCompleteTarget] = useState<CompleteTarget | null>(null);
  const [serviceSummary, setServiceSummary] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completeResult, setCompleteResult] = useState<CompleteResult | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const loadList = async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/admin/walk-in", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { reservations: Reservation[] };
      setReservations(json.reservations);
    } catch (err) {
      console.error(err);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "list") void loadList();
  }, [tab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitResult(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("phone", phone);
      form.set("address", address);
      form.set("serviceType", serviceType);
      form.set("workDate", workDate);
      form.set("workTime", workTime);
      form.set("detail", detail);
      form.set("totalAmount", totalAmount || "0");
      for (const file of photos) form.append("photos", file);

      const res = await fetch("/api/admin/walk-in", { method: "POST", body: form });
      const json = (await res.json()) as { reservation?: Reservation; error?: string };
      if (!res.ok) throw new Error(json.error ?? "알 수 없는 오류");

      const r = json.reservation!;
      setSubmitResult({ id: r.id, name: r.name });
      setName(""); setPhone(""); setAddress(""); setDetail(""); setTotalAmount("");
      setPhotos([]); setServiceType(SERVICE_TYPES[0]); setWorkDate(todayStr()); setWorkTime(nowTimeStr());
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setSubmitting(false);
    }
  };

  const openComplete = (r: Reservation) => {
    setCompleteTarget(r);
    setServiceSummary(r.detail || r.serviceType);
    setCompleteResult(null);
    setCompleteError(null);
  };

  const handleComplete = async () => {
    if (!completeTarget) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch("/api/admin/walk-in/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: completeTarget.id,
          name: completeTarget.name,
          phone: completeTarget.phone,
          serviceType: completeTarget.serviceType,
          workDate: completeTarget.preferredDate,
          workTime: completeTarget.preferredTime,
          serviceSummary,
          finalAmount: completeTarget.totalAmount
        })
      });
      const json = (await res.json()) as CompleteResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "오류 발생");
      setCompleteResult(json);
      void loadList();
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <main className="page-fit max-w-3xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6">
        <p className="warranty-badge">관리자 콘솔</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900">현장 즉시접수</h1>
        <p className="mt-1 text-sm text-slate-700">예약 없이 현장에서 바로 접수·완료·보증서 발급까지 처리합니다.</p>
      </header>

      {/* 탭 */}
      <div className="mb-4 flex gap-2">
        {(["form", "list"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              tab === t
                ? "bg-dk-navy text-white shadow"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t === "form" ? "즉시입력" : "현장 기록"}
          </button>
        ))}
      </div>

      {/* ── 즉시입력 폼 ── */}
      {tab === "form" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">고객명 *</label>
                <input
                  required value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">연락처 *</label>
                <input
                  required value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                  placeholder="010-0000-0000"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">주소 *</label>
              <input
                required value={address} onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                placeholder="광주시 ○○동 ○○아파트 ○동 ○호"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">작업종류 *</label>
                <select
                  value={serviceType} onChange={(e) => setServiceType(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                >
                  {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">단가 (원)</label>
                <input
                  type="number" min="0" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                  placeholder="50000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">작업일 *</label>
                <input
                  type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">작업시간</label>
                <input
                  type="time" value={workTime} onChange={(e) => setWorkTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">작업내용 상세</label>
              <textarea
                rows={3} value={detail} onChange={(e) => setDetail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                placeholder="작업 내용, 특이사항 등"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">사진</label>
              <input
                ref={fileInputRef}
                type="file" multiple accept="image/*"
                onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
                className="text-sm text-slate-600"
              />
              {photos.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">{photos.length}장 선택됨</p>
              )}
            </div>

            {submitError && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div>
            )}
            {submitResult && (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
                <strong>{submitResult.name}</strong> 고객 즉시접수 완료.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => { setTab("list"); setSubmitResult(null); }}
                >
                  현장 기록 보기
                </button>
              </div>
            )}

            <button
              type="submit" disabled={submitting}
              className="w-full rounded-xl bg-dk-navy py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "등록 중…" : "현장 접수 등록"}
            </button>
          </form>
        </div>
      )}

      {/* ── 현장 기록 목록 ── */}
      {tab === "list" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">즉시접수 기록 {reservations.length}건</p>
            <button
              onClick={() => void loadList()}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-50"
            >
              새로고침
            </button>
          </div>

          {listLoading && <p className="py-8 text-center text-sm text-slate-400">로드 중…</p>}

          {!listLoading && reservations.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
              즉시접수 기록이 없습니다.
            </div>
          )}

          {reservations.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{r.name}</span>
                    <span className="text-xs text-slate-500">{r.phone}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.status === "완료" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{r.address}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.serviceType} · {formatDateTime(r.preferredDate, r.preferredTime)} · {r.totalAmount.toLocaleString()}원
                  </p>
                  {r.detail && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{r.detail}</p>}
                </div>
                {r.status !== "완료" && (
                  <button
                    onClick={() => openComplete(r)}
                    className="shrink-0 rounded-xl bg-dk-navy px-3 py-2 text-xs font-bold text-white transition hover:opacity-90"
                  >
                    작업 완료 처리
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 완료 처리 모달 ── */}
      {completeTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-slate-900">작업 완료 처리</h2>
            <p className="mt-1 text-sm text-slate-600">
              <strong>{completeTarget.name}</strong> · {completeTarget.serviceType}
            </p>

            {!completeResult ? (
              <>
                <div className="mt-4">
                  <label className="mb-1 block text-xs font-bold text-slate-600">작업 내용 요약 (보증서에 기재)</label>
                  <textarea
                    rows={3} value={serviceSummary} onChange={(e) => setServiceSummary(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dk-navy"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  단가: <strong>{completeTarget.totalAmount.toLocaleString()}원</strong>
                </p>
                {completeError && (
                  <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{completeError}</div>
                )}
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => { setCompleteTarget(null); setCompleteError(null); }}
                    className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => void handleComplete()}
                    disabled={completing}
                    className="flex-1 rounded-xl bg-dk-navy py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {completing ? "처리 중…" : "완료 처리 + 보증서 발급"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-green-50 px-4 py-3">
                    <p className="text-xs font-bold text-green-700">보증서 발급 완료</p>
                    <p className="mt-1 text-sm font-mono text-green-900">{completeResult.warrantyNumber}</p>
                    <a
                      href={completeResult.verifyUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-1 block text-xs text-green-700 underline"
                    >
                      {completeResult.verifyUrl}
                    </a>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold text-slate-600">알림 발송</p>
                    <p className="mt-1 text-sm text-slate-800">
                      {completeResult.sentChannels.length > 0
                        ? completeResult.sentChannels.join(", ")
                        : "발송 채널 없음 (환경변수 미설정)"}
                    </p>
                  </div>
                  {completeResult.channelAddUrl && (
                    <div className="rounded-xl bg-yellow-50 px-4 py-3">
                      <p className="text-xs font-bold text-yellow-700">카카오 채널 추가 링크</p>
                      <a
                        href={completeResult.channelAddUrl} target="_blank" rel="noopener noreferrer"
                        className="mt-1 block text-xs text-yellow-800 underline break-all"
                      >
                        {completeResult.channelAddUrl}
                      </a>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setCompleteTarget(null); setCompleteResult(null); }}
                  className="mt-5 w-full rounded-xl bg-dk-navy py-2.5 text-sm font-bold text-white hover:opacity-90"
                >
                  닫기
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
