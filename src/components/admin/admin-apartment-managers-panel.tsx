"use client";

import { useEffect, useState } from "react";

type ApartmentManager = {
  id: string;
  apartmentId: string | null;
  name: string;
  phone: string;
  loginId: string;
  approvalStatus: "pending" | "approved" | "rejected";
  lastLoginAt: string | null;
  apartmentNameRequested: string | null;
  apartmentAddressRequested: string | null;
  apartmentCompletionDateRequested: string | null;
  totalUnitsRequested: number | null;
  createdAt: string;
};

type ApartmentOption = { id: string; name: string; totalUnits: number | null };

function formatDate(iso: string | null): string {
  if (!iso) return "이력 없음";
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminApartmentManagersPanel() {
  const [pending, setPending] = useState<ApartmentManager[]>([]);
  const [approved, setApproved] = useState<ApartmentManager[]>([]);
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pendingRes, approvedRes, aptRes] = await Promise.all([
        fetch("/api/admin/apartment-managers?status=pending", { cache: "no-store" }),
        fetch("/api/admin/apartment-managers?status=approved", { cache: "no-store" }),
        fetch("/api/apt-manager/apartments-search", { cache: "no-store" })
      ]);
      const pendingData = (await pendingRes.json()) as { managers?: ApartmentManager[] };
      const approvedData = (await approvedRes.json()) as { managers?: ApartmentManager[] };
      const aptData = (await aptRes.json()) as { apartments?: ApartmentOption[] };
      if (pendingRes.ok) setPending(pendingData.managers ?? []);
      if (approvedRes.ok) setApproved(approvedData.managers ?? []);
      if (aptRes.ok) setApartments(aptData.apartments ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const apartmentNameById = new Map(apartments.map((a) => [a.id, a.name]));

  const approve = async (id: string) => {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/apartment-managers/${id}/approve`, { method: "POST" });
      const data = (await response.json()) as { message?: string; smsSent?: boolean };
      if (!response.ok) {
        setMessage(data.message ?? "승인에 실패했습니다.");
        return;
      }
      setMessage(data.smsSent ? "승인 완료 — 승인 SMS를 발송했습니다." : "승인은 완료됐지만 SMS 발송에는 실패했어요.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    if (!window.confirm("이 신청을 거절할까요?")) return;
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/apartment-managers/${id}/reject`, { method: "POST" });
      const data = (await response.json()) as { message?: string };
      setMessage(response.ok ? "거절 처리했습니다." : (data.message ?? "거절에 실패했습니다."));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (id: string) => {
    if (!window.confirm("새 임시비밀번호를 발급하고 SMS로 전송할까요?")) return;
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/apartment-managers/${id}/reset-password`, { method: "POST" });
      const data = (await response.json()) as { message?: string; tempPassword?: string };
      if (data.tempPassword) {
        setMessage(`${data.message ?? ""} (임시비밀번호: ${data.tempPassword} — SMS 실패로 직접 전달해주세요)`);
      } else {
        setMessage(data.message ?? "처리되었습니다.");
      }
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  return (
    <div className="space-y-6">
      {message ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message}</p> : null}

      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">승인대기 ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">대기 중인 신청이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pending.map((m) => {
              const isNew = !m.apartmentId;
              const apartmentLabel = isNew
                ? `${m.apartmentNameRequested} (신규요청 · 예상 ${m.totalUnitsRequested ?? "?"}세대)`
                : apartmentNameById.get(m.apartmentId!) ?? "알 수 없음";
              const totalUnits = isNew ? m.totalUnitsRequested : apartments.find((a) => a.id === m.apartmentId)?.totalUnits;
              return (
                <li key={m.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {m.name} · <a href={`tel:${m.phone}`} className="text-dk-blue">{m.phone}</a>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {apartmentLabel}
                    {!isNew && totalUnits ? ` (${totalUnits}세대)` : ""}
                    {isNew ? <span className="ml-1 rounded-full bg-dk-gold/20 px-2 py-0.5 text-[10px] font-bold text-dk-amber">신규요청</span> : null}
                  </p>
                  {isNew ? (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {m.apartmentAddressRequested} · 준공일 {m.apartmentCompletionDateRequested ?? "미입력"}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-slate-400">신청일시: {formatDate(m.createdAt)}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => void approve(m.id)}
                      className="rounded-lg bg-dk-blue px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => void reject(m.id)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-50"
                    >
                      거절
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">승인됨 ({approved.length})</p>
        {approved.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">승인된 계정이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {approved.map((m) => (
              <li key={m.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {m.name} · {m.apartmentId ? (apartmentNameById.get(m.apartmentId) ?? "알 수 없음") : "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500">아이디: {m.loginId} · 마지막 로그인: {formatDate(m.lastLoginAt)}</p>
                <button
                  type="button"
                  disabled={busyId === m.id}
                  onClick={() => void resetPassword(m.id)}
                  className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-50"
                >
                  비밀번호 재발급 (SMS)
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
