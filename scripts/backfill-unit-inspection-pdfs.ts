#!/usr/bin/env node
/**
 * 이미 발급된 세대전기점검표 PDF를 최신 렌더링 로직(document-pdf.tsx의 동적 높이 계산,
 * 2026-08-24 겹침버그 수정분)으로 다시 생성해 같은 Storage 경로에 덮어쓴다.
 *
 * unit_electrical_inspections.pdf_url은 DB 트리거(prevent_issued_unit_inspection_mutation)로
 * 보호되어 있지만, 이건 "점검 기록(사실관계)"의 불변성을 지키기 위한 것이지 발급 문서의
 * 렌더링 결과물까지 영구 고정하려는 의도가 아니다 — 체크리스트/진단/서명 등 원본 데이터는
 * 전혀 건드리지 않고, 같은 데이터로 PDF 바이트만 다시 그려서 같은 Storage 오브젝트 경로에
 * upsert한다(uploadBinaryObject가 이미 x-upsert:true). DB 행(pdf_url 문자열)은 변경하지
 * 않으므로 트리거에 걸리지 않는다.
 */
import { requireSupabaseAdmin } from "@/lib/supabase-pg";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { renderUnitInspectionPdf } from "@/lib/document-pdf";
import { uploadBinaryObject } from "@/lib/supabase-server";

function extractObjectPath(pdfUrl: string, bucket: string): string {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = pdfUrl.indexOf(marker);
  if (idx === -1) throw new Error(`알 수 없는 URL 형식: ${pdfUrl}`);
  return decodeURIComponent(pdfUrl.slice(idx + marker.length));
}

async function main() {
  const supabase = requireSupabaseAdmin();

  const { data: rows, error } = await supabase
    .from("unit_electrical_inspections")
    .select("*")
    .not("pdf_url", "is", null)
    .order("inspected_at", { ascending: true });

  if (error || !rows) {
    throw new Error(`조회 실패: ${error?.message}`);
  }

  console.log(`대상: ${rows.length}건`);

  const bucket = "dk-safety-documents";
  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    try {
      const apartment = await pgFindApartmentByIdentifier(row.apartment_id);
      if (!apartment) {
        console.warn(`[skip] ${row.id} — 단지 정보 없음 (${row.apartment_id})`);
        fail++;
        continue;
      }

      const inspectedAtLabel = new Date(row.inspected_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });

      const pdfBytes = await renderUnitInspectionPdf({
        apartmentName: apartment.name,
        electricalSafetyManagerName: apartment.electricalSafetyManagerName,
        dong: row.dong,
        ho: row.ho,
        inspectedAtLabel,
        inspectionType: row.inspection_type,
        checklistItems: row.checklist_items,
        loadCurrent: row.load_current,
        igr: row.igr,
        insulationResistance: row.insulation_resistance,
        etcNotes: row.etc_notes,
        autoDiagnosis: row.auto_diagnosis,
        companyAdvisories: row.company_advisories ?? [],
        residentName: row.resident_name,
        signatureData: row.signature_data
      });

      const objectPath = extractObjectPath(row.pdf_url, bucket);
      const resultUrl = await uploadBinaryObject({
        bucket,
        objectPath,
        contentType: "application/pdf",
        data: pdfBytes
      });

      console.log(`[ok] ${row.id} (${apartment.name} ${row.dong}동 ${row.ho}호) — ${resultUrl}`);
      ok++;
    } catch (err) {
      console.error(`[fail] ${row.id} —`, err instanceof Error ? err.message : err);
      fail++;
    }
  }

  console.log(`완료: 성공 ${ok}건, 실패 ${fail}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
