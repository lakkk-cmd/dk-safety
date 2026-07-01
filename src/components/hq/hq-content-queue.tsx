"use client";

import { useCallback, useEffect, useState } from "react";

type VideoScene = {
  narration?: string;
  imagePrompt?: string;
  koreanSummary?: string;
  sceneType?: string;
  emotionTone?: string;
  connectionNote?: string;
};

type YoutubeItem = {
  id: string;
  title: string;
  script: string | null;
  thumbnail_concept: string | null;
  status: string;
  conti_summary: string | null;
  scenes: VideoScene[] | null;
  created_at: string;
};

type KakaoItem = {
  id: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
};

type BlogItem = {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  status: string;
  created_at: string;
};

type OverviewResponse = {
  youtubeQueue?: YoutubeItem[];
  kakaoQueue?: KakaoItem[];
  blogPosts?: BlogItem[];
  pending?: { youtube: number; kakao: number; blog: number };
  message?: string;
};

type ContentType = "youtube" | "kakao" | "blog";

const TYPE_LABEL: Record<ContentType, string> = {
  youtube: "유튜브",
  kakao: "카카오",
  blog: "블로그",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

const MASTER_CHARACTER_SHEET_NOTE = "[마스터 캐릭터 시트를 함께 입력하세요]";

function buildFlowPromptText(scenes: VideoScene[]): string {
  return scenes
    .map((s, i) => {
      const prompt = s.imagePrompt ? `${MASTER_CHARACTER_SHEET_NOTE}\n${s.imagePrompt}` : "(프롬프트 없음)";
      return `[씬 ${i + 1}${s.sceneType ? ` / ${s.sceneType}` : ""}]\n${prompt}`;
    })
    .join("\n\n");
}

export default function HqContentQueue() {
  const [youtubeMap, setYoutubeMap] = useState<Map<string, YoutubeItem>>(new Map());
  const [youtube, setYoutube] = useState<YoutubeItem[]>([]);
  const [kakao, setKakao] = useState<KakaoItem[]>([]);
  const [blog, setBlog] = useState<BlogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [generatingConti, setGeneratingConti] = useState<string | null>(null);
  const [expandedConti, setExpandedConti] = useState<string | null>(null);
  const [expandedFlow, setExpandedFlow] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content/overview", { cache: "no-store" });
      const data = (await res.json()) as OverviewResponse;
      if (!res.ok) {
        setMessage(data.message ?? "콘텐츠 현황을 불러오지 못했습니다.");
        return;
      }
      const APPROVAL_STATUSES = ["draft", "pending", "pending_approval", "review_required"];
      const pending = (data.youtubeQueue ?? []).filter((i) => APPROVAL_STATUSES.includes(i.status));
      setYoutube(pending);
      setYoutubeMap(new Map(pending.map((i) => [i.id, i])));
      setKakao((data.kakaoQueue ?? []).filter((i) => APPROVAL_STATUSES.includes(i.status)));
      // 블로그: draft(승인대기) | pending_approval(최종승인대기) | pending 모두 포함
      setBlog((data.blogPosts ?? []).filter((i) => APPROVAL_STATUSES.includes(i.status)));
    } catch {
      setMessage("콘텐츠 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (type: ContentType, id: string, action: "approve" | "reject", rejectReason?: string) => {
      setBusyId(id);
      setMessage(null);
      try {
        const endpoint = `/api/admin/content/${type}`;
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action, reason: rejectReason }),
        });
        const data = (await res.json()) as { message?: string };
        setMessage(data.message ?? (res.ok ? "처리되었습니다." : "처리에 실패했습니다."));
        if (res.ok) {
          if (type === "youtube") setYoutube((prev) => prev.filter((i) => i.id !== id));
          if (type === "kakao") setKakao((prev) => prev.filter((i) => i.id !== id));
          if (type === "blog") setBlog((prev) => prev.filter((i) => i.id !== id));
        }
      } catch {
        setMessage("처리 중 오류가 발생했습니다.");
      } finally {
        setBusyId(null);
        setRejecting(null);
        setReason("");
      }
    },
    [],
  );

  const generateConti = useCallback(async (id: string) => {
    setGeneratingConti(id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content/generate-conti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as {
        contiSummary?: string;
        visualMotif?: string;
        scenes?: VideoScene[];
        message?: string;
      };
      if (!res.ok) {
        setMessage(data.message ?? "콘티 생성 실패");
        return;
      }
      setYoutubeMap((prev) => {
        const next = new Map(prev);
        const item = next.get(id);
        if (item) {
          next.set(id, {
            ...item,
            conti_summary: data.contiSummary ?? null,
            scenes: data.scenes ?? null,
          });
        }
        return next;
      });
      setYoutube((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, conti_summary: data.contiSummary ?? null, scenes: data.scenes ?? null }
            : i,
        ),
      );
      setExpandedConti(id);
      setMessage("콘티 생성 완료!");
    } catch {
      setMessage("콘티 생성 중 오류가 발생했습니다.");
    } finally {
      setGeneratingConti(null);
    }
  }, []);

  const copyFlowPrompts = useCallback(
    (id: string) => {
      const item = youtubeMap.get(id);
      if (!item?.scenes) return;
      const text = buildFlowPromptText(item.scenes);
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [youtubeMap],
  );

  if (loading) {
    return <p className="cc-card p-6 text-sm text-slate-600">콘텐츠 승인 큐 불러오는 중…</p>;
  }

  const items: { type: ContentType; id: string; title: string; preview: string; created_at: string }[] = [
    ...youtube.map((i) => ({ type: "youtube" as const, id: i.id, title: i.title, preview: i.script ?? "", created_at: i.created_at })),
    ...kakao.map((i) => ({ type: "kakao" as const, id: i.id, title: i.title, preview: i.content, created_at: i.created_at })),
    ...blog.map((i) => ({ type: "blog" as const, id: i.id, title: i.title, preview: i.excerpt ?? i.content, created_at: i.created_at })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-4">
      {message ? <p className="cc-card border border-cc-gold/30 bg-cc-gold/10 px-4 py-3 text-sm text-cc-navy">{message}</p> : null}

      {items.length === 0 ? (
        <p className="cc-card p-6 text-sm text-slate-500">승인 대기 중인 콘텐츠가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const ytData = item.type === "youtube" ? youtubeMap.get(item.id) : null;
            const hasScript = !!ytData?.script;
            const hasConti = !!ytData?.conti_summary;
            const hasScenes = (ytData?.scenes?.length ?? 0) > 0;
            const isContiOpen = expandedConti === item.id;
            const isFlowOpen = expandedFlow === item.id;

            return (
              <li key={`${item.type}-${item.id}`} className="cc-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-cc-navy px-2 py-0.5 text-xs font-bold text-white">{TYPE_LABEL[item.type]}</span>
                  <span className="text-xs text-slate-500">{formatDate(item.created_at)}</span>
                </div>
                <h3 className="mt-2 text-sm font-black text-cc-text">{item.title || "(제목 없음)"}</h3>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{item.preview || "(내용 없음)"}</p>

                {/* 유튜브 콘티/Flow 버튼 영역 */}
                {item.type === "youtube" && hasScript && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {!hasConti ? (
                        <button
                          type="button"
                          disabled={generatingConti === item.id}
                          onClick={() => void generateConti(item.id)}
                          className="flex items-center gap-1 rounded-xl border border-cc-navy px-3 py-1.5 text-xs font-bold text-cc-navy disabled:opacity-50"
                        >
                          {generatingConti === item.id ? "콘티 생성 중…" : "🎬 콘티 생성"}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpandedConti(isContiOpen ? null : item.id)}
                            className="flex items-center gap-1 rounded-xl border border-cc-navy bg-cc-navy/5 px-3 py-1.5 text-xs font-bold text-cc-navy"
                          >
                            {isContiOpen ? "콘티 접기" : "📋 전체 콘티 보기"}
                          </button>
                          {hasScenes && (
                            <button
                              type="button"
                              onClick={() => setExpandedFlow(isFlowOpen ? null : item.id)}
                              className="flex items-center gap-1 rounded-xl border border-purple-600 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700"
                            >
                              {isFlowOpen ? "프롬프트 접기" : "✨ Flow용 프롬프트"}
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* 전체 콘티 보기 */}
                    {isContiOpen && ytData?.conti_summary && (
                      <div className="rounded-xl border border-cc-navy/20 bg-slate-50 p-4 text-sm">
                        <p className="mb-2 text-xs font-bold text-cc-navy">콘티 요약</p>
                        <p className="whitespace-pre-wrap text-slate-700">{ytData.conti_summary}</p>
                        {hasScenes && (
                          <div className="mt-4 space-y-3">
                            <p className="text-xs font-bold text-cc-navy">씬별 구성 ({ytData.scenes!.length}씬)</p>
                            {ytData.scenes!.map((s, i) => (
                              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-cc-navy">씬 {i + 1}</span>
                                  {s.sceneType && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{s.sceneType}</span>}
                                  {s.emotionTone && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{s.emotionTone}</span>}
                                </div>
                                {s.koreanSummary && <p className="mt-1 text-xs font-medium text-slate-600">{s.koreanSummary}</p>}
                                {s.narration && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">&ldquo;{s.narration}&rdquo;</p>}
                                {s.connectionNote && (
                                  <p className="mt-1 text-xs italic text-blue-600">→ {s.connectionNote}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Flow용 프롬프트 보기 */}
                    {isFlowOpen && ytData?.scenes && ytData.scenes.length > 0 && (
                      <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-bold text-purple-700">
                            Google Flow 프롬프트 ({ytData.scenes.length}씬)
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => copyFlowPrompts(item.id)}
                              className="rounded-lg bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700 hover:bg-purple-200"
                            >
                              {copied ? "복사됨!" : "전체 복사"}
                            </button>
                            <a
                              href="https://labs.google/fx/ko/tools/flow"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-purple-600 px-2 py-1 text-xs font-bold text-white hover:bg-purple-700"
                            >
                              Flow 열기 →
                            </a>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {ytData.scenes.map((s, i) => (
                            <div key={i} className="rounded-lg border border-purple-200 bg-white p-3">
                              <p className="mb-1 text-xs font-bold text-purple-600">씬 {i + 1}{s.sceneType ? ` / ${s.sceneType}` : ""}</p>
                              {s.imagePrompt && (
                                <p className="mb-1 text-xs font-bold text-amber-600">{MASTER_CHARACTER_SHEET_NOTE}</p>
                              )}
                              <p className="whitespace-pre-wrap text-xs text-slate-700">{s.imagePrompt ?? "(이미지 프롬프트 없음)"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 승인/거부 버튼 */}
                {rejecting === item.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder="반려 사유를 입력하면 에이전트가 다음 기획에 반영합니다."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-cc-navy focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void act(item.type, item.id, "reject", reason)}
                        className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-cc-red px-4 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {busyId === item.id ? "처리 중…" : "반려 확정"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejecting(null);
                          setReason("");
                        }}
                        className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-cc-text"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void act(item.type, item.id, "approve")}
                      className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-cc-green px-4 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busyId === item.id ? "처리 중…" : "승인"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setRejecting(item.id)}
                      className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-cc-red px-4 text-sm font-bold text-white disabled:opacity-50"
                    >
                      거부
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
