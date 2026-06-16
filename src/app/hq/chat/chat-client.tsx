"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatAgent = { id: string; name: string; role: string };
type ChatMessage = { role: "user" | "assistant"; content: string; created_at: string };

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function HqChatClient() {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [groups, setGroups] = useState<Record<string, string[]>>({});
  const [selectedAgent, setSelectedAgent] = useState("cto");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      if (!res.ok) {
        setError(data.message ?? "불러오기에 실패했습니다.");
        return;
      }
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

  useEffect(() => {
    void load("cto");
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      if (agentId === selectedAgent || sending) return;
      setInitialLoading(true);
      void load(agentId);
    },
    [selectedAgent, sending, load],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: text, created_at: new Date().toISOString() }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgent, message: text }),
      });
      const data = (await res.json()) as { reply?: string; message?: string };
      if (!res.ok || !data.reply) {
        setError(data.message ?? "응답 생성에 실패했습니다.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply as string, created_at: new Date().toISOString() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "응답 생성에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }, [input, sending, selectedAgent]);

  const currentAgent = agents.find((a) => a.id === selectedAgent);

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          AI 채팅
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">9-에이전트와 1:1 대화</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          경영진 6명 + 콘텐츠팀 3명에게 실시간 현황을 기반으로 질문하고 언제든지 의견을 구할 수 있습니다.
        </p>
      </header>

      {error ? <p className="cc-card border border-cc-red/30 bg-cc-red/10 px-4 py-3 text-sm text-cc-red">{error}</p> : null}

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
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-cc-navy text-white" : "border border-slate-200 bg-white text-cc-text"
                  }`}
                >
                  {m.content}
                </div>
                <span className="mt-1 text-[10px] text-slate-400">{formatTime(m.created_at)}</span>
              </div>
            ))
          )}
          {sending ? (
            <div className="flex flex-col items-start">
              {currentAgent ? <span className="mb-1 text-xs font-bold text-slate-500">{currentAgent.name}</span> : null}
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">생각 중…</div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            disabled={sending || initialLoading}
            rows={2}
            placeholder={currentAgent ? `${currentAgent.name}에게 메시지 보내기...` : "메시지 입력..."}
            className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-cc-navy focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || initialLoading || !input.trim()}
            className="flex min-h-12 items-center justify-center rounded-xl bg-cc-navy px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {sending ? "전송 중…" : "전송"}
          </button>
        </div>
      </section>
    </main>
  );
}
