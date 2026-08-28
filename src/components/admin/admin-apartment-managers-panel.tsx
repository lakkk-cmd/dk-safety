"use client";

import { useEffect, useMemo, useState } from "react";

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

type ApartmentOption = {
  id: string;
  name: string;
  totalUnits: number | null;
  insulationResistanceThresholdMohm: number | null;
  leakageCurrentThresholdMa: number | null;
};

type ApartmentSubscription = {
  apartmentId: string;
  status: "inactive" | "active" | "past_due" | "cancelled";
  billingMethod: "toss_auto" | "bank_transfer" | null;
  currentPeriodEnd: string | null;
};

type ThresholdDraft = { insulation: string; leakage: string };

const SUBSCRIPTION_LABEL: Record<ApartmentSubscription["status"], string> = {
  inactive: "무료",
  active: "구독중",
  past_due: "결제실패",
  cancelled: "해지"
};

// 결제실패/해지는 완전 차단이 아니라 무료 한도(5건/30일)로 되돌아가는 상태다.

const SUBSCRIPTION_CLASS: Record<ApartmentSubscription["status"], string> = {
  inactive: "bg-slate-200 text-slate-600",
  active: "bg-dk-green/10 text-dk-green",
  past_due: "bg-dk-red/10 text-dk-red",
  cancelled: "bg-slate-200 text-slate-600"
};

