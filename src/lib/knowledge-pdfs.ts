/** /admin/knowledge — knowledge_pdfs 테이블 CRUD (업로드 단위 처리 상태) */

import { requireAgentSupabase } from "@/lib/agent-db";

export type KnowledgePdfStatus = "uploading" | "classifying" | "processing" | "completed" | "failed";

export type KnowledgePdf = {
  id: string;
  fileName: string;
  filePath: string;
  category: string | null;
  autoCategory: string | null;
  categoryReason: string | null;
  confidence: number | null;
  status: KnowledgePdfStatus;
  chunkCount: number;
  pageCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
};

type Row = {
  id: string;
  file_name: string;
  file_path: string;
  category: string | null;
  auto_category: string | null;
  category_reason: string | null;
  confidence: number | null;
  status: KnowledgePdfStatus;
  chunk_count: number;
  page_count: number | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
};

function mapRow(row: Row): KnowledgePdf {
  return {
    id: row.id,
    fileName: row.file_name,
    filePath: row.file_path,
    category: row.category,
    autoCategory: row.auto_category,
    categoryReason: row.category_reason,
    confidence: row.confidence,
    status: row.status,
    chunkCount: row.chunk_count,
    pageCount: row.page_count,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    processedAt: row.processed_at
  };
}

export async function pgCreateKnowledgePdf(params: { fileName: string; filePath: string }): Promise<KnowledgePdf> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("knowledge_pdfs")
    .insert({ file_name: params.fileName, file_path: params.filePath, status: "classifying" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`PDF 레코드 생성 실패: ${error?.message ?? "unknown"}`);
  return mapRow(data as Row);
}

export async function pgGetKnowledgePdf(id: string): Promise<KnowledgePdf | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase.from("knowledge_pdfs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`PDF 레코드 조회 실패: ${error.message}`);
  return data ? mapRow(data as Row) : null;
}

export async function pgFindKnowledgePdfByFileName(fileName: string): Promise<KnowledgePdf | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("knowledge_pdfs")
    .select("*")
    .eq("file_name", fileName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`중복 확인 실패: ${error.message}`);
  return data ? mapRow(data as Row) : null;
}

export async function pgListKnowledgePdfs(): Promise<KnowledgePdf[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase.from("knowledge_pdfs").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`PDF 목록 조회 실패: ${error.message}`);
  return (data as Row[] | null)?.map(mapRow) ?? [];
}

export async function pgUpdateKnowledgePdf(
  id: string,
  patch: Partial<{
    filePath: string;
    category: string;
    autoCategory: string;
    categoryReason: string;
    confidence: number;
    status: KnowledgePdfStatus;
    chunkCount: number;
    pageCount: number;
    errorMessage: string | null;
    processedAt: string;
  }>
): Promise<KnowledgePdf> {
  const supabase = requireAgentSupabase();
  const payload: Record<string, unknown> = {};
  if (patch.filePath !== undefined) payload.file_path = patch.filePath;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.autoCategory !== undefined) payload.auto_category = patch.autoCategory;
  if (patch.categoryReason !== undefined) payload.category_reason = patch.categoryReason;
  if (patch.confidence !== undefined) payload.confidence = patch.confidence;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.chunkCount !== undefined) payload.chunk_count = patch.chunkCount;
  if (patch.pageCount !== undefined) payload.page_count = patch.pageCount;
  if (patch.errorMessage !== undefined) payload.error_message = patch.errorMessage;
  if (patch.processedAt !== undefined) payload.processed_at = patch.processedAt;

  const { data, error } = await supabase.from("knowledge_pdfs").update(payload).eq("id", id).select("*").single();
  if (error || !data) throw new Error(`PDF 레코드 갱신 실패: ${error?.message ?? "unknown"}`);
  return mapRow(data as Row);
}

/** knowledge_base 청크는 ON DELETE CASCADE(pdf_id)로 자동 삭제됨 */
export async function pgDeleteKnowledgePdfRecord(id: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("knowledge_pdfs").delete().eq("id", id);
  if (error) throw new Error(`PDF 레코드 삭제 실패: ${error.message}`);
}

export async function pgDeleteKnowledgeChunksForPdf(pdfId: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("knowledge_base").delete().eq("pdf_id", pdfId);
  if (error) throw new Error(`기존 청크 삭제 실패: ${error.message}`);
}
