import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { isBomiAuthenticated } from "@/lib/bomi-auth";
import { analyzeInsurancePolicyImage } from "@/lib/bomi-coverage-analysis";
import {
  createBomiCoverageAnalysis,
  createBomiDocument,
  listBomiDocuments,
  updateBomiDocumentOcr,
  type BomiDocType
} from "@/lib/bomi-db";
import { createSignedObjectUrl, uploadBinaryObject } from "@/lib/supabase-server";

const BOMI_DOCUMENTS_BUCKET = process.env.SUPABASE_BOMI_DOCUMENTS_BUCKET?.trim() || "dk-bomi-documents";
const EXT_BY_TYPE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const VALID_DOC_TYPES: BomiDocType[] = ["신분증", "가입설계서", "증권", "청약서", "청구자료", "기타"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const documents = await listBomiDocuments(id);
    // 문서함이 private 버킷이라 목록을 보여줄 때마다 서명 URL을 새로 발급한다(10분 유효).
    const withUrls = await Promise.all(
      documents.map(async (doc) => {
        try {
          const viewUrl = await createSignedObjectUrl(BOMI_DOCUMENTS_BUCKET, doc.url, 600);
          return { ...doc, viewUrl };
        } catch {
          return { ...doc, viewUrl: null };
        }
      })
    );
    return NextResponse.json({ documents: withUrls });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const { id: customerId } = await params;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const docTypeRaw = form.get("docType");
    const docType: BomiDocType = VALID_DOC_TYPES.includes(docTypeRaw as BomiDocType)
      ? (docTypeRaw as BomiDocType)
      : "증권";

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "file이 필요합니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const ext = EXT_BY_TYPE[contentType] ?? "jpg";
    const objectPath = `customers/${customerId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    await uploadBinaryObject({ bucket: BOMI_DOCUMENTS_BUCKET, objectPath, contentType, data: buffer });
    const document = await createBomiDocument({
      customerId,
      docType,
      url: objectPath,
      originalFilename: file.name
    });

    // 증권은 업로드 즉시 OCR + 보장분석까지 진행한다 (MVP는 동기 처리 — 페이지 대기 몇 초).
    if (docType === "증권") {
      try {
        await updateBomiDocumentOcr(document.id, { status: "processing" });
        const signedUrl = await createSignedObjectUrl(BOMI_DOCUMENTS_BUCKET, objectPath, 600);
        const analysis = await analyzeInsurancePolicyImage(signedUrl);
        await updateBomiDocumentOcr(document.id, {
          status: "done",
          result: analysis as unknown as Record<string, unknown>
        });
        const coverage = await createBomiCoverageAnalysis({
          customerId,
          documentId: document.id,
          categoryCoverage: analysis.categoryCoverage,
          gaps: analysis.gaps,
          summary: analysis.summary
        });
        return NextResponse.json({ document: { ...document, ocrStatus: "done" }, analysis: coverage });
      } catch (analysisError) {
        const message = analysisError instanceof Error ? analysisError.message : "보장분석 실패";
        await updateBomiDocumentOcr(document.id, { status: "failed", error: message });
        return NextResponse.json(
          { document: { ...document, ocrStatus: "failed" }, message: `문서는 업로드됐지만 보장분석에 실패했습니다: ${message}` },
          { status: 207 }
        );
      }
    }

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "업로드 실패" }, { status: 500 });
  }
}
