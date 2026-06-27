"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatSession } from "@/hooks/useChatSession";

type ChatAgent = { id: string; name: string; role: string };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
  attachment_url?: string | null;
};
type PdfLearning = { chunksSaved: number; error?: string };
type Attachment = { url?: string; base64?: string; name: string; mediaType: string; previewUrl?: string; pdfLearning?: PdfLearning };

const AGENT_ICONS: Record<string, string> = {
  general: "🧭",
  cto: "⚙️",
  cso: "🎯",
  cmo: "📣",
  coo: "🛠️",
  cfo: "💰",
  clo: "⚖️",
  youtube_pd: "🎬",
  kakao_manager: "💬",
  blog_editor: "✍️",
};

function agentIcon(id: string): string {
  return AGENT_ICONS[id] ?? "🤖";
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function isImage(mediaType?: string | null) {
  return !!mediaType?.startsWith("image/");
}

function DelegationButtons({
  content,
  agents,
  onDelegate,
}: {
  content: string;
  agents: ChatAgent[];
  onDelegate: (id: string) => void;
}) {
  const mentioned = agents.filter((a) => a.id !== "general" && content.includes(a.name));
  if (!mentioned.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {mentioned.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onDelegate(a.id)}
          className="rounded-full border border-cc-navy/40 bg-cc-navy/5 px-3 py-1 text-xs font-bold text-cc-navy transition hover:bg-cc-navy/15"
        >
          {a.name}로 이동 →
        </button>
      ))}
    </div>
  );
}

function AttachmentPreview({
  url,
  name,
  pdfLearning,
  onRemove,
}: {
  url?: string;
  name: string;
  pdfLearning?: PdfLearning;
  onRemove?: () => void;
}) {
  const img = url && (name.match(/\.(png|jpe?g|gif|webp)$/i) || url.match(/\.(png|jpe?g|gif|webp)($|\?)/i));
  const isPdf = name.match(/\.pdf$/i);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-10 w-10 rounded object-cover" />
        ) : (
          <span className="text-lg">📄</span>
        )}
        <span className="max-w-[180px] truncate text-slate-700">{name}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto text-slate-400 hover:text-cc-red">
            ✕
          </button>
        )}
      </div>
      {isPdf && pdfLearning ? (
        <p className={`mt-1 font-bold ${pdfLearning.error ? "text-cc-red" : "text-cc-green"}`}>
          {pdfLearning.error
            ? `⚠️ 학습 실패: ${pdfLearning.error}`
            : `📚 학습자료로 저장됨 (${pdfLearning.chunksSaved}개 항목)`}
        </p>
      ) : null}
    </div>
  );
}

