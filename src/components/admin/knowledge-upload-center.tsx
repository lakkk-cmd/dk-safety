"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories";
import type { KnowledgePdf } from "@/lib/knowledge-pdfs";

type UploadStatus = "uploading" | "done" | "error";

type UploadItem = {
  clientId: string;
  fileName: string;
  file: File;
  status: UploadStatus;
  error: string | null;
  result: {
    sourceFile: string;
    category?: string;
    knowledgeBaseChunkCount: number;
    knowledgeBaseError: string | null;
    voyageChunkCount: number;
    voyageError: string | null;
  } | null;
};

const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** 서버가 플랫폼 레벨 에러(예: Vercel 413 "Request Entity Too Large")를 평문으로 돌려주면
 *  res.json()이 "Unexpected token..." 으로 깨지므로, 먼저 텍스트로 받아 안전하게 파싱한다. */
async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: text.slice(0, 200) || `요청 실패 (${res.status})` } as T;
  }
}

export default function KnowledgeUploadCenter({ initialPdfs }: { initialPdfs: KnowledgePdf[] }) {
  const [pdfs, setPdfs] = useState<KnowledgePdf[]>(initialPdfs);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // 안드로이드 공유 시트(카카오톡/메일)로 받은 PDF는 서버에서 바로 처리 후 ?shared=/&shareError= 로 돌아온다
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("shared");
    const shareError = params.get("shareError");
    if (shared) {
      setToast(`📤 공유받은 PDF 학습 완료: ${shared}`);
      void refreshList();
    } else if (shareError) {
      setToast(`공유받은 PDF 처리 실패: ${shareError}`);
    }
    if (shared || shareError) {
      params.delete("shared");
      params.delete("shareError");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState(null, "", next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!itemsRef.current.some((it) => it.status === "uploading")) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const anyUploading = itemsRef.current.some((it) => it.status === "uploading");
    if (anyUploading) window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [items]);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/knowledge/list", { cache: "no-store" });
      const data = (await res.json()) as { pdfs?: KnowledgePdf[] };
      if (res.ok) setPdfs(data.pdfs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const updateItem = (clientId: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.clientId === clientId ? { ...it, ...patch } : it)));
  };

  // 1) 서명 URL 발급 → 2) 브라우저가 Storage로 직접 PUT(Vercel 4.5MB 본문 제한 회피) →
  // 3) /api/knowledge/upload 한 번 호출로 Claude 자동분류(knowledge_base)와 Voyage
  //    임베딩(knowledge_chunks)을 동시에 실행한다.
  const startUpload = async (clientId: string, file: File) => {
    updateItem(clientId, { status: "uploading", error: null });
    try {
      const signRes = await fetch("/api/admin/knowledge/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name })
      });
      const signed = await parseJsonResponse<{ path?: string; signedUrl?: string; message?: string }>(signRes);
      if (!signRes.ok || !signed.path || !signed.signedUrl) {
        throw new Error(signed.message ?? "업로드 URL 발급에 실패했습니다.");
      }

      const putRes = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": file.type || "application/pdf"
        },
        body: file
      });
      if (!putRes.ok) {
        throw new Error(`Storage 업로드 실패 (${putRes.status}) ${(await putRes.text().catch(() => "")).slice(0, 200)}`);
      }

      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, path: signed.path })
      });

      const result = await parseJsonResponse<{
        success?: boolean;
        sourceFile?: string;
        pdf?: { category?: string };
        knowledgeBaseChunkCount?: number;
        knowledgeBaseError?: string | null;
        voyageChunkCount?: number;
        voyageError?: string | null;
        error?: string;
      }>(res);

      if (!res.ok) {
        throw new Error(result.error ?? "업로드 실패");
      }

      updateItem(clientId, {
        status: "done",
        result: {
          sourceFile: result.sourceFile ?? file.name,
          category: result.pdf?.category,
          knowledgeBaseChunkCount: result.knowledgeBaseChunkCount ?? 0,
          knowledgeBaseError: result.knowledgeBaseError ?? null,
          voyageChunkCount: result.voyageChunkCount ?? 0,
          voyageError: result.voyageError ?? null
        }
      });
      void refreshList();
    } catch (err) {
      const message = err instanceof Error ? err.message : "업로드에 실패했습니다.";
      updateItem(clientId, { status: "error", error: message });
    }
  };

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.size > 0);
    for (const file of files) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setToast(`PDF 파일만 업로드할 수 있습니다: ${file.name}`);
        continue;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setToast(`파일이 너무 큽니다 (최대 50MB): ${file.name}`);
        continue;
      }
      const clientId = crypto.randomUUID();
      const newItem: UploadItem = {
        clientId,
        fileName: file.name,
        file,
        status: "uploading",
        error: null,
        result: null
      };
      setItems((prev) => [newItem, ...prev]);
      void startUpload(clientId, file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = (item: UploadItem) => {
    void startUpload(item.clientId, item.file);
  };

  const relearn = async (id: string) => {
    setPdfs((prev) => prev.map((p) => (p.id === id ? { ...p, status: "processing" } : p)));
    let reset = true;
    try {
      // 청크가 많은 대형 PDF는 한 번에 못 끝낼 수 있다 — done:false면 reset 없이 이어서 호출한다.
      for (;;) {
        const res = await fetch("/api/admin/knowledge/relearn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, reset })
        });
        const data = await parseJsonResponse<{ message?: string; done?: boolean }>(res);
        if (!res.ok) {
          setToast(data.message ?? "재학습에 실패했습니다.");
          break;
        }
        reset = false;
        void refreshList();
        if (data.done !== false) break;
      }
    } finally {
      void refreshList();
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("이 PDF와 학습된 내용을 삭제할까요?")) return;
    try {
      const res = await fetch("/api/admin/knowledge/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        setToast(data.message ?? "삭제에 실패했습니다.");
      }
    } finally {
      void refreshList();
    }
  };

  const tabCounts = (key: string) => (key === "all" ? pdfs.length : pdfs.filter((p) => p.category === key).length);
  const filteredPdfs = activeTab === "all" ? pdfs : pdfs.filter((p) => p.category === activeTab);
  const totalChunks = filteredPdfs.reduce((sum, p) => sum + p.chunkCount, 0);

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {/* 업로드 존 */}
      <div className="rounded-2xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* 데스크탑: 드래그앤드롭 */}
        <div
          className={`hidden md:flex md:flex-col md:items-center md:justify-center md:rounded-2xl md:border-2 md:border-dashed md:py-12 md:text-center md:transition ${
            dragOver ? "border-dk-blue bg-dk-sky" : "border-slate-300 bg-slate-50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <p className="text-3xl">📄</p>
          <p className="mt-2 text-base font-bold text-slate-800">PDF를 여기에 끌어다 놓으세요</p>
          <p className="mt-1 text-sm text-slate-500">또는 클릭해서 파일 선택 (여러 개 동시 업로드 가능)</p>
        </div>

        {/* 모바일: 큰 버튼 */}
        <div className="space-y-2.5 md:hidden">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-dk-blue text-base font-bold text-white shadow-[0_8px_20px_rgba(26,92,255,0.28)]"
          >
            📱 내 파일에서 선택
          </button>
          <p className="text-center text-xs text-slate-500">파일 앱 · 구글 드라이브 · iCloud에서 PDF를 선택할 수 있어요 (최대 50MB)</p>
          <p className="text-center text-xs text-slate-400">
            안드로이드: 홈 화면에 추가한 뒤 카카오톡/메일의 공유 버튼 → &quot;전기주치의&quot;로 PDF를 바로 보낼 수도 있어요 (공유는 4MB까지 — 더 크면 위 버튼으로 올려주세요)
          </p>
        </div>
      </div>

      {/* 처리 중 카드 */}
      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((item) => (
            <UploadProgressCard key={item.clientId} item={item} onRetry={() => retry(item)} />
          ))}
        </div>
      ) : null}

      {/* 카테고리 탭 */}
      <div className="rounded-2xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
        <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-3 dark:border-slate-700">
          {[{ key: "all", label: "전체" }, ...KNOWLEDGE_CATEGORIES].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-bold transition ${
                activeTab === tab.key ? "border-b-2 border-dk-navy text-dk-navy" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label} ({tabCounts(tab.key)})
            </button>
          ))}
        </div>
        <div className="p-4">
          <p className="mb-3 text-sm font-semibold text-slate-600">
            총 {filteredPdfs.length}개 파일 / {totalChunks}개 청크 학습됨
          </p>
          {filteredPdfs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">학습된 PDF가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {filteredPdfs.map((pdf) => (
                <PdfListRow key={pdf.id} pdf={pdf} onRelearn={() => void relearn(pdf.id)} onDelete={() => void remove(pdf.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadProgressCard({ item, onRetry }: { item: UploadItem; onRetry: () => void }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        item.status === "error" ? "border-rose-300 bg-rose-50" : item.status === "done" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="truncate text-[16px] font-bold text-slate-800">📄 {item.fileName}</p>

      {item.status === "done" && item.result ? (
        <div className="mt-2 space-y-1 text-[15px]">
          <p className="font-bold text-emerald-700">
            ✅ 학습 완료{item.result.category ? ` · ${item.result.category}` : ""}
          </p>
          <p className="text-slate-600">📊 분류 학습 {item.result.knowledgeBaseChunkCount}개 청크</p>
          <p className="text-slate-600">🔎 검색 학습 {item.result.voyageChunkCount}개 청크</p>
          {item.result.knowledgeBaseError ? (
            <p className="text-amber-700">⚠ 분류 학습 일부 실패: {item.result.knowledgeBaseError}</p>
          ) : null}
          {item.result.voyageError ? <p className="text-amber-700">⚠ 검색 학습 일부 실패: {item.result.voyageError}</p> : null}
        </div>
      ) : item.status === "uploading" ? (
        <div className="mt-2 space-y-1 text-[15px]">
          <p className="text-slate-700">⏳ 업로드 + 분류 + 임베딩 + 저장 중...</p>
        </div>
      ) : null}

      {item.status === "error" ? (
        <div className="mt-3 rounded-xl bg-white p-3">
          <p className="text-sm text-rose-800">{item.error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-10 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700"
          >
            재시도
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PdfListRow({ pdf, onRelearn, onDelete }: { pdf: KnowledgePdf; onRelearn: () => void; onDelete: () => void }) {
  const statusBadge =
    pdf.status === "completed"
      ? { text: "완료", cls: "bg-emerald-100 text-emerald-800" }
      : pdf.status === "failed"
        ? { text: "실패", cls: "bg-rose-100 text-rose-800" }
        : { text: "처리 중", cls: "bg-amber-100 text-amber-900" };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{pdf.fileName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {new Date(pdf.createdAt).toLocaleDateString("ko-KR")} · {pdf.chunkCount}개 청크
          {pdf.errorMessage ? ` · ${pdf.errorMessage}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-1 text-xs font-bold ${statusBadge.cls}`}>{statusBadge.text}</span>
        <button
          type="button"
          onClick={onRelearn}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700"
        >
          재학습
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="min-h-11 rounded-lg border border-rose-300 px-4 text-sm font-bold text-rose-700"
        >
          삭제
        </button>
      </div>
    </div>
  );
}
