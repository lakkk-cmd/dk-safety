"use client";

import { useEffect, useState, useCallback } from "react";
import type { Invoice, InvoiceItem } from "@/lib/erp-db";

const TYPE_LABEL: Record<string, string> = { tax_invoice: "세금계산서", receipt: "영수증", quote: "견적서" };
const STATUS_LABEL: Record<string, string> = { draft: "초안", sent: "발송", paid: "수금", cancelled: "취소" };
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const emptyItem = (): InvoiceItem => ({ description: "", qty: 1, unit_price: 0, amount: 0 });

type InvoiceForm = {
  customer_name: string;
  customer_phone: string;
  customer_business_number: string;
  customer_address: string;
  type: "tax_invoice" | "receipt" | "quote";
  items: InvoiceItem[];
  due_at: string;
};

const emptyForm = (): InvoiceForm => ({
  customer_name: "", customer_phone: "",
  customer_business_number: "", customer_address: "",
  type: "receipt",
  items: [emptyItem()],
  due_at: "",
});

function formatKRW(n: number) { return n.toLocaleString("ko-KR") + "원"; }

export default function ErpInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<InvoiceForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const url = status ? `/api/admin/erp/invoices?status=${status}` : "/api/admin/erp/invoices";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json() as { invoices: Invoice[] };
      setInvoices(json.invoices ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filterStatus); }, [load, filterStatus]);

  const updateItem = (i: number, field: keyof InvoiceItem, value: string | number) => {
    setForm((f) => {
      const items = [...f.items];
      const item = { ...items[i], [field]: value };
      item.amount = Number(item.qty) * Number(item.unit_price);
      items[i] = item;
      return { ...f, items };
    });
  };

  const subtotal = form.items.reduce((s, i) => s + (i.amount || 0), 0);
  const tax = form.type === "tax_invoice" ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + tax;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name.trim()) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/erp/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setModal(false);
      setForm(emptyForm());
      void load(filterStatus);
    } catch (err) {
      setMsg("오류: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: Invoice["status"]) => {
    try {
      await fetch(`/api/admin/erp/invoices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      void load(filterStatus);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
          <h1 className="mt-1 text-3xl font-black text-slate-900">견적/영수증</h1>
          <p className="mt-1 text-sm text-slate-600">세금계산서 · 영수증 · 견적서 발행</p>
        </div>
        <button onClick={() => { setForm(emptyForm()); setMsg(null); setModal(true); }}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          + 새 문서 발행
        </button>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex gap-2">
        {["", "draft", "sent", "paid", "cancelled"].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${filterStatus === s ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {s === "" ? "전체" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <p className="py-12 text-center text-slate-500">불러오는 중...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">번호</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">고객</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">유형</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">상태</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">합계</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">발행일</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">작업</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-slate-400">발행된 문서가 없습니다.</td></tr>
                ) : invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{inv.invoice_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{inv.customer_name}</p>
                      {inv.customer_phone && <p className="text-xs text-slate-500">{inv.customer_phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_LABEL[inv.type]}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[inv.status]}`}>
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{formatKRW(inv.total)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(inv.issued_at).toLocaleDateString("ko-KR")}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <a href={`/api/admin/erp/invoices/${inv.id}/print`} target="_blank" rel="noreferrer"
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
                          🖨️ 인쇄
                        </a>
                        {inv.status === "draft" && (
                          <button onClick={() => updateStatus(inv.id, "sent")}
                            className="rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-200">
                            발송
                          </button>
                        )}
                        {inv.status === "sent" && (
                          <button onClick={() => updateStatus(inv.id, "paid")}
                            className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-200">
                            수금
                          </button>
                        )}
                        {(inv.status === "draft" || inv.status === "sent") && (
                          <button onClick={() => updateStatus(inv.id, "cancelled")}
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100">
                            취소
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-black text-slate-900">새 문서 발행</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">고객명 *</label>
                  <input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} required
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">연락처</label>
                  <input value={form.customer_phone} onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">문서 유형</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as InvoiceForm["type"] }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="receipt">영수증</option>
                    <option value="quote">견적서</option>
                    <option value="tax_invoice">세금계산서</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">납부기한</label>
                  <input type="date" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {form.type === "tax_invoice" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">사업자번호</label>
                    <input value={form.customer_business_number} onChange={(e) => setForm((f) => ({ ...f, customer_business_number: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">주소</label>
                    <input value={form.customer_address} onChange={(e) => setForm((f) => ({ ...f, customer_address: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}

              {/* 품목 */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">품목</label>
                <div className="space-y-2">
                  {form.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 items-center">
                      <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)}
                        placeholder="품목명"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="number" value={item.qty} min="1" onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="number" value={item.unit_price} min="0" onChange={(e) => updateItem(i, "unit_price", Number(e.target.value))}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <p className="text-right text-sm font-semibold text-slate-700">{(item.amount || 0).toLocaleString()}</p>
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                          className="text-red-400 hover:text-red-600 text-lg font-bold">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}
                  className="mt-2 text-xs font-semibold text-blue-600 hover:underline">+ 품목 추가</button>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between text-slate-600"><span>공급가액</span><span>{formatKRW(subtotal)}</span></div>
                {tax > 0 && <div className="flex justify-between text-slate-600 mt-1"><span>부가세 (10%)</span><span>{formatKRW(tax)}</span></div>}
                <div className="flex justify-between font-bold text-slate-900 mt-2 border-t pt-2"><span>합계</span><span>{formatKRW(total)}</span></div>
              </div>

              {msg && <p className="text-xs font-semibold text-red-600">{msg}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving ? "저장 중..." : "문서 발행"}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold hover:bg-slate-50">
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
