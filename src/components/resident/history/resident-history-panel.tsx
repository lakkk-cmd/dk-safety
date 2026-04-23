"use client";

import { useEffect, useMemo, useState } from "react";
import { diagnosisRiskScoreOn100, scoreToneClass } from "@/lib/diagnosis-score";

type Diagnosis = {
  id: string;
  createdAt: string;
  riskScore: number;
  scoreVersion?: 1 | 2 | 3;
  sectorScores?: Array<{
    id: "breaker" | "outlet" | "habit";
    title: string;
    score: number;
  }>;
  summary: string;
};

export default function ResidentHistoryPanel() {
  const [items, setItems] = useState<Diagnosis[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/resident/diagnosis/history", { cache: "no-store" });
        const data = (await response.json()) as { diagnoses?: Diagnosis[]; message?: string };
        if (!response.ok) {
          throw new Error(data.message || "이력을 불러오지 못했습니다.");
        }
        setItems(data.diagnoses ?? []);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "이력 조회 실패");
      }
    })();
  }, []);

  const stats = useMemo(() => {
    if (items.length === 0) {
      return { avg: 0, latest: 0, count: 0 };
    }
    const scores = items.map((item) => diagnosisRiskScoreOn100(item));
    const latest = scores[0] ?? 0;
    const avg = Math.round(scores.reduce((acc, s) => acc + s, 0) / scores.length);
    return { avg, latest, count: items.length };
  }, [items]);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="surface-card rounded-xl p-4">
          <p className="text-sm text-slate-500">최근 위험지수</p>
          <p className="mt-1 text-2xl font-bold">
            {stats.latest}
            <span className="text-base font-semibold text-slate-500">/100</span>
          </p>
        </div>
        <div className="surface-card rounded-xl p-4">
          <p className="text-sm text-slate-500">평균 위험지수</p>
          <p className="mt-1 text-2xl font-bold">
            {stats.avg}
            <span className="text-base font-semibold text-slate-500">/100</span>
          </p>
        </div>
        <div className="surface-card rounded-xl p-4">
          <p className="text-sm text-slate-500">진단 횟수</p>
          <p className="mt-1 text-2xl font-bold">{stats.count}회</p>
        </div>
      </div>

      <div className="surface-card rounded-2xl p-5">
        <h2 className="text-xl font-bold">자가진단 이력</h2>
        <p className="mt-1 text-sm text-slate-600">
          최근 진단 결과를 시간순으로 확인하세요. 위험지수는 만점 100점 환산입니다.
        </p>
        {message ? <p className="mt-3 text-sm text-rose-700">{message}</p> : null}
        <ul className="mt-4 space-y-3">
          {items.length === 0 ? <li className="text-sm text-slate-500">아직 진단 이력이 없습니다.</li> : null}
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">{new Date(item.createdAt).toLocaleString("ko-KR")}</p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${scoreToneClass(diagnosisRiskScoreOn100(item))}`}
                >
                  {diagnosisRiskScoreOn100(item)}/100
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{item.summary}</p>
              {item.sectorScores && item.sectorScores.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {item.sectorScores.map((sector) => (
                    <div key={sector.id} className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-slate-500">{sector.title}</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{sector.score}/100</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
