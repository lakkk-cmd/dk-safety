"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { ConsultationLog } from "@/lib/crm-db";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const CHANNELS = ["phone", "kakao", "visit", "sms"] as const;
const CHANNEL_LABEL: Record<string, string> = { phone: "전화", kakao: "카카오", visit: "방문", sms: "문자" };
const STATUS_LABEL: Record<string, string> = { pending: "대기", resolved: "해결", follow_up: "재상담" };
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  follow_up: "bg-blue-100 text-blue-700",
};

function ConsultationsContent() {
  const params = useSearchParams();
  const prePhone = params.get("phone") ?? "";
  const preName = params.get("name") ?? "";

  const [logs, setLogs] = useState<ConsultationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterPhone, setFilterPhone] = useState(prePhone);

  // form state
  const [name, setName] = useState(preName);
  const [phone, setPhone] = useState(prePhone);
  const [channel, setChannel] = useState<typeof CHANNELS[number]>("phone");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"pending" | "resolved" | "follow_up">("pending");
  const [nextContact, setNextContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const loadLogs = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const url = p ? `/api/admin/crm/consultations?phone=${encodeURIComponent(p)}` : "/api/admin/crm/consultations";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json() as { logs: ConsultationLog[] };
      setLogs(json.logs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadLogs(filterPhone); }, [loadLogs, filterPhone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !content.trim()) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch("/api/admin/crm/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_phone: phone,
          channel,
          content,
          status,
          next_contact_at: nextContact ? new Date(nextContact).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setContent("");
      setNextContact("");
      setStatus("pending");
      setSubmitMsg("상담 기록이 저장되었습니다.");
      void loadLogs(filterPhone);
    } catch (e) {
      setSubmitMsg("오류: " + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const todayFollowUps = logs.filter(
    (l) => l.next_contact_at && l.next_contact_at.slice(0, 10) === todayStr() && l.status !== "resolved"
  );

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">CRM</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">상담 관리</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 입력 폼 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-900">📝 상담 기록 입력</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">고객명 *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">연락처 *</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">채널</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value as typeof CHANNELS[number])}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">상태</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="pending">대기</option>
                  <option value="resolved">해결</option>
                  <option value="follow_up">재상담</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">상담 내용 *</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={3}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            {status === "follow_up" && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">재상담 예정일</label>
                <input type="datetime-local" value={nextContact} onChange={(e) => setNextContact(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            {submitMsg && (
              <p className={`text-xs font-semibold ${submitMsg.startsWith("오류") ? "text-red-600" : "text-green-600"}`}>
                {submitMsg}
              </p>
            )}
            <button type="submit" disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {submitting ? "저장 중..." : "상담 기록 저장"}
            </button>
          </form>
        </div>

        {/* 오늘의 재상담 */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="mb-4 font-bold text-amber-900">🔔 오늘 재상담 예정 ({todayFollowUps.length}건)</h2>
          {todayFollowUps.length === 0 ? (
            <p className="text-sm text-amber-700">오늘 예정된 재상담이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {todayFollowUps.map((l) => (
                <li key={l.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{l.customer_name}</p>
                      <p className="text-xs text-slate-600">{l.customer_phone} · {CHANNEL_LABEL[l.channel]}</p>
                      <p className="mt-1 text-xs text-slate-700 line-clamp-2">{l.content}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_COLOR[l.status]}`}>
                      {STATUS_LABEL[l.status]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 상담 목록 */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">상담 기록 ({logs.length}건)</h2>
          <div className="flex gap-2">
            <input value={filterPhone} onChange={(e) => setFilterPhone(e.target.value)}
              placeholder="연락처로 필터"
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">불러오는 중...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">고객</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">채널</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">내용</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">상태</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">재상담일</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">일시</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">상담 기록이 없습니다.</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{l.customer_name}</p>
                      <p className="text-xs text-slate-500">{l.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{CHANNEL_LABEL[l.channel]}</td>
                    <td className="px-4 py-3 max-w-[240px]">
                      <p className="text-slate-700 line-clamp-2">{l.content}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[l.status]}`}>
                        {STATUS_LABEL[l.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {l.next_contact_at ? new Date(l.next_contact_at).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(l.created_at).toLocaleDateString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

export default function CrmConsultationsPage() {
  return (
    <Suspense>
      <ConsultationsContent />
    </Suspense>
  );
}
