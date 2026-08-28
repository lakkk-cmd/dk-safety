/**
 * 세대전기점검표 PDF 저장 — 공개 버킷(거주민 결과페이지 /unit-inspection/[id]가 쓰는 pdf_url)에는
 * 발급 즉시 올린다. 비공개 버킷 사본(전기과장 다운로드 게이트가 서명 URL을 발급하는 대상)은
 * 더 이상 이 시점에 즉시 만들지 않는다(2026-08-28) — 대부분의 건은 전기과장이 실제로 다운로드
 * 요청을 한 번도 안 하므로(거주민 발송만으로 끝) 매번 미리 만들어두면 불필요한 저장공간과
 * 업로드가 낭비된다. 대신 첫 다운로드 요청 시 `resolveUnitInspectionPrivatePdfPath()`의 lazy
 * backfill(원래 114 이전 옛 건을 위해 만든 로직)이 공개본 바이트를 그대로 복사해 만든다 — 재렌더링이
 * 아니라 바이트 복사라서 4년 보존 원본과 동일하다. 거주민 경로는 이 변경과 무관하게 그대로
 * 무료·무마찰로 유지된다.
 */
import { SUPABASE_DOCUMENTS_BUCKET } from "@/lib/document-generator";
import {
  createSignedObjectUrl,
  deleteStorageObjects,
  SUPABASE_PRIVATE_DOCUMENTS_BUCKET,
  uploadBinaryObject
} from "@/lib/supabase-server";
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
 * 공개 버킷에만 즉시 올린다. 비공개 사본은 만들지 않는다 — 다운로드 시점의 lazy
 * backfill(`resolveUnitInspectionPrivatePdfPath`, `/api/apt-manager/unit-inspections/[id]/pdf`가 호출)이
 * 필요할 때만 공개본을 복사해 채운다.
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

  return { pdfUrl, pdfPrivatePath: null };
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

function extractObjectPathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

/**
 * 시연전용단지(demo) 점검기록 삭제 전용 — 공개/비공개 버킷에 저장된 PDF 파일(원본 + 문구
 * 정정본)을 전부 정리한다. DB 행 삭제는 호출부가 따로 한다(불변성 트리거가 partnership_type
 * ='demo' 단지의 DELETE만 예외로 허용하므로, 116).
 */
export async function deleteUnitInspectionPdfFiles(params: {
  pdfUrl: string | null;
  pdfPrivatePath: string | null;
  correction?: { url: string; privatePath: string | null } | null;
}): Promise<void> {
  const publicPaths = new Set<string>();
  const privatePaths = new Set<string>();

  if (params.pdfUrl) {
    const path = extractObjectPathFromPublicUrl(params.pdfUrl, SUPABASE_DOCUMENTS_BUCKET);
    if (path) publicPaths.add(path);
  }
  if (params.correction?.url) {
    const path = extractObjectPathFromPublicUrl(params.correction.url, SUPABASE_DOCUMENTS_BUCKET);
    if (path) publicPaths.add(path);
  }
  if (params.pdfPrivatePath) privatePaths.add(params.pdfPrivatePath);
  if (params.correction?.privatePath) privatePaths.add(params.correction.privatePath);

  await Promise.all([
    publicPaths.size > 0 ? deleteStorageObjects(SUPABASE_DOCUMENTS_BUCKET, Array.from(publicPaths)) : Promise.resolve(),
    privatePaths.size > 0 ? deleteStorageObjects(SUPABASE_PRIVATE_DOCUMENTS_BUCKET, Array.from(privatePaths)) : Promise.resolve()
  ]);
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
