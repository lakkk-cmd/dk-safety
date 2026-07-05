// 영상 파이프라인용 태그 기반 미디어 보관함 — 실제 현장 사진(분전함 등)과 배경음악을
// AI 생성 대신 재사용하기 위한 저장소. source='field_report'는 새로 업로드하지 않고
// field_reports.photo_urls의 기존 URL을 그대로 참조한다 (마이그레이션 060).
import { requireAgentSupabase } from "@/lib/agent-db";

export type MediaType = "photo" | "music";
export type MediaSource = "upload" | "field_report";

export type MediaLibraryItem = {
  id: string;
  mediaType: MediaType;
  tag: string;
  url: string;
  source: MediaSource;
  useCount: number;
  createdAt: string;
};

type MediaLibraryRow = {
  id: string;
  media_type: MediaType;
  tag: string;
  url: string;
  source: MediaSource;
  use_count: number;
  created_at: string;
};

function mapRow(row: MediaLibraryRow): MediaLibraryItem {
  return {
    id: row.id,
    mediaType: row.media_type,
    tag: row.tag,
    url: row.url,
    source: row.source,
    useCount: row.use_count,
    createdAt: row.created_at,
  };
}

export async function listMediaLibrary(mediaType?: MediaType): Promise<MediaLibraryItem[]> {
  const supabase = requireAgentSupabase();
  let query = supabase.from("content_media_library").select("*").order("created_at", { ascending: false });
  if (mediaType) query = query.eq("media_type", mediaType);
  const { data, error } = await query;
  if (error) throw new Error(`미디어 보관함 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as MediaLibraryRow));
}

export async function addMediaLibraryEntry(input: {
  mediaType: MediaType;
  tag: string;
  url: string;
  source: MediaSource;
}): Promise<MediaLibraryItem> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("content_media_library")
    .insert({ media_type: input.mediaType, tag: input.tag.trim(), url: input.url, source: input.source })
    .select("*")
    .single();
  if (error || !data) throw new Error(`미디어 등록 실패: ${error?.message ?? "unknown"}`);
  return mapRow(data as MediaLibraryRow);
}

export async function deleteMediaLibraryEntry(id: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("content_media_library").delete().eq("id", id);
  if (error) throw new Error(`미디어 삭제 실패: ${error.message}`);
}

/** 태그별 등록된 사진 개수 — planVideoScenes 프롬프트에 "사용 가능한 실제 사진 태그"로 전달 */
export async function listAvailablePhotoTags(): Promise<string[]> {
  const items = await listMediaLibrary("photo");
  return [...new Set(items.map((i) => i.tag))];
}

/** 태그에 맞는 실제 사진 하나를 로테이션으로 선택 (use_count 가장 낮은 것 우선) — 없으면 null */
export async function pickLibraryPhotoForTag(tag: string): Promise<MediaLibraryItem | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("content_media_library")
    .select("*")
    .eq("media_type", "photo")
    .eq("tag", tag)
    .order("use_count", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`사진 조회 실패: ${error.message}`);
  if (!data) return null;

  const row = mapRow(data as MediaLibraryRow);
  await supabase.from("content_media_library").update({ use_count: row.useCount + 1 }).eq("id", row.id);
  return row;
}

/** 배경음악 하나를 로테이션으로 선택 (use_count 가장 낮은 것 우선) — 없으면 null */
export async function pickLibraryMusic(): Promise<MediaLibraryItem | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("content_media_library")
    .select("*")
    .eq("media_type", "music")
    .order("use_count", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`배경음악 조회 실패: ${error.message}`);
  if (!data) return null;

  const row = mapRow(data as MediaLibraryRow);
  await supabase.from("content_media_library").update({ use_count: row.useCount + 1 }).eq("id", row.id);
  return row;
}
