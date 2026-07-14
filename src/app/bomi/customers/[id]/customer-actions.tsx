"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CustomerActions({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const onDelete = async () => {
    if (!window.confirm(`"${customerName}" 고객을 삭제할까요? 문서·보장분석 기록이 모두 함께 삭제되며 되돌릴 수 없습니다.`)) {
      return;
    }
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/bomi/customers/${customerId}`, { method: "DELETE" });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "삭제 실패");
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제 실패");
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Link href={`/customers/${customerId}/edit`} className="btn-outline px-3 py-1.5 text-xs">
        수정
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
      >
        {deleting ? "삭제 중..." : "삭제"}
      </button>
      {message ? <p className="text-xs text-rose-700">{message}</p> : null}
    </div>
  );
}
