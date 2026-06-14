"use client";

import { useCallback, useEffect, useState } from "react";

type YoutubeItem = {
  id: string;
  title: string;
  script: string | null;
  thumbnail_concept: string | null;
  status: string;
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

export default function HqContentQueue() {
  const [youtube, setYoutube] = useState<YoutubeItem[]>([]);
  const [kakao, setKakao] = useState<KakaoItem[]>([]);
  const [blog, setBlog] = useState<BlogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content/overview", { cache: "no-store" });
      const data = (await res.json()) as OverviewResponse;
      if (!res.ok) {
        setMessage(data.message ?? "콘텐츠 현황을 불러오지 못했습니다.");
        return;
      }
      setYoutube((data.youtubeQueue ?? []).filter((i) => i.status === "pending_approval"));
      setKakao((data.kakaoQueue ?? []).filter((i) => i.status === "pending_approval"));
      setBlog((data.blogPosts ?? []).filter((i) => i.status === "pending_approval"));
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
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`} className="cc-card p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-cc-navy px-2 py-0.5 text-xs font-bold text-white">{TYPE_LABEL[item.type]}</span>
                <span className="text-xs text-slate-500">{formatDate(item.created_at)}</span>
              </div>
              <h3 className="mt-2 text-sm font-black text-cc-text">{item.title || "(제목 없음)"}</h3>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{item.preview || "(내용 없음)"}</p>

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
          ))}
        </ul>
      )}
    </div>
  );
}
