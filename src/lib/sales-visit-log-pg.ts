import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export type SalesVisitLogEntry = {
  id: string;
  apartmentName: string;
  visitDate: string;
  outcome: "가입완료" | "검토중" | "거절";
  memo: string | null;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: string;
};

type SalesVisitLogRow = {
  id: string;
  apartment_name: string;
  visit_date: string;
  outcome: string;
  memo: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
};

function mapVisitLog(row: SalesVisitLogRow): SalesVisitLogEntry {
  return {
    id: row.id,
    apartmentName: row.apartment_name,
    visitDate: row.visit_date,
    outcome: row.outcome as SalesVisitLogEntry["outcome"],
    memo: row.memo,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    createdAt: row.created_at,
  };
}

export async function pgCreateVisitLog(params: {
  apartmentName: string;
  visitDate?: string;
  outcome: "가입완료" | "검토중" | "거절";
  memo?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
}): Promise<SalesVisitLogEntry> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("sales_visit_log")
    .insert({
      apartment_name: params.apartmentName,
      visit_date: params.visitDate ?? new Date().toISOString().slice(0, 10),
      outcome: params.outcome,
      memo: params.memo ?? null,
      contact_name: params.contactName ?? null,
      contact_phone: params.contactPhone ?? null,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(`방문기록 생성 실패: ${error.message}`);
  }
  return mapVisitLog(data as SalesVisitLogRow);
}

export async function pgListVisitLogs(range?: { start: string; end: string }): Promise<SalesVisitLogEntry[]> {
  const supabase = requireSupabaseAdmin();
  let query = supabase.from("sales_visit_log").select("*").order("visit_date", { ascending: false });
  if (range) {
    query = query.gte("visit_date", range.start).lte("visit_date", range.end);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`방문기록 목록 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as SalesVisitLogRow[]).map(mapVisitLog);
}

export async function pgCountVisitLogs(range: { start: string; end: string }): Promise<number> {
  const supabase = requireSupabaseAdmin();
  const { count, error } = await supabase
    .from("sales_visit_log")
    .select("id", { count: "exact", head: true })
    .gte("visit_date", range.start)
    .lte("visit_date", range.end);
  if (error) {
    throw new Error(`방문기록 카운트 실패: ${error.message}`);
  }
  if (count === null) {
    // head:true + count:"exact" 쿼리는 테이블이 없어져도 error 없이 count:null(204 No Content)만
    // 반환하는 경우가 실측됐다(2026-09-02, 격리 검증 중 발견 — PostgREST 스키마 캐시 미스).
    // null을 0으로 오인하면 실패가 "방문 0건"으로 조용히 둔갑하므로 명시적으로 실패 처리한다.
    throw new Error("방문기록 카운트 실패: count가 null입니다(테이블 접근 불가 가능성)");
  }
  return count;
}
