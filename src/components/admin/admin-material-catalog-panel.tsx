"use client";

import { FormEvent, useState } from "react";

type Material = {
  id: string;
  name: string;
  unit_price: number;
  active: boolean;
  display_order: number;
};

type Props = {
  initialMaterials: Material[];
};

function EditRow({ material, onUpdated }: { material: Material; onUpdated: (m: Material) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(material.name);
  const [unitPrice, setUnitPrice] = useState(String(material.unit_price));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unit_price: Number(unitPrice) })
      });
      const data = (await response.json()) as { message?: string; material?: Material };
      if (!response.ok || !data.material) {
        setMessage(data.message ?? "수정에 실패했습니다.");
        return;
      }
      onUpdated(data.material);
      setEditing(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !material.active })
      });
      const data = (await response.json()) as { message?: string; material?: Material };
      if (!response.ok || !data.material) {
        setMessage(data.message ?? "변경에 실패했습니다.");
        return;
      }
      onUpdated(data.material);
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!confirm(`"${material.name}" 품목을 삭제하시겠습니까?`)) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/materials/${material.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "삭제에 실패했습니다.");
        return;
      }
      onUpdated({ ...material, name: "__deleted__" });
    } finally {
      setLoading(false);
    }
  };

  if (!editing) {
    return (
      <tr className="border-t border-slate-200 dark:border-slate-700">
        <td className="px-3 py-2 font-semibold">{material.name}</td>
        <td className="px-3 py-2">{material.unit_price.toLocaleString("ko-KR")}원</td>
        <td className="px-3 py-2">{material.active ? "사용중" : "비활성"}</td>
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
              {material.active ? "비활성화" : "활성화"}
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
        <input className="soft-input w-full text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="px-3 py-2">
        <input
          className="soft-input w-full text-sm"
          type="number"
          min={0}
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
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
              setName(material.name);
              setUnitPrice(String(material.unit_price));
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

export default function AdminMaterialCatalogPanel({ initialMaterials }: Props) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [name, setName] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const addMaterial = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unit_price: Number(unitPrice), display_order: materials.length + 1 })
      });
      const data = (await response.json()) as { message?: string; material?: Material };
      if (!response.ok || !data.material) {
        setMessage(data.message ?? "등록에 실패했습니다.");
        return;
      }
      setMaterials((prev) => [...prev, data.material as Material]);
      setName("");
      setUnitPrice("");
      setMessage("품목이 등록되었습니다.");
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const visibleMaterials = materials.filter((m) => m.name !== "__deleted__");

  return (
    <div className="space-y-4">
      <section className="surface-card rounded-2xl border border-slate-200 p-5">
        <h2 className="text-lg font-black text-slate-950">새 품목 추가</h2>
        <p className="mt-1 text-xs text-slate-600">
          품목명과 자재비(정액)를 등록하면 현장 정산 시 재료비 항목으로 선택할 수 있습니다.
        </p>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={addMaterial}>
          <input
            className="soft-input min-w-[200px] flex-1 text-sm"
            placeholder="품목명 (예: 콘센트)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="soft-input w-32 text-sm"
            placeholder="자재비(원)"
            type="number"
            min={0}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            required
          />
          <button type="submit" disabled={loading} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
            {loading ? "등록 중..." : "추가"}
          </button>
        </form>
        {message ? <p className="mt-2 text-xs text-slate-700">{message}</p> : null}
      </section>

      <section className="surface-card rounded-2xl border border-slate-200 p-5">
        <h2 className="text-lg font-black text-slate-950">재료비 정액 카탈로그</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">품목명</th>
                <th className="px-3 py-2">자재비</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {visibleMaterials.map((material) => (
                <EditRow
                  key={material.id}
                  material={material}
                  onUpdated={(updated) =>
                    setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
                  }
                />
              ))}
              {visibleMaterials.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                    등록된 자재 품목이 없습니다. 위 폼에서 첫 품목을 추가하세요.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          목록에 없는 자재는 현장 정산 시 실비로 정산합니다(영수증 첨부 권장).
        </p>
      </section>
    </div>
  );
}
