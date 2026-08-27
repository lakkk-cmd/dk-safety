/**
 * 세대전기점검표 PDF 이중 저장 — 공개 버킷(거주민 결과페이지 /unit-inspection/[id]가 쓰는 pdf_url)과
 * 비공개 버킷 사본(전기과장 다운로드 게이트가 서명 URL을 발급하는 대상)에 같은 바이트를 올린다.
 * 거주민 경로는 이 변경과 무관하게 그대로 무료·무마찰로 유지되어야 하므로 공개 버킷을 비공개로
 * 바꾸지 않고 사본을 따로 두는 방식을 쓴다(114).
 */
import { SUPABASE_DOCUMENTS_BUCKET } from "@/lib/document-generator";
import { createSignedObjectUrl, SUPABASE_PRIVATE_DOCUMENTS_BUCKET, uploadBinaryObject } from "@/lib/supabase-server";
import {
  pgBackfillUnitInspectionPdfCorrectionPrivatePath,
  pgBackfillUnitInspectionPrivatePdf,
  pgGetUnitInspectionPdfCorrectionRecord,
  type UnitInspectionPdfCorrectionRecord
} from "@/lib/unit-inspections";

/** 서명 URL 유효시간 — 브라우저가 새 탭에서 열기에 충분하면서 링크가 돌아다녀도 금방 죽을 만큼 짧게. */
const SIGNED_URL_TTL_SEC = 300;

export type UnitInspectionPdfLocations = { pdfUrl: string; pdfPrivatePath: string | null };

/**
 * 비공개 사본 업로드가 실패해도 공개 발급은 진행한다 — 점검표 발급과 거주민 알림은 법적 의무
 * 이행 경로라 결제 부가기능 때문에 막히면 안 된다. 사본이 없는 건은 다운로드 시점의 lazy
 * backfill(`/api/apt-manager/unit-inspections/[id]/pdf`)이 공개본을 복사해 메꾼다.
 */
export async function uploadUnitInspectionPdfCopies(params: {
  objectPath: string;
  pdfBytes: Uint8Array;
}): Promise<UnitInspectionPdfLocations> {
  const pdfUrl = await uploadBinaryObject({
    bucket: SUPABASE_DOCUMENTS_BUCKET,
    objectPath: params.objectPath,
    contentType: "application/pdf",
    data: params.pdfBytes
  });

  let pdfPrivatePath: string | null = null;
  try {
    await uploadBinaryObject({
      bucket: SUPABASE_PRIVATE_DOCUMENTS_BUCKET,
      objectPath: params.objectPath,
      contentType: "application/pdf",
      data: params.pdfBytes
    });
    pdfPrivatePath = params.objectPath;
  } catch (error) {
    console.error("[unit-inspection-pdf-storage] 비공개 사본 업로드 실패(공개 발급은 계속 진행):", error);
  }

  return { pdfUrl, pdfPrivatePath };
}

/**
 * 이 건의 "대표 PDF"(정정본이 있으면 정정본, 없으면 원본)의 비공개 사본 경로를 돌려준다.
 * 114 이전에 발급된 건은 사본이 없으므로, 공개본 바이트를 그대로 받아 비공개 버킷에 복사한 뒤
 * 경로를 되채운다(lazy backfill) — 재렌더링이 아니라 바이트 복사라서 4년 보존 원본과 동일하다.
 * 사본을 만들 수 없으면(공개본조차 없는 미발급 건 등) null.
 *
 * `correction`을 넘기면 정정본 조회를 건너뛴다(일괄 다운로드가 맵을 미리 읽어 오는 경우).
 * `undefined`면 이 함수가 직접 조회하고, `null`이면 "정정본 없음"으로 확정 처리한다.
 */
export async function resolveUnitInspectionPrivatePdfPath(
  inspection: { id: string; pdfUrl: string | null; pdfPrivatePath?: string | null },
  correction?: UnitInspectionPdfCorrectionRecord | null
): Promise<string | null> {
  const resolved = correction === undefined ? await pgGetUnitInspectionPdfCorrectionRecord(inspection.id) : correction;

  if (resolved) {
    if (resolved.privatePath) return resolved.privatePath;
    const path = `unit-inspections/private/corrected-${inspection.id}.pdf`;
    const copied = await copyPublicPdfToPrivateBucket(resolved.url, path);
    if (!copied) return null;
    await pgBackfillUnitInspectionPdfCorrectionPrivatePath(inspection.id, path);
    return path;
  }

  if (inspection.pdfPrivatePath) return inspection.pdfPrivatePath;
  if (!inspection.pdfUrl) return null;
  const path = `unit-inspections/private/${inspection.id}.pdf`;
  const copied = await copyPublicPdfToPrivateBucket(inspection.pdfUrl, path);
  if (!copied) return null;
  await pgBackfillUnitInspectionPrivatePdf(inspection.id, path);
  return path;
}

async function copyPublicPdfToPrivateBucket(publicUrl: string, objectPath: string): Promise<boolean> {
  const res = await fetch(publicUrl);
  if (!res.ok) {
    console.error(`[unit-inspection-pdf-storage] 공개 PDF 복사 실패(${res.status}): ${publicUrl}`);
    return false;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  await uploadBinaryObject({
    bucket: SUPABASE_PRIVATE_DOCUMENTS_BUCKET,
    objectPath,
    contentType: "application/pdf",
    data: bytes
  });
  return true;
}

export async function createUnitInspectionPdfSignedUrl(objectPath: string): Promise<string> {
  return createSignedObjectUrl(SUPABASE_PRIVATE_DOCUMENTS_BUCKET, objectPath, SIGNED_URL_TTL_SEC);
}

/** 일괄 zip용 — 서명 URL을 거치지 않고 비공개 버킷에서 바이트를 바로 읽는다. */
export async function readPrivatePdfBytes(objectPath: string): Promise<ArrayBuffer> {
  const signedUrl = await createSignedObjectUrl(SUPABASE_PRIVATE_DOCUMENTS_BUCKET, objectPath, 60);
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error(`비공개 PDF 읽기 실패(${res.status}): ${objectPath}`);
  }
  return res.arrayBuffer();
}
