// 보미(보험설계사 CRM) 데이터 계층 — bomi_ 접두사 테이블 전용, 전기안전 사업 테이블과 무관.
// media-library.ts와 동일한 패턴: requireAgentSupabase() 재사용(DK_SAFETY_USE_SUPABASE_DB 플래그와 무관하게 동작).
import { requireAgentSupabase } from "@/lib/agent-db";

export type BomiCustomer = {
  id: string;
  agentId: string | null;
  name: string;
  phone: string;
  address: string;
  postalCode: string;
  birthDate: string | null;
  gender: "남" | "여" | null;
  occupation: string;
  familyNote: string;
  financialNote: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type BomiCustomerRow = {
  id: string;
  agent_id: string | null;
  name: string;
  phone: string;
  address: string;
  postal_code: string;
  birth_date: string | null;
  gender: "남" | "여" | null;
  occupation: string;
  family_note: string;
  financial_note: string;
  memo: string;
  created_at: string;
  updated_at: string;
};

function mapCustomerRow(row: BomiCustomerRow): BomiCustomer {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    postalCode: row.postal_code,
    birthDate: row.birth_date,
    gender: row.gender,
    occupation: row.occupation,
    familyNote: row.family_note,
    financialNote: row.financial_note,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBomiCustomers(): Promise<BomiCustomer[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("bomi_customers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`고객 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => mapCustomerRow(r as BomiCustomerRow));
}

export async function getBomiCustomer(id: string): Promise<BomiCustomer | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase.from("bomi_customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`고객 조회 실패: ${error.message}`);
  return data ? mapCustomerRow(data as BomiCustomerRow) : null;
}

export async function createBomiCustomer(input: {
  name: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  birthDate?: string | null;
  gender?: "남" | "여" | null;
  occupation?: string;
  familyNote?: string;
  financialNote?: string;
  memo?: string;
}): Promise<BomiCustomer> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("bomi_customers")
    .insert({
      name: input.name.trim(),
      phone: input.phone?.trim() ?? "",
      address: input.address?.trim() ?? "",
      postal_code: input.postalCode?.trim() ?? "",
      birth_date: input.birthDate ?? null,
      gender: input.gender ?? null,
      occupation: input.occupation?.trim() ?? "",
      family_note: input.familyNote?.trim() ?? "",
      financial_note: input.financialNote?.trim() ?? "",
      memo: input.memo?.trim() ?? "",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`고객 등록 실패: ${error?.message ?? "unknown"}`);
  return mapCustomerRow(data as BomiCustomerRow);
}

export async function updateBomiCustomer(
  id: string,
  patch: {
    name?: string;
    phone?: string;
    address?: string;
    postalCode?: string;
    birthDate?: string | null;
    gender?: "남" | "여" | null;
    occupation?: string;
    familyNote?: string;
    financialNote?: string;
    memo?: string;
  }
): Promise<BomiCustomer> {
  const supabase = requireAgentSupabase();
  const update: Record<string, unknown> = {};
  if (typeof patch.name === "string") update.name = patch.name.trim();
  if (typeof patch.phone === "string") update.phone = patch.phone.trim();
  if (typeof patch.address === "string") update.address = patch.address.trim();
  if (typeof patch.postalCode === "string") update.postal_code = patch.postalCode.trim();
  if (patch.birthDate !== undefined) update.birth_date = patch.birthDate;
  if (patch.gender !== undefined) update.gender = patch.gender;
  if (typeof patch.occupation === "string") update.occupation = patch.occupation.trim();
  if (typeof patch.familyNote === "string") update.family_note = patch.familyNote.trim();
  if (typeof patch.financialNote === "string") update.financial_note = patch.financialNote.trim();
  if (typeof patch.memo === "string") update.memo = patch.memo.trim();
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("bomi_customers")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(`고객 수정 실패: ${error?.message ?? "unknown"}`);
  return mapCustomerRow(data as BomiCustomerRow);
}

export async function deleteBomiCustomer(id: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("bomi_customers").delete().eq("id", id);
  if (error) throw new Error(`고객 삭제 실패: ${error.message}`);
}

export type BomiDocType = "신분증" | "가입설계서" | "증권" | "청약서" | "청구자료" | "기타";
export type BomiOcrStatus = "pending" | "processing" | "done" | "failed";

export type BomiDocument = {
  id: string;
  customerId: string;
  docType: BomiDocType;
  url: string;
  originalFilename: string;
  ocrStatus: BomiOcrStatus;
  ocrResult: Record<string, unknown> | null;
  ocrError: string | null;
  createdAt: string;
};

type BomiDocumentRow = {
  id: string;
  customer_id: string;
  doc_type: BomiDocType;
  url: string;
  original_filename: string;
  ocr_status: BomiOcrStatus;
  ocr_result: Record<string, unknown> | null;
  ocr_error: string | null;
  created_at: string;
};

function mapDocumentRow(row: BomiDocumentRow): BomiDocument {
  return {
    id: row.id,
    customerId: row.customer_id,
    docType: row.doc_type,
    url: row.url,
    originalFilename: row.original_filename,
    ocrStatus: row.ocr_status,
    ocrResult: row.ocr_result,
    ocrError: row.ocr_error,
    createdAt: row.created_at,
  };
}

export async function listBomiDocuments(customerId: string): Promise<BomiDocument[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("bomi_documents")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`문서 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => mapDocumentRow(r as BomiDocumentRow));
}

export async function getBomiDocument(id: string): Promise<BomiDocument | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase.from("bomi_documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`문서 조회 실패: ${error.message}`);
  return data ? mapDocumentRow(data as BomiDocumentRow) : null;
}

export async function createBomiDocument(input: {
  customerId: string;
  docType: BomiDocType;
  url: string;
  originalFilename: string;
}): Promise<BomiDocument> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("bomi_documents")
    .insert({
      customer_id: input.customerId,
      doc_type: input.docType,
      url: input.url,
      original_filename: input.originalFilename,
      ocr_status: "pending",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`문서 등록 실패: ${error?.message ?? "unknown"}`);
  return mapDocumentRow(data as BomiDocumentRow);
}

export async function updateBomiDocumentOcr(
  id: string,
  patch: { status: BomiOcrStatus; result?: Record<string, unknown> | null; error?: string | null }
): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("bomi_documents")
    .update({ ocr_status: patch.status, ocr_result: patch.result ?? null, ocr_error: patch.error ?? null })
    .eq("id", id);
  if (error) throw new Error(`문서 OCR 상태 갱신 실패: ${error.message}`);
}

export type BomiCoverageAnalysis = {
  id: string;
  customerId: string;
  documentId: string | null;
  categoryCoverage: Record<string, unknown>;
  gaps: unknown[];
  summary: string;
  createdAt: string;
};

type BomiCoverageAnalysisRow = {
  id: string;
  customer_id: string;
  document_id: string | null;
  category_coverage: Record<string, unknown>;
  gaps: unknown[];
  summary: string;
  created_at: string;
};

function mapCoverageRow(row: BomiCoverageAnalysisRow): BomiCoverageAnalysis {
  return {
    id: row.id,
    customerId: row.customer_id,
    documentId: row.document_id,
    categoryCoverage: row.category_coverage,
    gaps: row.gaps,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

export async function listBomiCoverageAnalyses(customerId: string): Promise<BomiCoverageAnalysis[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("bomi_coverage_analysis")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`보장분석 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => mapCoverageRow(r as BomiCoverageAnalysisRow));
}

export async function createBomiCoverageAnalysis(input: {
  customerId: string;
  documentId: string | null;
  categoryCoverage: Record<string, unknown>;
  gaps: unknown[];
  summary: string;
}): Promise<BomiCoverageAnalysis> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("bomi_coverage_analysis")
    .insert({
      customer_id: input.customerId,
      document_id: input.documentId,
      category_coverage: input.categoryCoverage,
      gaps: input.gaps,
      summary: input.summary,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`보장분석 저장 실패: ${error?.message ?? "unknown"}`);
  return mapCoverageRow(data as BomiCoverageAnalysisRow);
}
