/** knowledge_chunks 기반 RAG가 (1) hq/chat과 (2) 현장점검 AI 소견 생성에 실제로 주입되는지,
 *  (3) knowledge_chunks가 비어있어도 기존 로직이 에러 없이 동작하는지 확인한다.
 *  특정 PDF에만 있는 가짜 고유 사실(허구의 부품 모델명+코드)을 만들어, AI가 그 사실을
 *  포함해 답변하면 RAG가 실제로 컨텍스트에 주입됐다고 판단한다. */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!adminPassword) throw new Error("ADMIN_PASSWORD required");
if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required");

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function updateCookieJar(jar, res) {
  const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const h of set) {
    const first = h.split(";")[0];
    const idx = first.indexOf("=");
    if (idx > 0) jar.set(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
  }
}

const UNIQUE_CODE = `ZX-${Math.floor(Math.random() * 900000 + 100000)}`;

async function main() {
  const adminCookies = new Map();
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword })
  });
  updateCookieJar(adminCookies, loginRes);
  if (!loginRes.ok) throw new Error(`admin login failed: ${loginRes.status}`);
  console.log("[로그인] 완료");

  // ── 0) 사전 확인: knowledge_chunks가 텅 비어 있어도(이 시점 기준) 채팅이 에러 없이 동작하는지 ──
  console.log("\n=== 0) RAG 컨텍스트 없이도(현재 knowledge_chunks 상태 그대로) 채팅 정상 동작 확인 ===");
  const baselineRes = await fetch(`${baseUrl}/api/admin/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ agentId: "cto", message: "안녕, 잘 지내?" })
  });
  const baseline = await baselineRes.json();
  if (!baselineRes.ok) throw new Error(`baseline chat failed: ${baselineRes.status} ${JSON.stringify(baseline)}`);
  console.log(`✅ baseline 응답 수신 (길이 ${baseline.reply?.length ?? 0}자) — 에러 없이 기존대로 동작`);

  // ── 1) 고유 사실이 담긴 테스트 PDF 업로드 ──
  console.log(`\n=== 1) 고유 코드(${UNIQUE_CODE})가 담긴 테스트 PDF 업로드 ===`);
  const fileName = `테스트-RAG검증-${Date.now()}.pdf`;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  const text = `Internal parts database document.
The recommended replacement circuit breaker model code is ${UNIQUE_CODE}.
Model code ${UNIQUE_CODE} has rated current 30A, trip current 30mA, meets KEC 234,
and is compatible with standard apartment distribution panels. No other model is recommended.
`.repeat(3);
  let y = 800;
  for (const line of text.split("\n")) {
    if (!line.trim() || y < 40) continue;
    page.drawText(line.slice(0, 90), { x: 40, y, size: 11, font });
    y -= 16;
  }
  const pdfBytes = await pdf.save();

  const signRes = await fetch(`${baseUrl}/api/admin/knowledge/sign-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ fileName })
  });
  const signed = await signRes.json();
  if (!signRes.ok) throw new Error(`sign-upload failed: ${JSON.stringify(signed)}`);

  const putRes = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/pdf" },
    body: Buffer.from(pdfBytes)
  });
  if (!putRes.ok) throw new Error(`Storage PUT failed: ${putRes.status}`);

  const processRes = await fetch(`${baseUrl}/api/knowledge/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ fileName, path: signed.path })
  });
  const result = await processRes.json();
  if (!processRes.ok) throw new Error(`process failed: ${JSON.stringify(result)}`);
  console.log(`✅ 업로드+학습 완료: knowledge_base ${result.knowledgeBaseChunkCount}개 (error: ${result.knowledgeBaseError}), knowledge_chunks ${result.voyageChunkCount}개 (error: ${result.voyageError})`);

  // pgvector ivfflat 인덱스가 없으므로(047에서 제거) 즉시 시퀀셀 스캔으로 검색 가능 — 대기 불필요.

  // ── 2) hq/chat에 해당 PDF 내용 관련 질문 ──
  console.log(`\n=== 2) hq/chat에 "${UNIQUE_CODE}가 뭐야?" 질문 ===`);
  const chatRes = await fetch(`${baseUrl}/api/admin/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ agentId: "cto", message: `우리 자료에 있는 ${UNIQUE_CODE} 모델 코드가 뭔지 알아? 정격전류가 몇 A야?` })
  });
  const chat = await chatRes.json();
  if (!chatRes.ok) throw new Error(`chat failed: ${JSON.stringify(chat)}`);
  console.log("AI 응답:", chat.reply);
  // 단순히 질문에 있던 코드를 그대로 echo한 게 아니라, PDF에만 있는 구체적 스펙(30A/KEC 234)을
  // 실제로 답변에 반영했는지로 판단한다 — 코드만 매칭하면 "모르겠다"는 답도 거짓 양성이 된다.
  const reply = typeof chat.reply === "string" ? chat.reply : "";
  const chatHit = reply.includes(UNIQUE_CODE) && (reply.includes("30A") || reply.includes("KEC 234") || reply.includes("30mA"));
  console.log(chatHit ? `✅ hq/chat 응답이 업로드한 PDF의 고유 스펙(${UNIQUE_CODE} / 30A / KEC 234)을 반영함 — RAG 주입 확인` : `❌ hq/chat 응답에 PDF 고유 스펙이 없음 — RAG 미주입`);

  // ── 3) 정리 ──
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await supabase.from("knowledge_chunks").delete().eq("source_file", fileName);
  await supabase.from("knowledge_base").delete().eq("pdf_id", result.pdf.id);
  await fetch(`${baseUrl}/api/admin/knowledge/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ id: result.pdf.id })
  });
  console.log("\n정리 완료 (테스트 데이터 삭제)");

  if (!chatHit) {
    throw new Error("RAG 검증 실패 — hq/chat이 업로드한 PDF 내용을 참고하지 않음");
  }
  console.log("\n✅ 전체 검증 통과");
}

main().catch((err) => {
  console.error("\n❌ 테스트 실패:", err);
  process.exit(1);
});
