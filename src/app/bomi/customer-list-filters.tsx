"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  birthDate: string | null;
  gender: "남" | "여" | null;
  occupation: string;
  createdAt: string;
};

const ALL = "전체";

function ageBand(birthDate: string | null): string {
  if (!birthDate) return "미상";
  const year = Number(birthDate.slice(0, 4));
  if (!Number.isFinite(year) || year <= 0) return "미상";
  const age = new Date().getFullYear() - year;
  if (age < 10) return "10대 미만";
  const decade = Math.floor(age / 10) * 10;
  return decade >= 70 ? "70대 이상" : `${decade}대`;
}

/** 주소 앞 두 토큰(시/도 + 시/군/구)을 지역 단위로 사용 — 세부 번지수는 필터에 필요 없음 */
function regionOf(address: string): string {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "미상";
  return tokens.slice(0, 2).join(" ");
}

export default function CustomerListFilters({ customers }: { customers: Customer[] }) {
  const [occupation, setOccupation] = useState(ALL);
  const [gender, setGender] = useState(ALL);
  const [age, setAge] = useState(ALL);
  const [region, setRegion] = useState(ALL);

  const occupationOptions = useMemo(
    () => [ALL, ...Array.from(new Set(customers.map((c) => c.occupation.trim() || "미상"))).sort()],
    [customers]
  );
  const ageOptions = useMemo(
    () => [ALL, ...Array.from(new Set(customers.map((c) => ageBand(c.birthDate)))).sort()],
    [customers]
  );
  const regionOptions = useMemo(
    () => [ALL, ...Array.from(new Set(customers.map((c) => regionOf(c.address)))).sort()],
    [customers]
  );

  const filtered = customers.filter((c) => {
    if (occupation !== ALL && (c.occupation.trim() || "미상") !== occupation) return false;
    if (gender !== ALL && (c.gender ?? "미상") !== gender) return false;
    if (age !== ALL && ageBand(c.birthDate) !== age) return false;
    if (region !== ALL && regionOf(c.address) !== region) return false;
    return true;
  });

  const resetAll = () => {
    setOccupation(ALL);
    setGender(ALL);
    setAge(ALL);
    setRegion(ALL);
  };

  const hasFilter = occupation !== ALL || gender !== ALL || age !== ALL || region !== ALL;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600">직업</label>
          <select value={occupation} onChange={(e) => setOccupation(e.target.value)} className="soft-input mt-1">
            {occupationOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600">성별</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)} className="soft-input mt-1">
            <option value={ALL}>전체</option>
            <option value="남">남</option>
            <option value="여">여</option>
            <option value="미상">미상</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600">나이대</label>
          <select value={age} onChange={(e) => setAge(e.target.value)} className="soft-input mt-1">
            {ageOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600">지역</label>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="soft-input mt-1">
            {regionOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        {hasFilter ? (
          <button type="button" onClick={resetAll} className="btn-outline px-3 py-2 text-xs">
            필터 초기화
          </button>
        ) : null}
        <span className="text-xs text-slate-400">{filtered.length}명 / 전체 {customers.length}명</span>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">조건에 맞는 고객이 없습니다.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200">
          {filtered.map((customer) => (
            <li key={customer.id} className="py-3">
              <Link href={`/customers/${customer.id}`} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{customer.name}</p>
                  <p className="text-xs text-slate-500">
                    {customer.phone || "연락처 미입력"} · {customer.occupation || "직업 미입력"} ·{" "}
                    {regionOf(customer.address)}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(customer.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
