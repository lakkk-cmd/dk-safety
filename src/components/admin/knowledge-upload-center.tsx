"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KNOWLEDGE_CATEGORIES, categoryLabel } from "@/lib/knowledge-categories";
import type { KnowledgePdf } from "@/lib/knowledge-pdfs";

type StepKey = "upload" | "classify" | "process";
type StepStatus = "pending" | "running" | "done" | "error";

type UploadItem = {
  clientId: string;
  fileName: string;
  file: File;
  pdfId: string | null;
  steps: Record<StepKey, StepStatus>;
  error: string | null;
  result: { category: string; reason: string; chunkCount: number } | null;
  pendingDuplicate: KnowledgePdf | null;
  skipped: boolean;
};

const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const STEP_LABEL: Record<StepKey, string> = {
  upload: "업로드",
  classify: "AI 카테고리 분류 중...",
  process: "텍스트 추출 + 지식베이스 저장 중..."
};

function initialSteps(): Record<StepKey, StepStatus> {
  return { upload: "pending", classify: "pending", process: "pending" };
}

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

function stepIcon(status: StepStatus, done: string, running: string) {
  if (status === "done") return done;
  if (status === "running") return running;
  if (status === "error") return "❌";
  return "⏳";
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
    const anyRunning = itemsRef.current.some((it) =>
      Object.values(it.steps).some((s) => s === "running" || s === "pending")
    );
    const handler = (e: BeforeUnloadEvent) => {
      if (!itemsRef.current.some((it) => Object.values(it.steps).some((s) => s === "running"))) return;
      e.preventDefault();
      e.returnValue = "";
    };
    if (anyRunning) window.addEventListener("beforeunload", handler);
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
  const updateStep = (clientId: string, step: StepKey, status: StepStatus) => {
    setItems((prev) =>
      prev.map((it) => (it.clientId === clientId ? { ...it, steps: { ...it.steps, [step]: status } } : it))
    );
  };

  const runClassifyAndProcess = async (clientId: string, pdfId: string) => {
    updateStep(clientId, "classify", "running");
    try {
      const classifyRes = await fetch("/api/admin/knowledge/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pdfId })
      });
      const classifyData = await parseJsonResponse<{ pdf?: KnowledgePdf; message?: string }>(classifyRes);
      if (!classifyRes.ok) throw new Error(classifyData.message ?? "분류 실패");
      updateStep(clientId, "classify", "done");

      updateStep(clientId, "process", "running");
      const processRes = await fetch("/api/admin/knowledge/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pdfId })
      });
      const processData = await parseJsonResponse<{ pdf?: KnowledgePdf; message?: string }>(processRes);
      if (!processRes.ok) throw new Error(processData.message ?? "처리 실패");
      updateStep(clientId, "process", "done");
      updateItem(clientId, {
        result: {
          category: processData.pdf?.category ?? "general",
          reason: processData.pdf?.categoryReason ?? "",
          chunkCount: processData.pdf?.chunkCount ?? 0
        }
      });
      void refreshList();
    } catch (err) {
      const message = err instanceof Error ? err.message : "처리에 실패했습니다.";
      setItems((prev) =>
        prev.map((it) => {
          if (it.clientId !== clientId) return it;
          const failedStep: StepKey = it.steps.classify === "running" || it.steps.classify === "pending" ? "classify" : "process";
          return { ...it, error: message, steps: { ...it.steps, [failedStep]: "error" } };
        })
      );
    }
  };

  // Vercel 서버리스 함수는 요청 본문이 4.5MB를 넘으면 함수 진입 전에 플랫폼이 바로 끊어버린다
  // (우리 코드가 응답을 만들 기회조차 없음). 그래서 큰 파일은 우리 서버를 거치지 않고
  // 서명 URL을 받아 브라우저에서 Supabase Storage로 직접 PUT한다.
  const startUpload = async (clientId: string, file: File, replaceId?: string) => {
    updateStep(clientId, "upload", "running");
    try {
      const signRes = await fetch("/api/admin/knowledge/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name })
      });
      const signData = await parseJsonResponse<{ path?: string; signedUrl?: string; message?: string }>(signRes);
      if (!signRes.ok || !signData.path || !signData.signedUrl) {
        throw new Error(signData.message ?? "업로드 URL 생성에 실패했습니다.");
      }

      const putBody = new FormData();
      putBody.append("cacheControl", "3600");
      putBody.append("", file);
      const putRes = await fetch(signData.signedUrl, {
        method: "PUT",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: putBody
      });
      if (!putRes.ok) {
        const putErrorText = await putRes.text().catch(() => "");
        throw new Error(`PDF 업로드 실패 (Storage ${putRes.status})${putErrorText ? `: ${putErrorText.slice(0, 200)}` : ""}`);
      }

      const res = await fetch("/api/admin/knowledge/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, path: signData.path, replaceId })
      });
      const data = await parseJsonResponse<{ pdf?: KnowledgePdf; message?: string }>(res);
      if (!res.ok || !data.pdf) throw new Error(data.message ?? "업로드 실패");
      updateItem(clientId, { pdfId: data.pdf.id, pendingDuplicate: null });
      updateStep(clientId, "upload", "done");
      await runClassifyAndProcess(clientId, data.pdf.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "업로드에 실패했습니다.";
      updateItem(clientId, { error: message });
      updateStep(clientId, "upload", "error");
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
        pdfId: null,
        steps: initialSteps(),
        error: null,
        result: null,
        pendingDuplicate: null,
        skipped: false
      };
      setItems((prev) => [newItem, ...prev]);

      try {
        const dupRes = await fetch("/api/admin/knowledge/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name })
        });
        const dupData = (await dupRes.json()) as { duplicate?: KnowledgePdf | null };
        if (dupRes.ok && dupData.duplicate) {
          updateItem(clientId, { pendingDuplicate: dupData.duplicate });
          continue;
        }
      } catch {
        /* 중복 확인 실패 시 그냥 진행 */
      }
      void startUpload(clientId, file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmReplace = (item: UploadItem) => {
    if (!item.pendingDuplicate) return;
    void startUpload(item.clientId, item.file, item.pendingDuplicate.id);
  };
  const cancelReplace = (clientId: string) => {
    setItems((prev) => prev.filter((it) => it.clientId !== clientId));
  };

  const retry = (item: UploadItem) => {
    if (item.steps.upload === "error") {
      void startUpload(item.clientId, item.file);
      return;
    }
    if (!item.pdfId) return;
    updateItem(item.clientId, { error: null });
    void runClassifyAndProcess(item.clientId, item.pdfId);
  };

  const relearn = async (id: string) => {
    setPdfs((prev) => prev.map((p) => (p.id === id ? { ...p, status: "processing" } : p)));
    try {
      const res = await fetch("/api/admin/knowledge/relearn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        setToast(data.message ?? "재학습에 실패했습니다.");
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
            <UploadProgressCard
              key={item.clientId}
              item={item}
              onConfirmReplace={() => confirmReplace(item)}
              onCancelReplace={() => cancelReplace(item.clientId)}
              onRetry={() => retry(item)}
            />
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

function UploadProgressCard({
  item,
  onConfirmReplace,
  onCancelReplace,
  onRetry
}: {
  item: UploadItem;
  onConfirmReplace: () => void;
  onCancelReplace: () => void;
  onRetry: () => void;
}) {
  if (item.pendingDuplicate) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p className="truncate text-sm font-bold text-slate-800">📄 {item.fileName}</p>
        <p className="mt-1 text-sm text-amber-900">이미 학습된 파일입니다. 재학습할까요?</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onConfirmReplace}
            className="min-h-11 flex-1 rounded-xl bg-dk-navy text-sm font-bold text-white"
          >
            재학습
          </button>
          <button
            type="button"
            onClick={onCancelReplace}
            className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  const allDone = item.steps.upload === "done" && item.steps.classify === "done" && item.steps.process === "done";
  const hasError = Object.values(item.steps).some((s) => s === "error");

  return (
    <div className={`rounded-2xl border p-4 ${hasError ? "border-rose-300 bg-rose-50" : allDone ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <p className="truncate text-[16px] font-bold text-slate-800">📄 {item.fileName}</p>

      {allDone && item.result ? (
        <div className="mt-2 space-y-1 text-[15px]">
          <p className="font-bold text-emerald-700">✅ 학습 완료</p>
          <p className="text-slate-700">
            📁 카테고리: {categoryLabel(item.result.category)} ({item.result.category})
          </p>
          {item.result.reason ? <p className="text-slate-600">💬 &quot;{item.result.reason}&quot;</p> : null}
          <p className="text-slate-600">📊 {item.result.chunkCount}개 청크 저장됨</p>
        </div>
      ) : (
        <div className="mt-2 space-y-1 text-[15px]">
          <p className={item.steps.upload === "error" ? "text-rose-700" : "text-slate-700"}>
            {stepIcon(item.steps.upload, "✅", "⏳")} 업로드{item.steps.upload === "done" ? " 완료" : item.steps.upload === "running" ? " 중..." : ""}
          </p>
          <p className={item.steps.classify === "error" ? "text-rose-700" : "text-slate-700"}>
            {stepIcon(item.steps.classify, "✅", "🤖")} {STEP_LABEL.classify}
          </p>
          <p className={item.steps.process === "error" ? "text-rose-700" : "text-slate-700"}>
            {stepIcon(item.steps.process, "✅", "⏳")} {STEP_LABEL.process}
          </p>
        </div>
      )}

      {hasError ? (
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
