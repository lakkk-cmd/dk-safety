"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatAgent = { id: string; name: string; role: string };
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
  attachment_url?: string | null;
};
type Attachment = { url: string; name: string; mediaType: string; previewUrl?: string };

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

function AttachmentPreview({ url, name, onRemove }: { url?: string; name: string; onRemove?: () => void }) {
  const img = url && (name.match(/\.(png|jpe?g|gif|webp)$/i) || url.match(/\.(png|jpe?g|gif|webp)($|\?)/i));
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
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
  );
}

export default function HqChatClient() {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [groups, setGroups] = useState<Record<string, string[]>>({});
  const [selectedAgent, setSelectedAgent] = useState("general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [lastUserMessage, setLastUserMessage] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
      setInitialLoading(true);
      void load(agentId);
    },
    [selectedAgent, sending, load],
  );

  // 파일 업로드 공통 처리
  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setShowMenu(false);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/chat/upload", { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; mediaType?: string; message?: string };
      if (!res.ok) { setError(data.message ?? "업로드 실패"); return; }
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setAttachment({ url: data.url!, name: file.name, mediaType: data.mediaType ?? file.type, previewUrl });
    } catch {
      setError("파일 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }, []);

  // 파일 선택 핸들러
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadFile(file);
      e.target.value = "";
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
      await uploadFile(file);
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

  const currentAgent = agents.find((a) => a.id === selectedAgent);

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          AI 채팅
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">AI 에이전트와 1:1 대화</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          총괄에게 전체 현황을 물어보거나, 경영진 6명 + 콘텐츠팀 3명에게 직접 질문하세요.
        </p>
      </header>

      {error ? (
        <p className="cc-card border border-cc-red/30 bg-cc-red/10 px-4 py-3 text-sm text-cc-red">{error}</p>
      ) : null}

      <section className="cc-card p-4 md:p-6">
        {Object.entries(groups).map(([groupLabel, ids]) => (
          <div key={groupLabel} className="mb-3 last:mb-0">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{groupLabel}</p>
            <div className="flex flex-wrap gap-2">
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
                    className={`flex min-h-12 items-center rounded-xl border px-4 text-sm font-bold transition disabled:opacity-50 ${
                      active
                        ? "border-cc-gold bg-cc-gold/10 text-cc-navy"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-cc-bg"
                    }`}
                  >
                    {agent.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="cc-card flex flex-col p-4 md:p-6">
        <h2 className="text-base font-black text-cc-text">
          {currentAgent ? `${currentAgent.name} · ${currentAgent.role}` : "대화"}
        </h2>

        {/* 메시지 목록 */}
        <div className="mt-4 flex max-h-[50vh] min-h-[300px] flex-col gap-3 overflow-y-auto rounded-xl bg-cc-bg p-3">
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
          <div className="mt-3 text-xs text-slate-500">업로드 중…</div>
        ) : attachment ? (
          <div className="mt-3">
            <AttachmentPreview url={attachment.previewUrl ?? attachment.url} name={attachment.name} onRemove={clearAttachment} />
          </div>
        ) : null}

        {/* 입력창 + 버튼 */}
        <div className="mt-4 flex items-end gap-2">
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
                  className="flex items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-cc-bg"
                >
                  <span>📎</span> 파일/사진 첨부
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
            rows={2}
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
          <p className="mt-2 text-xs text-cc-navy">🔍 총괄은 필요하다고 판단되면 자동으로 웹 검색을 사용합니다.</p>
        ) : webSearchOn ? (
          <p className="mt-2 text-xs text-cc-navy">
            🔍 웹 검색 활성 — 전송 시 최신 정보를 검색해 답변합니다.{" "}
            <button type="button" className="underline" onClick={() => setWebSearchOn(false)}>
              끄기
            </button>
          </p>
        ) : null}
      </section>
    </main>
  );
}
