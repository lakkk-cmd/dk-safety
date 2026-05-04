"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BoltIcon, ShieldIcon } from "@/components/ui/icons";

type Analytics = {
  totals: { apartmentCount: number; residentCount: number; diagnosisCount: number };
  riskSummary: { high: number; caution: number; normal: number };
  apartmentStats: Array<{
    apartmentId: string;
    apartmentName: string;
    residentCount: number;
    diagnosisCount: number;
    highRiskCount: number;
    avgScore: number;
  }>;
  highRiskCases: Array<{
    diagnosisId: string;
    residentName: string;
    phone: string;
    apartmentName: string;
    unitNumber: string;
    riskScore: number;
    summary: string;
    createdAt: string;
  }>;
  recentLogins: Array<{
    userId: string;
    name: string;
    phone: string;
    apartmentName: string;
    unitNumber: string;
    lastLoginAt: string;
  }>;
};

export default function ResidentSafetyDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/admin/resident-safety", { cache: "no-store" });
      const data = (await response.json()) as { analytics: Analytics };
      setAnalytics(data.analytics);
    })();
  }, []);

  const filteredHighRisk = useMemo(() => {
    if (!analytics) return [];
    const lowered = query.trim().toLowerCase();
    if (!lowered) return analytics.highRiskCases;
    return analytics.highRiskCases.filter((item) =>
      [item.residentName, item.phone, item.apartmentName, item.unitNumber].join(" ").toLowerCase().includes(lowered)
    );
  }, [analytics, query]);

  if (!analytics) {
    return <p className="text-sm text-slate-500">입주민 통계를 불러오는 중...</p>;
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="surface-card rounded-xl p-4">
          <p className="text-sm text-slate-500">등록 단지</p>
          <p className="mt-1 inline-flex items-center gap-1 text-2xl font-bold">
            <ShieldIcon className="h-5 w-5 text-primary" />
            {analytics.totals.apartmentCount}
          </p>
        </div>
        <div className="surface-card rounded-xl p-4">
          <p className="text-sm text-slate-500">입주민 계정</p>
          <p className="text-2xl font-bold">{analytics.totals.residentCount}</p>
        </div>
        <div className="surface-card rounded-xl p-4">
          <p className="text-sm text-slate-500">총 자가진단</p>
          <p className="mt-1 inline-flex items-center gap-1 text-2xl font-bold">
            <BoltIcon className="h-5 w-5 text-primary" />
            {analytics.totals.diagnosisCount}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-rose-600 p-4 text-white shadow-sm">
          <p className="text-sm text-rose-100">고위험</p>
          <p className="text-2xl font-bold">{analytics.riskSummary.high}</p>
        </div>
        <div className="rounded-xl bg-amber-500 p-4 text-white shadow-sm">
          <p className="text-sm text-amber-100">주의</p>
          <p className="text-2xl font-bold">{analytics.riskSummary.caution}</p>
        </div>
        <div className="rounded-xl bg-emerald-600 p-4 text-white shadow-sm">
          <p className="text-sm text-emerald-100">양호</p>
          <p className="text-2xl font-bold">{analytics.riskSummary.normal}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        위험지수는 자가진단 응답을 100점 만점으로 환산한 값입니다. 고위험 ≥73점, 주의 ≥40점 기준입니다.
      </p>

      <div className="surface-card rounded-2xl p-5">
        <h2 className="text-xl font-bold">단지별 위험도 현황</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2">아파트</th>
                <th className="px-3 py-2">입주민</th>
                <th className="px-3 py-2">진단수</th>
                <th className="px-3 py-2">고위험</th>
                <th className="px-3 py-2">평균(/100)</th>
              </tr>
            </thead>
            <tbody>
              {analytics.apartmentStats.map((item) => (
                <tr key={item.apartmentId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{item.apartmentName}</td>
                  <td className="px-3 py-2">{item.residentCount}</td>
                  <td className="px-3 py-2">{item.diagnosisCount}</td>
                  <td className="px-3 py-2">{item.highRiskCount}</td>
                  <td className="px-3 py-2">{item.avgScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-card rounded-2xl p-5">
        <h2 className="text-xl font-bold">최근 로그인 입주민</h2>
        <p className="mt-1 text-sm text-slate-600">최근 접속한 입주민을 확인해 안내 연락 우선순위를 정할 수 있습니다.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">아파트/동호수</th>
                <th className="px-3 py-2">최근 로그인</th>
              </tr>
            </thead>
            <tbody>
              {analytics.recentLogins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                    최근 로그인 기록이 없습니다.
                  </td>
                </tr>
              ) : (
                analytics.recentLogins.map((item) => (
                  <tr key={item.userId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{item.name}</td>
                    <td className="px-3 py-2">{item.phone}</td>
                    <td className="px-3 py-2">
                      {item.apartmentName} {item.unitNumber}
                    </td>
                    <td className="px-3 py-2">{new Date(item.lastLoginAt).toLocaleString("ko-KR")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">고위험 입주민 목록</h2>
            <p className="mt-1 text-xs text-slate-500">위험지수 73점 이상(100점 만점)</p>
          </div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름/연락처/단지 검색"
              className="soft-input text-sm"
            />
            <Link href="/api/admin/resident-safety/export" className="btn-primary px-3 py-2 text-sm">
              CSV
            </Link>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2">입주민</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">아파트/동호수</th>
                <th className="px-3 py-2">위험지수(/100)</th>
                <th className="px-3 py-2">요약</th>
                <th className="px-3 py-2">진단시각</th>
              </tr>
            </thead>
            <tbody>
              {filteredHighRisk.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                    조건에 맞는 고위험 목록이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredHighRisk.map((item) => (
                  <tr key={item.diagnosisId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{item.residentName}</td>
                    <td className="px-3 py-2">{item.phone}</td>
                    <td className="px-3 py-2">
                      {item.apartmentName} {item.unitNumber}
                    </td>
                    <td className="px-3 py-2 font-semibold text-rose-700">{item.riskScore}/100</td>
                    <td className="px-3 py-2">{item.summary}</td>
                    <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString("ko-KR")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
