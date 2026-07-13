"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const DOC_TYPES = ["증권", "신분증", "가입설계서", "청약서", "청구자료", "기타"] as const;

export default function DocumentUploadPanel({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>("증권");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setMessage("파일을 선택해주세요.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("docType", docType);
      const response = await fetch(`/api/bomi/customers/${customerId}/documents`, { method: "POST", body: form });
      const data = (await response.json()) as { message?: string };
      if (!response.ok && response.status !== 207) {
        throw new Error(data.message || "업로드 실패");
      }
      setMessage(
        response.status === 207
          ? data.message || "업로드는 됐지만 분석에 실패했습니다."
          : docType === "증권"
            ? "업로드 및 보장분석이 완료됐습니다."
            : "업로드가 완료됐습니다."
      );
      setFile(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "업로드 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600">문서 종류</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as (typeof DOC_TYPES)[number])}
          className="soft-input mt-1"
        >
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600">파일 (사진)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="soft-input mt-1"
        />
      </div>
      <button type="submit" disabled={loading} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
        {loading ? (docType === "증권" ? "OCR·보장분석 중..." : "업로드 중...") : "업로드"}
      </button>
      {message ? <p className="w-full text-sm text-slate-600">{message}</p> : null}
    </form>
  );
}
