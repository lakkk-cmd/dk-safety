"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BackupPreview, BackupSnapshot, RestoreDiffSummary } from "@/lib/reservations-store";
import { ShieldIcon } from "@/components/ui/icons";

type Props = {
  snapshotCount: number;
  latestSnapshotAt: string | null;
  rollingBackupUpdatedAt: string | null;
  snapshots: BackupSnapshot[];
};

export default function AdminBackupStatus({ snapshotCount, latestSnapshotAt, rollingBackupUpdatedAt, snapshots }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"backup" | string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "auto" | "manual" | "checkpoint">("all");
  const [diff, setDiff] = useState<RestoreDiffSummary | null>(null);

  const runManualBackup = async () => {
    setLoading("backup");
    setMessage("");
    try {
      const response = await fetch("/api/admin/backups", { method: "POST" });
      const data = (await response.json()) as { message: string };
      if (!response.ok) {
        throw new Error(data.message || "수동 백업 실패");
      }
      setMessage(data.message);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수동 백업 실패");
    } finally {
      setLoading(null);
    }
  };

  const restoreSnapshot = async (fileName: string) => {
    const checkpointReason = window.prompt("체크포인트 라벨(복원 사유)을 입력해주세요.", "관리자 복원");
    if (checkpointReason === null) {
      return;
    }
    const okay = window.confirm(
      `선택한 백업으로 복원할까요?\n${fileName}\n\n복원 전 현재 데이터는 checkpoint 백업으로 자동 보관됩니다.`
    );
    if (!okay) {
      return;
    }

    setLoading(fileName);
    setMessage("");
    try {
      const response = await fetch("/api/admin/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, checkpointReason })
      });
      const data = (await response.json()) as { message: string; diff?: RestoreDiffSummary };
      if (!response.ok) {
        throw new Error(data.message || "복원 실패");
      }
      setMessage(data.message);
      setDiff(data.diff ?? null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "복원 실패");
    } finally {
      setLoading(null);
    }
  };

  const loadPreview = async (fileName: string) => {
    setLoading(`preview:${fileName}`);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/backups/restore?fileName=${encodeURIComponent(fileName)}`);
      const data = (await response.json()) as { message?: string; preview?: BackupPreview };
      if (!response.ok || !data.preview) {
        throw new Error(data.message || "미리보기 실패");
      }
      setPreview(data.preview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "미리보기 실패");
    } finally {
      setLoading(null);
    }
  };

  const emergencyRollback = async () => {
    const checkpoint = snapshots.find((item) => item.kind === "checkpoint");
    if (!checkpoint) {
      setMessage("사용 가능한 체크포인트 백업이 없습니다.");
      return;
    }
    await restoreSnapshot(checkpoint.fileName);
  };

  const visibleSnapshots = snapshots.filter((snapshot) => (kindFilter === "all" ? true : snapshot.kind === kindFilter));

  const kindLabel = (kind: BackupSnapshot["kind"]) => {
    if (kind === "auto") return "자동";
    if (kind === "manual") return "수동";
    if (kind === "checkpoint") return "체크포인트";
    return "기타";
  };

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
            <span className="icon-dot h-6 w-6">
              <ShieldIcon className="h-3.5 w-3.5" />
            </span>
            백업 상태
          </h2>
          <p className="mt-1 text-sm text-slate-500">예약 추가 시 스냅샷 보관, 최신 백업은 계속 갱신됩니다.</p>
        </div>
        <button
          onClick={runManualBackup}
          disabled={loading !== null}
          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          {loading === "backup" ? "생성 중..." : "수동 백업"}
        </button>
      </div>
      <button
        onClick={emergencyRollback}
        disabled={loading !== null}
        className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-60"
      >
        최신 체크포인트로 긴급 롤백
      </button>
      <div className="mt-4 space-y-2 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-slate-500">보관 스냅샷</p>
          <p className="font-semibold text-slate-900">{snapshotCount}개 (최대 30개)</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-slate-500">최근 스냅샷 시각</p>
          <p className="font-semibold text-slate-900">
            {latestSnapshotAt ? new Date(latestSnapshotAt).toLocaleString("ko-KR") : "-"}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-slate-500">최신 백업 파일 갱신</p>
          <p className="font-semibold text-slate-900">
            {rollingBackupUpdatedAt ? new Date(rollingBackupUpdatedAt).toLocaleString("ko-KR") : "-"}
          </p>
        </div>
      </div>
      {message ? <p className="mt-3 text-xs text-primary">{message}</p> : null}
      {diff ? (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold">복원 결과 요약</p>
          <p>
            추가 {diff.added} / 삭제 {diff.removed} / 변경 {diff.changed} / 동일 {diff.unchanged}
          </p>
          <p>
            복원 전 {diff.beforeCount}건 → 복원 후 {diff.afterCount}건
          </p>
        </div>
      ) : null}
      {preview ? (
        <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold">복원 미리보기: {preview.fileName}</p>
          <p>예약 건수: {preview.count}건</p>
          <p>가장 이른 접수: {preview.earliestCreatedAt ? new Date(preview.earliestCreatedAt).toLocaleString("ko-KR") : "-"}</p>
          <p>가장 최근 접수: {preview.latestCreatedAt ? new Date(preview.latestCreatedAt).toLocaleString("ko-KR") : "-"}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600">최근 스냅샷</p>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "all" | "auto" | "manual" | "checkpoint")}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="all">전체</option>
            <option value="auto">자동</option>
            <option value="manual">수동</option>
            <option value="checkpoint">체크포인트</option>
          </select>
        </div>
        <ul className="mt-2 space-y-2">
          {visibleSnapshots.length === 0 ? (
            <li className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">스냅샷이 없습니다.</li>
          ) : (
            visibleSnapshots.slice(0, 6).map((snapshot) => (
              <li key={snapshot.fileName} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <p className="truncate font-medium text-slate-700">{snapshot.fileName}</p>
                <p className="mt-1 inline-flex rounded bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">{kindLabel(snapshot.kind)}</p>
                {snapshot.label ? <p className="mt-1 text-[11px] text-slate-600">라벨: {snapshot.label}</p> : null}
                <p className="mt-1 text-slate-500">{new Date(snapshot.updatedAt).toLocaleString("ko-KR")}</p>
                <button
                  onClick={() => loadPreview(snapshot.fileName)}
                  disabled={loading !== null}
                  className="mt-2 mr-2 rounded border border-slate-300 px-2 py-1 text-[11px] disabled:opacity-60"
                >
                  {loading === `preview:${snapshot.fileName}` ? "확인 중..." : "미리보기"}
                </button>
                <button
                  onClick={() => restoreSnapshot(snapshot.fileName)}
                  disabled={loading !== null}
                  className="mt-2 rounded border border-slate-300 px-2 py-1 text-[11px] disabled:opacity-60"
                >
                  {loading === snapshot.fileName ? "복원 중..." : "이 백업으로 복원"}
                </button>
                <a
                  href={`/api/admin/backups/file?fileName=${encodeURIComponent(snapshot.fileName)}`}
                  className="mt-2 ml-2 inline-block rounded border border-slate-300 px-2 py-1 text-[11px]"
                >
                  다운로드
                </a>
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}
