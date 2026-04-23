"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { validateReservationInput } from "@/lib/reservation-validation";
import { ShieldIcon } from "@/components/ui/icons";

const initialForm = {
  name: "",
  phone: "",
  address: "",
  serviceType: "누전/합선 점검",
  preferredDate: "",
  preferredTime: "",
  detail: ""
};

type ReservationItem = {
  id: string;
  name: string;
  phone: string;
  address: string;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
  detail: string;
  priority: "normal" | "emergency";
  status: "접수" | "진행중" | "완료";
  note: string;
  noteUpdatedAt: string | null;
  createdAt: string;
};

type ResidentMe = {
  name: string;
  phone: string;
  apartmentName: string;
  unitNumber: string;
};

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function ReservationForm() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState(initialForm);
  const [residentMe, setResidentMe] = useState<ResidentMe | null>(null);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [recent, setRecent] = useState<ReservationItem[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const appendPhotos = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setPhotos((prev) => [...prev, ...incoming].slice(0, 5));
  };

  useEffect(() => {
    const source = searchParams.get("source");
    if (source !== "diagnosis") {
      return;
    }
    const riskScore = searchParams.get("riskScore");
    const scoreText =
      riskScore && !Number.isNaN(Number(riskScore)) ? `${riskScore}/100점` : "미기재";
    setForm((prev) => ({
      ...prev,
      serviceType: "정기 안전 점검",
      detail: prev.detail || `입주민 자가진단 연계 예약 요청 (위험지수: ${scoreText})`
    }));
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/resident/me", { cache: "no-store" });
        const data = await readJsonSafely<{ user?: ResidentMe }>(response);
        if (!response.ok || !data?.user) return;
        const user = data.user;
        setResidentMe(user);
        const defaultAddress = `${user.apartmentName} ${user.unitNumber}`.trim();
        setForm((prev) => ({
          ...prev,
          name: prev.name || user.name,
          phone: prev.phone || user.phone,
          address: prev.address || defaultAddress
        }));
      } catch {
        // 로그인 정보 자동입력은 실패해도 예약 폼 사용에는 영향이 없도록 무시합니다.
      }
    })();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    const error = validateReservationInput(form);
    if (error) {
      setMessage(error);
      setIsError(true);
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.set("name", form.name);
      formData.set("phone", form.phone);
      formData.set("address", form.address);
      formData.set("serviceType", form.serviceType);
      formData.set("preferredDate", form.preferredDate);
      formData.set("preferredTime", form.preferredTime);
      formData.set("detail", form.detail);
      photos.slice(0, 5).forEach((file) => formData.append("photos", file));
      const response = await fetch("/api/reservations", { method: "POST", body: formData });

      const data = await readJsonSafely<{ message?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.message || "예약 등록 중 오류가 발생했습니다.");
      }

      setMessage("예약이 정상 등록되었습니다. 빠르게 연락드릴게요.");
      setIsError(false);
      const defaultAddress = residentMe ? `${residentMe.apartmentName} ${residentMe.unitNumber}`.trim() : "";
      setForm({
        ...initialForm,
        name: residentMe?.name ?? "",
        phone: residentMe?.phone ?? "",
        address: defaultAddress
      });
      setPhotos([]);
      await loadReservations();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "예약 등록 실패");
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadReservations = async () => {
    const response = await fetch("/api/reservations", { cache: "no-store" });
    const data = await readJsonSafely<{ reservations?: ReservationItem[] }>(response);
    setRecent((data?.reservations ?? []).slice(0, 3));
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const monthLabel = `${year}년 ${month + 1}월`;

  const dateCells = Array.from({ length: 42 }, (_, idx) => {
    const dayNum = idx - startWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    const date = new Date(year, month, dayNum);
    const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const isPast = date < today;
    const isSelected = form.preferredDate === dateString;
    return { dayNum, dateString, isPast, isSelected };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <form onSubmit={handleSubmit} className="surface-card space-y-4 rounded-2xl p-6">
        <h2 className="inline-flex items-center gap-2 text-xl font-bold">
          <span className="icon-dot h-6 w-6">
            <ShieldIcon className="h-3.5 w-3.5" />
          </span>
          방문 예약 접수
        </h2>

        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="성함"
          minLength={2}
          maxLength={20}
          className="soft-input w-full"
        />
        <input
          required
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="연락처 (예: 010-0000-0000)"
          inputMode="numeric"
          pattern="01[0-9]-?[0-9]{3,4}-?[0-9]{4}"
          className="soft-input w-full"
        />
        <input
          required
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="주소"
          minLength={5}
          maxLength={120}
          className="soft-input w-full"
        />

        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={form.serviceType}
            onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
            className="soft-input"
          >
            <option>누전/합선 점검</option>
            <option>차단기/분전반 점검</option>
            <option>콘센트/스위치 수리</option>
            <option>정기 안전 점검</option>
          </select>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewDate(new Date(year, month - 1, 1))}
                className="btn-outline px-2 py-1 text-xs"
              >
                이전
              </button>
              <p className="text-sm font-semibold text-slate-700">{monthLabel}</p>
              <button
                type="button"
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
                className="btn-outline px-2 py-1 text-xs"
              >
                다음
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {dateCells.map((cell, idx) =>
                cell ? (
                  <button
                    key={cell.dateString}
                    type="button"
                    disabled={cell.isPast}
                    onClick={() => setForm({ ...form, preferredDate: cell.dateString })}
                    className={`h-8 rounded-md text-xs font-semibold ${
                      cell.isSelected
                        ? "bg-primary text-white"
                        : cell.isPast
                          ? "cursor-not-allowed bg-slate-100 text-slate-300"
                          : "bg-slate-50 text-slate-700 hover:bg-blue-50"
                    }`}
                  >
                    {cell.dayNum}
                  </button>
                ) : (
                  <span key={`empty-${idx}`} className="h-8" />
                )
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">선택일: {form.preferredDate || "미선택"}</p>
          </div>
        </div>
        <select
          required
          value={form.preferredTime}
          onChange={(e) => setForm({ ...form, preferredTime: e.target.value })}
          className="soft-input w-full"
        >
          <option value="">방문 요청시간 선택</option>
          <option value="09:00">09:00</option>
          <option value="10:00">10:00</option>
          <option value="11:00">11:00</option>
          <option value="13:00">13:00</option>
          <option value="14:00">14:00</option>
          <option value="15:00">15:00</option>
          <option value="16:00">16:00</option>
          <option value="17:00">17:00</option>
        </select>

        <textarea
          required
          value={form.detail}
          onChange={(e) => setForm({ ...form, detail: e.target.value })}
          placeholder="증상/요청사항을 자세히 적어주세요."
          minLength={2}
          maxLength={500}
          className="soft-input min-h-32 w-full"
        />

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-700">현장 사진 (선택, 최대 5장)</p>
          <p className="mt-1 text-xs text-slate-500">`+ 사진 추가` 버튼으로 최대 5장을 각각 촬영/선택할 수 있습니다.</p>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => {
              appendPhotos(Array.from(e.target.files ?? []));
              e.currentTarget.value = "";
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photos.length >= 5}
            className="mt-2 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            + 사진 추가 ({photos.length}/5)
          </button>
          {photos.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {photos.map((file, idx) => (
                <div key={file.name + file.size + idx} className="rounded bg-white px-2 py-1 text-[11px] text-slate-600">
                  <p className="truncate">{file.name}</p>
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                    className="mt-1 text-[10px] font-semibold text-rose-600"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <button
          disabled={loading}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {loading ? "등록 중..." : "예약 등록하기"}
        </button>

        {message ? <p className={`text-sm ${isError ? "text-rose-700" : "text-emerald-700"}`}>{message}</p> : null}
      </form>

      <aside className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-[0_12px_30px_rgba(15,23,42,0.4)]">
        <h3 className="text-lg font-semibold">최근 접수</h3>
        <p className="mt-1 text-sm text-slate-300">최근 3건을 확인할 수 있습니다.</p>
        <button onClick={loadReservations} className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
          최근 예약 불러오기
        </button>
        <ul className="mt-4 space-y-3 text-sm">
          {recent.length === 0 ? <li className="text-slate-300">아직 접수된 예약이 없습니다.</li> : null}
          {recent.map((item) => (
            <li key={item.id} className="rounded-lg bg-white/5 p-3">
              <p className="font-semibold">{item.name}</p>
              <p className="text-slate-300">{item.serviceType}</p>
              <p className="text-slate-300">
                {item.preferredDate} {item.preferredTime}
              </p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