export default function HqChatClient() {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [groups, setGroups] = useState<Record<string, string[]>>({});
  const [selectedAgent, setSelectedAgent] = useState("general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { saveSession } = useChatSession(messages);
  const [input, setInput] = useState("");
  const [lastUserMessage, setLastUserMessage] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [headerPinned, setHeaderPinned] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(`${selectedAgent}-${Date.now()}`);
  const savingRef = useRef(false);

  const showHeader = messages.length === 0 || headerPinned;

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!showMenu) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showMenu]);

  const clearAttachment = useCallback(() => {
    setAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const load = useCallback(async (agentId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/chat?agentId=${agentId}`, { cache: "no-store" });
      const data = (await res.json()) as {
        agents?: ChatAgent[];
        groups?: Record<string, string[]>;
        history?: ChatMessage[];
        message?: string;
      };
      if (!res.ok) { setError(data.message ?? "불러오기에 실패했습니다."); return; }
      if (data.agents) setAgents(data.agents);
      if (data.groups) setGroups(data.groups);
      setMessages(data.history ?? []);
      setSelectedAgent(agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기에 실패했습니다.");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { void load("general"); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      if (agentId === selectedAgent || sending) return;
      // 현재 대화 세션 저장 (fire-and-forget)
      if (messages.length > 0 && !savingRef.current) {
        savingRef.current = true;
        const sid = sessionIdRef.current;
        const msgs = messages.map((m) => ({ role: m.role, content: m.content }));
        fetch("/api/chat/end-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid, messages: msgs }),
        })
          .catch(() => {})
          .finally(() => { savingRef.current = false; });
        sessionIdRef.current = `${agentId}-${Date.now()}`;
      }
      setInitialLoading(true);
      setHeaderPinned(false);
      void load(agentId);
    },
    [selectedAgent, sending, load, messages],
  );

  // 파일 업로드 공통 처리
  const uploadFile = useCallback((file: File) => {
    setShowMenu(false);
    setError(null);

    if (file.type.startsWith("image/")) {
      // 이미지: 클라이언트 base64 변환 (Supabase 업로드 불필요)
      if (file.size > 5 * 1024 * 1024) {
        setError("이미지는 5MB 이하만 첨부 가능합니다.");
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        setAttachment({ base64, name: file.name, mediaType: file.type, previewUrl });
      };
      reader.readAsDataURL(file);
      return;
    }

    // PDF 등 비이미지: Supabase 업로드 (PDF 학습 기능 유지)
    void (async () => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/admin/chat/upload", { method: "POST", body: form });
        const data = (await res.json()) as { url?: string; mediaType?: string; message?: string; pdfLearning?: PdfLearning };
        if (!res.ok) { setError(data.message ?? "업로드 실패"); return; }
        setAttachment({ url: data.url!, name: file.name, mediaType: data.mediaType ?? file.type, pdfLearning: data.pdfLearning });
      } catch {
        setError("파일 업로드에 실패했습니다.");
      } finally {
        setUploading(false);
      }
    })();
  }, []);

  // 파일 선택 핸들러
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      e.target.value = "";
    },
    [uploadFile],
  );

  // 드래그앤드롭 핸들러
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  // 스크린샷 캡처
  const handleScreenshot = useCallback(async () => {
    setShowMenu(false);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("스크린샷은 HTTPS 환경(dkansim.com)에서만 동작합니다.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); });
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("캡처 실패"))), "image/png"),
      );
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
      uploadFile(file);
    } catch (err) {
      if ((err as Error).name !== "NotAllowedError") {
        setError("스크린샷 캡처 실패. HTTPS 환경에서만 동작합니다.");
      }
    }
  }, [uploadFile]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachment) || sending || uploading) return;

    if (text) setLastUserMessage(text);
    const optimisticMsg: ChatMessage = {
      role: "user",
      content: text || `[첨부: ${attachment!.name}]`,
      created_at: new Date().toISOString(),
      attachment_url: attachment?.url,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput("");
    const sent = attachment;
    clearAttachment();
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent,
          message: text,
          attachmentUrl: sent?.url,
          attachmentBase64: sent?.base64,
          attachmentType: sent?.mediaType,
          webSearch: webSearchOn,
        }),
      });
      const data = (await res.json()) as { reply?: string; message?: string };
      if (!res.ok || !data.reply) { setError(data.message ?? "응답 생성에 실패했습니다."); return; }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply as string, created_at: new Date().toISOString() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "응답 생성에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }, [input, attachment, sending, uploading, selectedAgent, webSearchOn, clearAttachment]);

  const handleDelegate = useCallback(
    (agentId: string) => {
      setInput(lastUserMessage);
      handleSelectAgent(agentId);
    },
    [lastUserMessage, handleSelectAgent],
  );

  // "새 대화" — 현재 세션 저장 후 메시지 초기화
  const handleNewChat = useCallback(async () => {
    await saveSession(true);
    setMessages([]);
    setInput("");
    setError(null);
    clearAttachment();
  }, [saveSession, clearAttachment]);

  const currentAgent = agents.find((a) => a.id === selectedAgent);
  const flatAgentIds = Object.values(groups).flat();

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* 컴팩트 상단 바 */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white sm:inline-flex">
            AI 채팅
          </span>
          <span className="text-sm font-black text-cc-text">
            {agentIcon(selectedAgent)} {currentAgent ? `${currentAgent.name} · ${currentAgent.role}` : "대화"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void handleNewChat()}
                disabled={sending || savingRef.current}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-500 transition hover:border-cc-navy hover:text-cc-navy disabled:opacity-40"
              >
                💾 저장 &amp; 새 대화
              </button>
              <button
                type="button"
                onClick={() => setHeaderPinned((v) => !v)}
                className="text-xs font-bold text-slate-400 underline hover:text-cc-navy"
              >
                {showHeader ? "설명 닫기" : "ℹ️ 설명"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {showHeader ? (
        <header className="hidden flex-shrink-0 cc-card p-4 md:flex md:p-5">
          <h1 className="text-lg font-black tracking-[-0.02em] text-cc-text md:text-xl">AI 에이전트와 1:1 대화</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-600 md:text-sm">
            총괄에게 전체 현황을 물어보거나, 경영진 6명 + 콘텐츠팀 3명에게 직접 질문하세요.
          </p>
        </header>
      ) : null}

      {error ? (
        <p className="flex-shrink-0 cc-card border border-cc-red/30 bg-cc-red/10 px-4 py-3 text-sm text-cc-red">{error}</p>
      ) : null}

      {/* 모바일: 가로 스크롤 칩 */}
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto pb-1 pt-0 md:hidden">
        {flatAgentIds.map((id) => {
          const agent = agents.find((a) => a.id === id);
          if (!agent) return null;
          const active = id === selectedAgent;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleSelectAgent(id)}
              disabled={sending}
              className={`flex-shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                active
                  ? "border-cc-gold bg-cc-gold/10 text-sm font-black text-cc-navy"
                  : "border-slate-300 bg-white text-xs font-bold text-slate-500"
              }`}
            >
              {agentIcon(id)} {agent.name}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* 데스크톱: 좌측 사이드바 */}
        <aside className="hidden w-44 flex-shrink-0 flex-col gap-3 overflow-y-auto cc-card p-2 md:flex">
          {Object.entries(groups).map(([groupLabel, ids]) => (
            <div key={groupLabel}>
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{groupLabel}</p>
              <div className="flex flex-col gap-0.5">
                {ids.map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  if (!agent) return null;
                  const active = id === selectedAgent;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectAgent(id)}
                      disabled={sending}
                      className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-left text-xs font-bold transition disabled:opacity-50 ${
                        active ? "bg-cc-gold/10 text-cc-navy" : "text-slate-600 hover:bg-cc-bg"
                      }`}
                    >
                      <span>{agentIcon(id)}</span>
                      <span className="truncate">{agent.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* 채팅 영역 */}
        <section
          className="flex min-h-0 flex-1 flex-col cc-card p-2 md:p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {/* 메시지 목록 */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-cc-bg p-2 md:p-3">
            {initialLoading ? (
              <p className="text-sm text-slate-500">불러오는 중…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-500">{currentAgent?.name ?? "에이전트"}에게 첫 메시지를 보내보세요.</p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  {m.role === "assistant" && currentAgent ? (
                    <span className="mb-1 text-xs font-bold text-slate-500">{currentAgent.name}</span>
                  ) : null}
                  {m.attachment_url ? (
                    <div className="mb-1 max-w-[85%]">
                      {isImage(m.attachment_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.attachment_url}
                          alt="첨부 이미지"
                          className="max-h-48 rounded-xl object-cover"
                        />
                      ) : (
                        <a
                          href={m.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-cc-navy underline"
                        >
                          📄 첨부파일 보기
                        </a>
                      )}
                    </div>
                  ) : null}
                  {m.content ? (
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                        m.role === "user" ? "bg-cc-navy text-white" : "border border-slate-200 bg-white text-cc-text"
                      }`}
                    >
                      {m.content}
                    </div>
                  ) : null}
                  {m.role === "assistant" && selectedAgent === "general" ? (
                    <DelegationButtons content={m.content} agents={agents} onDelegate={handleDelegate} />
                  ) : null}
                  <span className="mt-1 text-[10px] text-slate-400">{formatTime(m.created_at)}</span>
                </div>
              ))
            )}
            {sending ? (
              <div className="flex flex-col items-start">
                {currentAgent ? <span className="mb-1 text-xs font-bold text-slate-500">{currentAgent.name}</span> : null}
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
                  생각 중…{selectedAgent === "general" || webSearchOn ? " 🔍" : ""}
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {/* 첨부 미리보기 */}
          {uploading ? (
            <div className="mt-2 flex-shrink-0 text-xs text-slate-500">업로드 중…</div>
          ) : attachment ? (
            <div className="mt-2 flex-shrink-0">
              <AttachmentPreview
                url={attachment.previewUrl ?? attachment.url}
                name={attachment.name}
                pdfLearning={attachment.pdfLearning}
                onRemove={clearAttachment}
              />
            </div>
          ) : null}

          {/* 입력창 + 버튼 */}
          <div className="mt-3 flex flex-shrink-0 items-end gap-2">
            {/* hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.csv,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* "+" 버튼 + 팝업 메뉴 */}
            <div ref={menuRef} className="relative flex-shrink-0">
              {showMenu && (
                <div className="absolute bottom-full left-0 mb-2 z-20 flex min-w-[180px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); fileInputRef.current?.click(); }}
                    className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left text-sm text-slate-700 hover:bg-cc-bg"
                  >
                    <span className="flex items-center gap-2">
                      <span>📎</span> 파일/사진 첨부
                    </span>
                    <span className="pl-6 text-[10px] text-slate-400">PDF는 자동으로 학습자료에 저장돼요</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleScreenshot()}
                    className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-700 hover:bg-cc-bg"
                  >
                    <span>🖥️</span> 스크린샷 캡처
                  </button>
                  {selectedAgent !== "general" && (
                    <button
                      type="button"
                      onClick={() => { setWebSearchOn((v) => !v); setShowMenu(false); }}
                      className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm hover:bg-cc-bg"
                    >
                      <span>🔍</span>
                      <span className={webSearchOn ? "text-cc-navy font-bold" : "text-slate-700"}>
                        웹 검색 {webSearchOn ? "ON ✓" : "OFF"}
                      </span>
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowMenu((v) => !v)}
                disabled={sending || uploading}
                title={selectedAgent === "general" ? "첨부 (총괄은 웹검색이 항상 켜져 있습니다)" : "첨부/검색 옵션"}
                className={`flex h-[46px] w-[46px] items-center justify-center rounded-xl border text-lg font-bold transition disabled:opacity-50 ${
                  showMenu || (selectedAgent !== "general" && webSearchOn) || attachment
                    ? "border-cc-navy bg-cc-navy/10 text-cc-navy"
                    : "border-slate-300 bg-white text-slate-500 hover:bg-cc-bg"
                }`}
              >
                {selectedAgent === "general" ? "🔍" : webSearchOn ? "🔍" : "+"}
              </button>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={sending || initialLoading || uploading}
              rows={1}
              placeholder={currentAgent ? `${currentAgent.name}에게 메시지 보내기...` : "메시지 입력..."}
              className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-cc-navy focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || initialLoading || uploading || (!input.trim() && !attachment)}
              className="flex min-h-[46px] items-center justify-center rounded-xl bg-cc-navy px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? "전송 중…" : uploading ? "업로드 중…" : "전송"}
            </button>
          </div>

          {/* 웹 검색 활성 표시 */}
          {selectedAgent === "general" ? (
            <p className="mt-2 flex-shrink-0 text-xs text-cc-navy">🔍 총괄은 필요하다고 판단되면 자동으로 웹 검색을 사용합니다.</p>
          ) : webSearchOn ? (
            <p className="mt-2 flex-shrink-0 text-xs text-cc-navy">
              🔍 웹 검색 활성 — 전송 시 최신 정보를 검색해 답변합니다.{" "}
              <button type="button" className="underline" onClick={() => setWebSearchOn(false)}>
                끄기
              </button>
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