function formatDate(iso: string | null): string {
  if (!iso) return "이력 없음";
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminApartmentManagersPanel() {
  const [pending, setPending] = useState<ApartmentManager[]>([]);
  const [approved, setApproved] = useState<ApartmentManager[]>([]);
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, ApartmentSubscription>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approvedSearch, setApprovedSearch] = useState("");
  const [approvedSort, setApprovedSort] = useState<"recent_login" | "apartment_name">("recent_login");
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, ThresholdDraft>>({});
  // 신규단지 자기신고 세대수 재확인/수정(2026-08-28) — 구독요금이 세대수 구간(≤300/>300)으로
  // 갈리므로 실존확인 통화 중 확인한 실제값으로 고칠 수 있어야 한다. 기존단지 연결 요청에는
  // 노출하지 않는다(그쪽 total_units는 /admin/apartments에서 이미 관리 중).
  const [totalUnitsDrafts, setTotalUnitsDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [pendingRes, approvedRes, aptRes] = await Promise.all([
        fetch("/api/admin/apartment-managers?status=pending", { cache: "no-store" }),
        fetch("/api/admin/apartment-managers?status=approved", { cache: "no-store" }),
        fetch("/api/admin/apartments", { cache: "no-store" })
      ]);
      const pendingData = (await pendingRes.json()) as { managers?: ApartmentManager[] };
      const approvedData = (await approvedRes.json()) as {
        managers?: ApartmentManager[];
        subscriptions?: Record<string, ApartmentSubscription>;
      };
      const aptData = (await aptRes.json()) as { apartments?: ApartmentOption[] };
      if (pendingRes.ok) setPending(pendingData.managers ?? []);
      if (approvedRes.ok) {
        setApproved(approvedData.managers ?? []);
        setSubscriptions(approvedData.subscriptions ?? {});
      }
      if (aptRes.ok) setApartments(aptData.apartments ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const apartmentNameById = new Map(apartments.map((a) => [a.id, a.name]));
  const apartmentById = new Map(apartments.map((a) => [a.id, a]));

  const visibleApproved = useMemo(() => {
    const q = approvedSearch.trim().toLowerCase();
    const filtered = q
      ? approved.filter((m) => {
          const apartmentName = m.apartmentId ? (apartmentNameById.get(m.apartmentId) ?? "") : "";
          return (
            m.name.toLowerCase().includes(q) ||
            m.loginId.toLowerCase().includes(q) ||
            apartmentName.toLowerCase().includes(q)
          );
        })
      : approved;
    const sorted = [...filtered].sort((a, b) => {
      if (approvedSort === "apartment_name") {
        const nameA = a.apartmentId ? (apartmentNameById.get(a.apartmentId) ?? "") : "";
        const nameB = b.apartmentId ? (apartmentNameById.get(b.apartmentId) ?? "") : "";
        return nameA.localeCompare(nameB, "ko");
      }
      // recent_login: 최근 로그인순, 로그인 이력 없는 계정은 맨 뒤로
      const timeA = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : -Infinity;
      const timeB = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : -Infinity;
      return timeB - timeA;
    });
    return sorted;
  }, [approved, approvedSearch, approvedSort, apartmentNameById]);

  const setDraft = (managerId: string, patch: Partial<ThresholdDraft>) => {
    setThresholdDrafts((prev) => ({
      ...prev,
      [managerId]: { insulation: prev[managerId]?.insulation ?? "", leakage: prev[managerId]?.leakage ?? "", ...patch }
    }));
  };

  const approve = async (id: string) => {
    setBusyId(id);
    setMessage("");
    try {
      const draft = thresholdDrafts[id];
      const manager = pending.find((m) => m.id === id);
      const isNew = manager ? !manager.apartmentId : false;
      const totalUnitsDraftValue = totalUnitsDrafts[id];
      const totalUnits = isNew
        ? totalUnitsDraftValue !== undefined && totalUnitsDraftValue !== ""
          ? Number(totalUnitsDraftValue)
          : (manager?.totalUnitsRequested ?? undefined)
        : undefined;
      const response = await fetch(`/api/admin/apartment-managers/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insulationResistanceThresholdMohm: draft?.insulation ? Number(draft.insulation) : undefined,
          leakageCurrentThresholdMa: draft?.leakage ? Number(draft.leakage) : undefined,
          totalUnits
        })
      });
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

  /** 계좌이체 입금을 확인했을 때만 누른다 — 세금계산서 발행은 앱 밖에서 기존 방식대로 처리한다. */
  const activateSubscription = async (managerId: string, apartmentId: string) => {
    if (!window.confirm("입금을 확인하셨나요? 확인하면 이 단지의 구독을 30일간 활성화합니다.")) return;
    setBusyId(managerId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/apartments/${apartmentId}/activate-subscription`, { method: "POST" });
      const data = (await response.json()) as { message?: string };
      setMessage(response.ok ? (data.message ?? "활성화했습니다.") : (data.message ?? "활성화에 실패했습니다."));
      if (response.ok) await load();
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
              const linkedApartment = m.apartmentId ? apartmentById.get(m.apartmentId) : undefined;
              const apartmentLabel = isNew
                ? `${m.apartmentNameRequested} (신규요청 · 예상 ${m.totalUnitsRequested ?? "?"}세대)`
                : (linkedApartment?.name ?? "알 수 없음");
              const totalUnits = isNew ? m.totalUnitsRequested : linkedApartment?.totalUnits;
              // 신규요청은 단지 자체가 없으니 무조건 미설정, 기존단지는 둘 중 하나라도 비어있으면 물어봐야 함.
              const thresholdsMissing =
                isNew || linkedApartment?.insulationResistanceThresholdMohm == null || linkedApartment?.leakageCurrentThresholdMa == null;
              const draft = thresholdDrafts[m.id] ?? { insulation: "", leakage: "" };
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

                  {isNew ? (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[11px] font-bold text-slate-500" htmlFor={`total-units-${m.id}`}>
                        세대수 확인
                      </label>
                      <input
                        id={`total-units-${m.id}`}
                        value={totalUnitsDrafts[m.id] ?? (m.totalUnitsRequested != null ? String(m.totalUnitsRequested) : "")}
                        onChange={(e) => setTotalUnitsDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        placeholder="세대수"
                        inputMode="numeric"
                        className="soft-input h-8 w-24 text-xs"
                      />
                      <span className="text-[11px] text-slate-400">신청자 입력값(구독요금 구간을 정하니 통화로 재확인)</span>
                    </div>
                  ) : null}

                  {thresholdsMissing ? (
                    <div className="mt-2 rounded-lg border border-dk-amber/40 bg-dk-gold/10 p-2">
                      <p className="text-[11px] font-bold text-dk-amber">
                        ⚠️ 이 단지는 판정 기준값이 없어요 — 실존확인 통화하면서 회로 구성을 확인해 채워주세요(비워두고 승인해도 됨).
                      </p>
                      <div className="mt-1.5 flex gap-2">
                        <input
                          value={draft.insulation}
                          onChange={(e) => setDraft(m.id, { insulation: e.target.value })}
                          placeholder="절연저항 기준값(MΩ)"
                          inputMode="decimal"
                          className="soft-input h-8 flex-1 text-xs"
                        />
                        <input
                          value={draft.leakage}
                          onChange={(e) => setDraft(m.id, { leakage: e.target.value })}
                          placeholder="누설전류 기준값(mA)"
                          inputMode="decimal"
                          className="soft-input h-8 flex-1 text-xs"
                        />
                      </div>
                    </div>
                  ) : null}

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">승인됨 ({approved.length})</p>
          {approved.length > 0 ? (
            <div className="flex gap-2">
              <input
                value={approvedSearch}
                onChange={(e) => setApprovedSearch(e.target.value)}
                placeholder="이름·단지·아이디 검색"
                className="soft-input h-8 w-48 text-xs"
              />
              <select
                value={approvedSort}
                onChange={(e) => setApprovedSort(e.target.value as "recent_login" | "apartment_name")}
                className="soft-input h-8 text-xs"
              >
                <option value="recent_login">최근 로그인순</option>
                <option value="apartment_name">단지명순</option>
              </select>
            </div>
          ) : null}
        </div>
        {approved.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">승인된 계정이 없습니다.</p>
        ) : visibleApproved.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">검색 결과가 없습니다.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">단지</th>
                  <th className="px-3 py-2">아이디</th>
                  <th className="px-3 py-2">구독</th>
                  <th className="px-3 py-2">마지막 로그인</th>
                  <th className="px-3 py-2">액션</th>
                </tr>
              </thead>
              <tbody>
                {visibleApproved.map((m) => {
                  const subscription = m.apartmentId ? subscriptions[m.apartmentId] : undefined;
                  const subscriptionStatus = subscription?.status ?? "inactive";
                  // 카드 자동결제로 활성화된 단지는 수동 확인 버튼을 감춘다(자동청구가 이미 돌고 있음).
                  const canActivateManually =
                    Boolean(m.apartmentId) && !(subscriptionStatus === "active" && subscription?.billingMethod === "toss_auto");
                  return (
                    <tr key={m.id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">{m.name}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        {m.apartmentId ? (apartmentNameById.get(m.apartmentId) ?? "알 수 없음") : "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{m.loginId}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SUBSCRIPTION_CLASS[subscriptionStatus]}`}>
                          {SUBSCRIPTION_LABEL[subscriptionStatus]}
                        </span>
                        {subscription?.currentPeriodEnd && subscriptionStatus === "active" ? (
                          <span className="ml-1 text-[11px] text-slate-400">~{formatDate(subscription.currentPeriodEnd)}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{formatDate(m.lastLoginAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === m.id}
                            onClick={() => void resetPassword(m.id)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-50"
                          >
                            비밀번호 재발급 (SMS)
                          </button>
                          {canActivateManually ? (
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => void activateSubscription(m.id, m.apartmentId as string)}
                              className="rounded-lg bg-dk-blue px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                            >
                              계좌이체 확인
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
