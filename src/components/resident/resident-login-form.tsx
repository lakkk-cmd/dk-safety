"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Apartment = {
  id: string;
  name: string;
  yearsOld: number;
};

type ApartmentsLoadState = "loading" | "ready" | "error";

export default function ResidentLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [apartmentsLoadState, setApartmentsLoadState] = useState<ApartmentsLoadState>("loading");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");
  const [apartmentId, setApartmentId] = useState("");
  const [newApartment, setNewApartment] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [addingApartment, setAddingApartment] = useState(false);

  const resolveNextPath = useCallback(() => {
    const next = searchParams.get("next");
    if (!next || !next.startsWith("/")) {
      return "/home";
    }
    if (next.startsWith("/admin") || next.startsWith("/resident/login")) {
      return "/home";
    }
    return next;
  }, [searchParams]);

  const fetchApartments = useCallback(async () => {
    setApartmentsLoadState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/resident/apartments", { cache: "no-store" });
      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      let parsed: { apartments?: unknown; message?: string } = {};
      try {
        parsed = text.trim() ? (JSON.parse(text) as { apartments?: unknown; message?: string }) : {};
      } catch {
        parsed = {};
      }
      if (!response.ok) {
        throw new Error(parsed.message || "아파트 목록을 불러오지 못했습니다.");
      }
      if (!contentType.includes("application/json") || !Array.isArray(parsed.apartments)) {
        throw new Error(
          "아파트 목록 응답이 올바르지 않습니다. 개발 중이면 터미널에서 .next 폴더를 삭제한 뒤 npm run dev 를 다시 실행해 보세요."
        );
      }
      const rawList = parsed.apartments;
      const list: Apartment[] = Array.isArray(rawList)
        ? rawList
            .filter((row): row is { id: string; name: string } => {
              return (
                row !== null &&
                typeof row === "object" &&
                typeof (row as { id?: unknown }).id === "string" &&
                typeof (row as { name?: unknown }).name === "string"
              );
            })
            .map((row) => {
              const ext = row as { id: string; name: string; yearsOld?: unknown };
              return {
                id: ext.id,
                name: ext.name,
                yearsOld: typeof ext.yearsOld === "number" ? ext.yearsOld : 0
              };
            })
        : [];
      setApartments(list);
      setApartmentId((prev) => {
        if (prev && list.some((a) => a.id === prev)) {
          return prev;
        }
        return list[0]?.id ?? "";
      });
      setApartmentsLoadState("ready");
    } catch (error) {
      setApartments([]);
      setApartmentId("");
      setApartmentsLoadState("error");
      setMessage(error instanceof Error ? error.message : "아파트 목록을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void fetchApartments();
  }, [fetchApartments]);

  const handleAddApartment = async () => {
    if (!newApartment.trim()) {
      setMessage("추가할 아파트명을 입력해주세요.");
      return;
    }

    setAddingApartment(true);
    setMessage("");
    try {
      const response = await fetch("/api/resident/apartments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newApartment })
      });
      const data = (await response.json()) as { message: string; apartment?: Apartment };
      if (!response.ok) {
        throw new Error(data.message);
      }
      setNewApartment("");
      await fetchApartments();
      if (data.apartment) {
        setApartmentId(data.apartment.id);
      }
      setMessage("아파트가 추가되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "아파트 추가 실패");
    } finally {
      setAddingApartment(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    if (!apartmentId || apartments.length === 0) {
      setMessage("아파트를 선택하거나 목록을 불러온 뒤 다시 시도해주세요.");
      setLoading(false);
      return;
    }
    try {
      const unitNumber = `${dong.trim()}동 ${ho.trim()}호`;
      const response = await fetch("/api/resident/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, unitNumber, apartmentId })
      });
      const data = (await response.json()) as { message: string };
      if (!response.ok) {
        throw new Error(data.message);
      }
      router.replace(resolveNextPath());
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replaceAll(/[^0-9]/g, "").slice(0, 11);
    if (digits.length < 4) return digits;
    if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };

  return (
    <form onSubmit={handleSubmit} className="surface-card-strong rounded-3xl p-6">
      <h2 className="text-2xl font-bold text-slate-900">입주민 로그인</h2>
      <p className="mt-1 text-sm text-slate-600">코딩 몰라도 쉽게, 1분 만에 전기 안전 자가진단을 시작하세요.</p>

      <div className="relative z-10 mt-4 grid gap-3">
        <div>
          <label htmlFor="resident-apartment" className="text-sm font-medium text-slate-700">
            아파트 선택
          </label>
          <select
            id="resident-apartment"
            name="apartmentId"
            required
            value={apartmentId}
            onChange={(e) => setApartmentId(e.target.value)}
            disabled={apartmentsLoadState === "loading" || apartments.length === 0}
            autoComplete="off"
            className="soft-input apartment-select mt-1 w-full text-base"
            aria-busy={apartmentsLoadState === "loading"}
            aria-invalid={apartmentsLoadState === "error"}
          >
            {apartmentsLoadState === "loading" ? (
              <option value="">불러오는 중...</option>
            ) : apartmentsLoadState === "error" && apartments.length === 0 ? (
              <option value="">목록을 불러오지 못했습니다</option>
            ) : apartments.length === 0 ? (
              <option value="">등록된 아파트가 없습니다</option>
            ) : (
              apartments.map((apartment) => (
                <option key={apartment.id} value={apartment.id}>
                  {apartment.name}
                </option>
              ))
            )}
          </select>
          {apartmentsLoadState === "error" ? (
            <button
              type="button"
              onClick={() => void fetchApartments()}
              className="btn-outline mt-2 px-3 py-2 text-sm"
            >
              아파트 목록 다시 불러오기
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            value={newApartment}
            onChange={(e) => setNewApartment(e.target.value)}
            placeholder="목록에 없으면 아파트명 수동 추가"
            className="soft-input"
          />
          <button
            type="button"
            onClick={handleAddApartment}
            disabled={addingApartment}
            className="btn-outline whitespace-nowrap px-4 py-2 text-sm disabled:opacity-60"
          >
            {addingApartment ? "추가 중" : "아파트 추가"}
          </button>
        </div>

        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="성함"
          className="soft-input"
        />
        <input
          required
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          placeholder="연락처 (예: 010-1234-5678)"
          inputMode="numeric"
          className="soft-input"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="relative">
            <input
              required
              value={dong}
              onChange={(e) => setDong(e.target.value.replaceAll(/[^0-9]/g, ""))}
              placeholder="동"
              inputMode="numeric"
              className="soft-input w-full pr-8"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">동</span>
          </label>
          <label className="relative">
            <input
              required
              value={ho}
              onChange={(e) => setHo(e.target.value.replaceAll(/[^0-9]/g, ""))}
              placeholder="호"
              inputMode="numeric"
              className="soft-input w-full pr-8"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">호</span>
          </label>
        </div>
      </div>

      <button
        disabled={loading || apartmentsLoadState !== "ready" || apartments.length === 0 || !apartmentId}
        className="btn-primary mt-4 w-full px-4 py-3 text-base disabled:opacity-60"
      >
        {loading ? "로그인 중..." : "로그인"}
      </button>
      {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        입주민 여러분이 안심하고 전기 안전을 맡길 수 있도록 대경안심전기가 함께합니다.
      </p>
    </form>
  );
}
