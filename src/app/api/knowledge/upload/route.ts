import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { classifyPdfCategory, chunkTextWithOverlap, embedAndSaveChunks } from '@/lib/knowledge-pdf-pipeline';
import { downloadKnowledgePdf, moveKnowledgePdf } from '@/lib/knowledge-pdf-storage';
import { pgCreateKnowledgePdf, pgUpdateKnowledgePdf } from '@/lib/knowledge-pdfs';
import { loadPDFParse } from '@/lib/pdf-parse-loader';
import { GEMINI_ENABLED, validateKnowledgeChunk } from '@/lib/cross-validate';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 임베딩 단계에 줄 시간 예산 — maxDuration(300s) 안에서 응답을 깨끗하게 마칠 여유를 둔다.
const EMBED_DEADLINE_MS = 250_000;

/** PDF 업로드 한 번으로 knowledge 테이블에 듀얼 임베딩(OpenRouter+Voyage)을 채운다:
 *  Claude Haiku 자동분류(8개 카테고리) → chunkTextWithOverlap으로 청크 분할 →
 *  embedAndSaveChunks(knowledge-pdf-pipeline.ts)가 saveKnowledgeRows를 통해 두 임베딩을
 *  한 번에 계산·저장한다(한쪽 공급자가 실패해도 성공한 쪽은 저장됨).
 *  실제 PDF 바이트는 /api/admin/knowledge/sign-upload로 받은 서명 URL을 통해 클라이언트가
 *  Supabase Storage에 직접 PUT을 마친 뒤이므로, 여기서는 path만 받아 Vercel 함수 본문 크기
 *  제한(4.5MB)과 무관하게 동작한다. */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { fileName?: string; path?: string } | null;
  const fileName = body?.fileName?.trim();
  const path = body?.path?.trim();
  if (!fileName || !path) {
    return NextResponse.json({ error: 'fileName/path가 필요합니다.' }, { status: 400 });
  }
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'PDF 파일만 허용됩니다.' }, { status: 400 });
  }

  const record = await pgCreateKnowledgePdf({ fileName, filePath: path });

  try {
    const buffer = await downloadKnowledgePdf(path);
    const PDFParse = await loadPDFParse();
    const parser = new PDFParse({ data: buffer });
    let text = '';
    let pageCount = 0;
    try {
      const result = await parser.getText();
      text = result.text?.trim() ?? '';
      pageCount = result.total ?? 0;
    } finally {
      await parser.destroy();
    }

    if (text.length < 50) {
      throw new Error(`이미지 기반 PDF로 보입니다(페이지 수: ${pageCount}) — 텍스트 추출 불가`);
    }

    // 1) Claude Haiku 자동분류 → 원본을 카테고리 폴더로 이동
    const classification = await classifyPdfCategory(text.slice(0, 6000));
    const newPath = `${classification.category}/${path.split('/').pop() ?? fileName}`;
    await moveKnowledgePdf(path, newPath);
    await pgUpdateKnowledgePdf(record.id, {
      filePath: newPath,
      category: classification.category,
      autoCategory: classification.category,
      categoryReason: classification.reason,
      confidence: classification.confidence,
      status: 'processing'
    });

    // 2) 청크 분할 한 번 + 듀얼 임베딩 저장 한 번 — 한쪽 공급자가 실패해도 다른 쪽 결과는 보존한다.
    let kbSaved = 0;
    let voyageChunkCount = 0;
    let kbError: string | null = null;
    let voyageError: string | null = null;
    try {
      const chunks = chunkTextWithOverlap(text);
      if (chunks.length > 0) {
        const result = await embedAndSaveChunks({
          pdfId: record.id,
          fileName,
          category: classification.category,
          chunks,
          resumeFrom: 0,
          deadline: Date.now() + EMBED_DEADLINE_MS
        });
        kbSaved = result.openRouterSaved;
        voyageChunkCount = result.voyageSaved;
        if (result.saved === 0 && result.lastError) {
          kbError = result.lastError;
          voyageError = result.lastError;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '지식베이스 저장 실패';
      kbError = message;
      voyageError = message;
    }

    if (kbSaved === 0 && voyageChunkCount === 0) {
      throw new Error(`임베딩 저장 실패 — OpenRouter: ${kbError}, Voyage: ${voyageError}`);
    }

    const updated = await pgUpdateKnowledgePdf(record.id, {
      status: kbSaved > 0 ? 'completed' : 'failed',
      chunkCount: kbSaved,
      pageCount,
      processedAt: kbSaved > 0 ? new Date().toISOString() : undefined,
      errorMessage: kbError
    });

    // 샘플 청크 3개 비동기 교차검증 (응답 지연 없음)
    if (GEMINI_ENABLED) {
      const sampleSize = 1000;
      const sampleChunks = Array.from({ length: 3 }, (_, i) =>
        text.slice(i * sampleSize, (i + 1) * sampleSize).trim()
      ).filter((c) => c.length > 100);
      void Promise.all(
        sampleChunks.map((c) =>
          validateKnowledgeChunk({ sourceFile: fileName, content: c, category: classification.category }).catch(() => {})
        )
      );
    }

    return NextResponse.json({
      success: true,
      sourceFile: fileName,
      pdf: updated,
      knowledgeBaseChunkCount: kbSaved,
      knowledgeBaseError: kbError,
      voyageChunkCount,
      voyageError
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    console.error('[/api/knowledge/upload] 오류:', err);
    await pgUpdateKnowledgePdf(record.id, { status: 'failed', errorMessage: message }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
