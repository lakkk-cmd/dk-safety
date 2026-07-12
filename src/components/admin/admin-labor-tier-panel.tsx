"use client";

import { FormEvent, useState } from "react";

type LaborTier = {
  id: string;
  label: string;
  max_minutes: number;
  amount: number;
  active: boolean;
  display_order: number;
};

type Props = {
  initialLaborTiers: LaborTier[];
};

function EditRow({ tier, onUpdated }: { tier: LaborTier; onUpdated: (t: LaborTier) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(tier.label);
  const [maxMinutes, setMaxMinutes] = useState(String(tier.max_minutes));
  const [amount, setAmount] = useState(String(tier.amount));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/labor-tiers/${tier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, max_minutes: Number(maxMinutes), amount: Number(amount) })
      });
      const data = (await response.json()) as { message?: string; laborTier?: LaborTier };
      if (!response.ok || !data.laborTier) {
        setMessage(data.message ?? "수정에 실패했습니다.");
        return;
      }
      onUpdated(data.laborTier);
      setEditing(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/labor-tiers/${tier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !tier.active })
      });
      const data = (await response.json()) as { message?: string; laborTier?: LaborTier };
      if (!response.ok || !data.laborTier) {
        setMessage(data.message ?? "변경에 실패했습니다.");
        return;
      }
      onUpdated(data.laborTier);
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!confirm(`"${tier.label}" 난이도를 삭제하시겠습니까?`)) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/labor-tiers/${tier.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "삭제에 실패했습니다.");
        return;
      }
      onUpdated({ ...tier, label: "__deleted__" });
    } finally {
      setLoading(false);
    }
  };

  if (!editing) {
    return (
      <tr className="border-t border-slate-200 dark:border-slate-700">
        <td className="px-3 py-2 font-semibold">{tier.label}</td>
        <td className="px-3 py-2">{tier.max_minutes}분 이내</td>
        <td className="px-3 py-2">{tier.amount.toLocaleString("ko-KR")}원</td>
        <td className="px-3 py-2">{tier.active ? "사용중" : "비활성"}</td>
        <td className="px-3 py-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-600"
            >
              수정
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void toggleActive()}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50 dark:border-slate-600"
            >
              {tier.active ? "비활성화" : "활성화"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void remove()}
              className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50"
            >
              삭제
            </button>
          </div>
          {message ? <p className="mt-1 text-[11px] text-rose-600">{message}</p> : null}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
      <td className="px-3 py-2">
        <input className="soft-input w-full text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
      </td>
      <td className="px-3 py-2">
        <input
          className="soft-input w-full text-sm"
          type="number"
          min={1}
          value={maxMinutes}
          onChange={(e) => setMaxMinutes(e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          className="soft-input w-full text-sm"
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </td>
      <td className="px-3 py-2" colSpan={2}>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void save()}
            className="rounded-md bg-indigo-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setLabel(tier.label);
              setMaxMinutes(String(tier.max_minutes));
              setAmount(String(tier.amount));
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-600"
          >
            취소
          </button>
        </div>
        {message ? <p className="mt-1 text-[11px] text-rose-600">{message}</p> : null}
      </td>
    </tr>
  );
}

export default function AdminLaborTierPanel({ initialLaborTiers }: Props) {
  const [tiers, setTiers] = useState(initialLaborTiers);
  const [label, setLabel] = useState("");
  const [maxMinutes, setMaxMinutes] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const addTier = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/labor-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          max_minutes: Number(maxMinutes),
          amount: Number(amount),
          display_order: tiers.length + 1
        })
      });
      const data = (await response.json()) as { message?: string; laborTier?: LaborTier };
      if (!response.ok || !data.laborTier) {
        setMessage(data.message ?? "등록에 실패했습니다.");
        return;
      }
      setTiers((prev) => [...prev, data.laborTier as LaborTier]);
      setLabel("");
      setMaxMinutes("");
      setAmount("");
      setMessage("난이도가 등록되었습니다.");
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const visibleTiers = tiers.filter((t) => t.label !== "__deleted__");

  return (
    <div className="space-y-4">
      <section className="surface-card rounded-2xl border border-slate-200 p-5">
        <h2 className="text-lg font-black text-slate-950">새 난이도 추가</h2>
        <p className="mt-1 text-xs text-slate-600">
          난이도명, 소요시간 상한(분), 정액 작업비를 등록하면 현장 정산 시 작업비 항목으로 선택할 수 있습니다.
        </p>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={addTier}>
          <input
            className="soft-input min-w-[180px] flex-1 text-sm"
            placeholder="난이도명 (예: 중 (2시간 이내))"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
          <input
            className="soft-input w-32 text-sm"
            placeholder="소요시간(분)"
            type="number"
            min={1}
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(e.target.value)}
            required
          />
          <input
            className="soft-input w-32 text-sm"
            placeholder="작업비(원)"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <button type="submit" disabled={loading} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
            {loading ? "등록 중..." : "추가"}
          </button>
        </form>
        {message ? <p className="mt-2 text-xs text-slate-700">{message}</p> : null}
      </section>

      <section className="surface-card rounded-2xl border border-slate-200 p-5">
        <h2 className="text-lg font-black text-slate-950">작업비 난이도 정액표</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">난이도</th>
                <th className="px-3 py-2">소요시간</th>
                <th className="px-3 py-2">작업비</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {visibleTiers.map((tier) => (
                <EditRow
                  key={tier.id}
                  tier={tier}
                  onUpdated={(updated) => setTiers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
                />
              ))}
              {visibleTiers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                    등록된 난이도가 없습니다. 위 폼에서 첫 난이도를 추가하세요.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          목록 상한(3시간)을 초과하는 작업은 현장 정산 화면에서 기사가 직접 사유와 함께 금액을 입력합니다(기사 재량).
        </p>
      </section>
    </div>
  );
}
