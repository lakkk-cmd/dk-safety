import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { parsePDF, chunkText, embedChunks, saveChunks } from '@/lib/knowledge-embed';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro: 300초. Hobby: 60초로 변경

export async function POST(req: NextRequest) {
  // 스펙 원문에는 인증 체크가 없었으나, 이 라우트는 유료 Voyage API를 호출하고 DB에 쓰기를
  // 하므로 다른 /api/admin/* 라우트와 동일하게 관리자 인증을 적용한다.
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'PDF 파일만 허용됩니다.' }, { status: 400 });
    }

    // File → Buffer 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 파이프라인 실행
    const text = await parsePDF(buffer);
    const chunks = chunkText(text, 500, 50);

    if (chunks.length === 0) {
      return NextResponse.json({ error: '텍스트 추출 결과가 없습니다.' }, { status: 422 });
    }

    const embeddings = await embedChunks(chunks);
    await saveChunks(file.name, chunks, embeddings);

    return NextResponse.json({
      success: true,
      sourceFile: file.name,
      chunkCount: chunks.length,
    });
  } catch (err) {
    console.error('[/api/knowledge/upload] 오류:', err);
    return NextResponse.json(
      { error: (err as Error).message ?? '알 수 없는 오류' },
      { status: 500 }
    );
  }
}
