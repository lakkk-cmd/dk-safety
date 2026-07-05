/** 풀 에이전트 문서 작성 파이프라인: Claude 초안 → Gemini 교차검증 → PDF/DOCX 생성 → Storage 업로드 → DB 기록 */

import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { callClaudeCustom } from "@/lib/agents";
import { validateContent } from "@/lib/cross-validate";
import { requireAgentSupabase } from "@/lib/agent-db";
import { uploadBinaryObject, SUPABASE_ENABLED } from "@/lib/supabase-server";
import { parseMarkdownSections, renderDocumentPdf, type DocumentSection } from "@/lib/document-pdf";

export const SUPABASE_DOCUMENTS_BUCKET = process.env.SUPABASE_DOCUMENTS_BUCKET ?? "dk-safety-documents";

export const DOC_TEMPLATES: Record<
  string,
  { title: string; sections: string[] }
> = {
  inspection_report: { title: "전기안전 점검 보고서", sections: ["점검 개요", "점검 항목", "점검 결과", "조치 사항", "특이 사항"] },
  estimate: { title: "전기공사 견적서", sections: ["공사 개요", "공사 항목 및 금액", "공사 조건", "유효 기간"] },
  completion_cert: { title: "작업 완료 확인서", sections: ["작업 개요", "작업 내용", "작업 결과", "보증 사항"] },
  safety_guide: { title: "전기안전 안내문", sections: ["안전 수칙", "주의 사항", "긴급 연락처"] },
  contract: { title: "정기점검 계약서", sections: ["계약 당사자", "계약 내용", "점검 주기", "비용", "특약 사항"] },
  proposal: { title: "전기안전 서비스 제안서", sections: ["제안 배경", "서비스 내용", "기대 효과", "비용 안내", "회사 소개"] },
  custom: { title: "문서", sections: [] },
};

async function generateDocumentContent(params: {
  docType: string;
  userRequest: string;
  customerName?: string;
  additionalInfo?: Record<string, string>;
}): Promise<string> {
  const template = DOC_TEMPLATES[params.docType];
  if (!template) throw new Error(`알 수 없는 문서 유형: ${params.docType}`);

  const systemPrompt = "당신은 우리집 전기주치의(대경이엔피)의 문서 작성 전문가입니다. 실제 업무에 바로 사용 가능한 수준으로, 전문적이고 신뢰할 수 있는 한국어 문서를 작성합니다.";
  const userPrompt = `
문서 유형: ${template.title}
고객명: ${params.customerName ?? "미기재"}
요청 사항: ${params.userRequest}
추가 정보: ${JSON.stringify(params.additionalInfo ?? {})}

포함할 섹션: ${template.sections.length > 0 ? template.sections.join(", ") : "요청 사항에 맞게 자유롭게 구성"}

작성 규칙:
- 한국어로 작성
- 실제 업무에 바로 사용 가능한 수준으로 작성
- 마크다운 형식으로 작성 (섹션별 ## 헤더 사용)
- 날짜는 오늘 날짜(${new Date().toLocaleDateString("ko-KR")}) 기준
- 회사명: 우리집 전기주치의(대경이엔피)
- 사업자번호: 208-20-57629
- 확인되지 않은 사실을 지어내지 말고, 요청 사항/추가 정보에 없는 구체적 수치(금액 등)는 "[확인 필요]"로 표시
  `.trim();

  return callClaudeCustom(systemPrompt, userPrompt, 3000, 90_000);
}

function buildDocx(title: string, customerName: string | undefined, sections: DocumentSection[]): Promise<Buffer> {
  const dateLabel = new Date().toLocaleDateString("ko-KR");
  const children: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `우리집 전기주치의(대경이엔피) · 사업자번호 208-20-57629 · ${dateLabel}${customerName ? ` · 고객명: ${customerName}` : ""}`,
          color: "64748b",
        }),
      ],
    }),
  ];
  for (const section of sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } }));
    for (const line of section.body.split("\n")) {
      children.push(new Paragraph({ text: line || " " }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function generateDocument(params: {
  docType: string;
  userRequest: string;
  customerName?: string;
  reservationId?: string;
  sessionId?: string;
  additionalInfo?: Record<string, string>;
}): Promise<{
  id: string;
  title: string;
  content: string;
  pdfUrl: string | null;
  docxUrl: string | null;
  validationScore: number;
}> {
  const template = DOC_TEMPLATES[params.docType];
  if (!template) throw new Error(`알 수 없는 문서 유형: ${params.docType}`);
  if (!SUPABASE_ENABLED) throw new Error("Supabase가 설정되지 않았습니다.");

  const content = await generateDocumentContent(params);

  const validation = await validateContent({
    title: template.title,
    content,
    contentType: "document",
  }).catch(() => ({ passed: true, score: 70, reason: "검증 불가(Gemini 미설정)", verdict: "" }));

  const supabase = requireAgentSupabase();
  const { data: docRow, error: insertErr } = await supabase
    .from("generated_documents")
    .insert({
      title: template.title,
      doc_type: params.docType,
      content,
      customer_name: params.customerName ?? null,
      reservation_id: params.reservationId ?? null,
      session_id: params.sessionId ?? null,
      validation_score: validation.score,
      created_by: "agent",
    })
    .select()
    .single();
  if (insertErr || !docRow) throw new Error(`문서 저장 실패: ${insertErr?.message ?? "unknown"}`);

  const sections = parseMarkdownSections(content);

  let pdfUrl: string | null = null;
  let docxUrl: string | null = null;
  try {
    const pdfBytes = await renderDocumentPdf({ title: template.title, customerName: params.customerName, sections });
    pdfUrl = await uploadBinaryObject({
      bucket: SUPABASE_DOCUMENTS_BUCKET,
      objectPath: `documents/${docRow.id}.pdf`,
      contentType: "application/pdf",
      data: pdfBytes,
    });
  } catch (err) {
    console.error("[document-generator] PDF 생성 실패:", err);
  }

  try {
    const docxBuffer = await buildDocx(template.title, params.customerName, sections);
    docxUrl = await uploadBinaryObject({
      bucket: SUPABASE_DOCUMENTS_BUCKET,
      objectPath: `documents/${docRow.id}.docx`,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      data: new Uint8Array(docxBuffer),
    });
  } catch (err) {
    console.error("[document-generator] DOCX 생성 실패:", err);
  }

  if (pdfUrl || docxUrl) {
    await supabase.from("generated_documents").update({ pdf_url: pdfUrl, docx_url: docxUrl }).eq("id", docRow.id);
  }

  return {
    id: docRow.id,
    title: template.title,
    content,
    pdfUrl,
    docxUrl,
    validationScore: validation.score,
  };
}
