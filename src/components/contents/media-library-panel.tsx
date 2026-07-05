"use client";

import { useCallback, useEffect, useState } from "react";

type MediaType = "photo" | "music";

type MediaLibraryItem = {
  id: string;
  mediaType: MediaType;
  tag: string;
  url: string;
  source: "upload" | "field_report";
  useCount: number;
  createdAt: string;
};

type FieldReportPhoto = {
  reportId: string;
  apartmentAddress: string;
  inspectedAt: string;
  photoUrl: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR");
}

export default function MediaLibraryPanel() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [tag, setTag] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("photo");
  const [file, setFile] = useState<File | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTag, setPickerTag] = useState("");
  const [fieldPhotos, setFieldPhotos] = useState<FieldReportPhoto[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/content/media-library", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { items?: MediaLibraryItem[] };
      setItems(json.items ?? []);
    } catch {
      /* 조용히 무시 */
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleUpload = async () => {
    if (!tag.trim()) return setMessage("태그를 입력하세요.");
    if (!file) return setMessage("파일을 선택하세요.");
    setLoading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mediaType", mediaType);
      form.append("tag", tag.trim());
      const res = await fetch("/api/admin/content/media-library", { method: "POST", body: form });
      const json = (await res.json()) as { message?: string };
      if (!res.ok) return setMessage(json.message ?? "업로드 실패");
      setMessage("등록 완료");
      setTag("");
      setFile(null);
      await loadItems();
    } catch {
      setMessage("업로드 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/admin/content/media-library?id=${id}`, { method: "DELETE" });
    await loadItems();
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await fetch("/api/admin/content/media-library/field-report-photos", { cache: "no-store" });
      const json = (await res.json()) as { photos?: FieldReportPhoto[] };
      setFieldPhotos(json.photos ?? []);
    } catch {
      setMessage("현장 사진 목록 조회 실패");
    } finally {
      setPickerLoading(false);
    }
  };

  const pickFieldPhoto = async (photo: FieldReportPhoto) => {
    if (!pickerTag.trim()) return setMessage("현장 사진을 등록할 태그를 먼저 입력하세요.");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content/media-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaType: "photo", tag: pickerTag.trim(), url: photo.photoUrl, source: "field_report" }),
      });
      const json = (await res.json()) as { message?: string };
      if (!res.ok) return setMessage(json.message ?? "등록 실패");
      setMessage(`"${pickerTag.trim()}" 태그로 등록 완료`);
      await loadItems();
    } catch {
      setMessage("등록 중 오류가 발생했습니다.");
    }
  };

  const photoItems = items.filter((i) => i.mediaType === "photo");
  const musicItems = items.filter((i) => i.mediaType === "music");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">영상 미디어 보관함</h2>
      <p className="mt-1 text-sm text-slate-600">
        태그를 단 실제 사진(예: 분전함, 누전차단기)과 배경음악을 등록해두면, 영상 제작 시 AI 이미지 생성 대신
        이 자료를 우선 사용합니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value as MediaType)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="photo">사진</option>
          <option value="music">배경음악</option>
        </select>
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="태그 (예: 분전함)"
          className="min-w-[160px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="file"
          accept={mediaType === "photo" ? "image/*" : "audio/*"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleUpload()}
          className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "등록 중…" : "업로드"}
        </button>
        <button
          type="button"
          onClick={() => void openPicker()}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          현장 사진에서 선택
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{message}</p>
      ) : null}

      {pickerOpen ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">현장 점검 사진에서 선택</h3>
            <button type="button" onClick={() => setPickerOpen(false)} className="text-xs text-slate-500 underline">
              닫기
            </button>
          </div>
          <input
            type="text"
            value={pickerTag}
            onChange={(e) => setPickerTag(e.target.value)}
            placeholder="이 사진들에 붙일 태그 (예: 분전함)"
            className="mt-2 w-full max-w-xs rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          {pickerLoading ? (
            <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
          ) : fieldPhotos.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">등록된 현장 점검 사진이 없습니다.</p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {fieldPhotos.map((p, idx) => (
                <button
                  key={`${p.reportId}-${idx}`}
                  type="button"
                  onClick={() => void pickFieldPhoto(p)}
                  className="group relative overflow-hidden rounded-lg border border-slate-200"
                  title={`${p.apartmentAddress} · ${formatDate(p.inspectedAt)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photoUrl} alt={p.apartmentAddress} className="h-24 w-full object-cover" />
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-xs font-bold text-white group-hover:flex">
                    이 태그로 등록
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-bold text-slate-500">등록된 사진 ({photoItems.length})</h3>
          <ul className="mt-2 space-y-1">
            {photoItems.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="truncate">
                  <span className="font-bold">{i.tag}</span>{" "}
                  <span className="text-xs text-slate-400">
                    ({i.source === "field_report" ? "현장사진" : "업로드"} · 사용 {i.useCount}회)
                  </span>
                </span>
                <button type="button" onClick={() => void handleDelete(i.id)} className="text-xs text-red-500 hover:underline">
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-500">등록된 배경음악 ({musicItems.length})</h3>
          <ul className="mt-2 space-y-1">
            {musicItems.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="truncate">
                  <span className="font-bold">{i.tag}</span>{" "}
                  <span className="text-xs text-slate-400">(사용 {i.useCount}회)</span>
                </span>
                <button type="button" onClick={() => void handleDelete(i.id)} className="text-xs text-red-500 hover:underline">
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
