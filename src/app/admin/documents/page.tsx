"use client";

import { useCallback, useEffect, useState } from "react";

type GeneratedDocument = {
  id: string;
  title: string;
  doc_type: string;
  customer_name: string | null;
  pdf_url: string | null;
  docx_url: string | null;
  validation_score: number | null;
  created_at: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  inspection_report: "점검보고",
  estimate: "견적서",
  completion_cert: "완료확인",
  safety_guide: "안전안내",
  contract: "계약서",
  proposal: "제안서",
  custom: "기타",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminDocumentsPage() {
  const [docs, setDocs] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async (type: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents${type ? `?doc_type=${type}` : ""}`, { cache: "no-store" });
      const data = (await res.json()) as { data?: GeneratedDocument[]; error?: string };
      if (!res.ok) { setError(data.error ?? "불러오기 실패"); return; }
      setDocs(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(typeFilter); }, [load, typeFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm("이 문서를 삭제할까요?")) return;
    await fetch(`/api/admin/documents?id=${id}`, { method: "DELETE" });
    void load(typeFilter);
  };

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">AI 채팅 · 문서 작성</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">생성된 문서 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          /hq/chat 총괄 에이전트가 작성한 문서 목록입니다. Gemini 검증 점수와 함께 PDF/Word 다운로드가 가능합니다.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[["", "전체"], ...Object.entries(DOC_TYPE_LABELS)].map(([value, label]) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setTypeFilter(value)}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${
              typeFilter === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">불러오는 중...</p>
        ) : docs.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">아직 생성된 문서가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold text-slate-500">
                <th className="px-4 py-3">문서명</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">고객명</th>
                <th className="px-4 py-3 text-center">검증점수</th>
                <th className="px-4 py-3">생성일</th>
                <th className="px-4 py-3">다운로드</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="max-w-[220px] truncate px-4 py-3 font-semibold text-slate-800">{d.title}</td>
                  <td className="px-4 py-3 text-slate-600">{DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}</td>
                  <td className="px-4 py-3 text-slate-600">{d.customer_name ?? "-"}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-700">
                    {d.validation_score != null ? `${d.validation_score}점` : "-"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatDate(d.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {d.pdf_url ? (
                        <a href={d.pdf_url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100">
                          📄 PDF
                        </a>
                      ) : null}
                      {d.docx_url ? (
                        <a href={d.docx_url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100">
                          📝 Word
                        </a>
                      ) : null}
                      {!d.pdf_url && !d.docx_url ? <span className="text-xs text-slate-300">생성 실패</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => void handleDelete(d.id)} className="text-xs text-slate-400 hover:text-red-600">
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
