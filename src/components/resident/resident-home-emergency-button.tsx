"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export default function ResidentHomeEmergencyButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const appendPhotos = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setPhotos((prev) => [...prev, ...incoming].slice(0, 5));
  };

  const requestEmergency = async () => {
    setLoading(true);
    setMessage("");
    setIsError(false);
    try {
      const formData = new FormData();
      formData.set("summary", "서비스 홈에서 긴급출동 요청 (자가진단 점수 미연동)");
      photos.slice(0, 5).forEach((file) => formData.append("photos", file));
      const response = await fetch("/api/resident/emergency-dispatch", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (response.status === 401) {
        setIsError(true);
        setMessage("긴급출동은 입주민 로그인 후 이용할 수 있습니다.");
        return;
      }
      if (!response.ok) {
        throw new Error(data.message || "긴급출동 요청에 실패했습니다.");
      }
      setMessage(data.message || "긴급출동 요청이 접수되었습니다. 전기 주치의가 빠르게 연락드립니다.");
      setPhotos([]);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "긴급출동 요청 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 p-5">
      <p className="text-sm font-bold text-rose-900">긴급출동</p>
      <p className="mt-1 text-sm text-rose-800/90">
        스파크·타는 냄새·차단기 반복 하강 등 즉시 위험이 느껴지면 요청해 주세요. (입주민 로그인 필요)
      </p>
      <button
        type="button"
        onClick={() => void requestEmergency()}
        disabled={loading}
        className="mt-4 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(225,29,72,0.35)] hover:bg-rose-700 disabled:opacity-60 md:w-auto md:px-6"
      >
        {loading ? "접수 중..." : "긴급출동 요청"}
      </button>
      <div className="mt-3">
        <p className="text-xs text-rose-800">현장 사진 첨부 (선택, 최대 5장)</p>
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
          className="mt-1 inline-flex items-center rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-800 disabled:opacity-50"
        >
          + 사진 추가 ({photos.length}/5)
        </button>
      </div>
      {message ? (
        <p className={`mt-3 text-sm ${isError ? "text-rose-800" : "text-emerald-800"}`}>
          {message}
          {isError ? (
            <>
              {" "}
              <Link href="/" className="font-semibold underline">
                로그인하기
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
