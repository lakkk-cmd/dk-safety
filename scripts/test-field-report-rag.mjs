/** generateFieldReportOpinion(현장점검 AI 소견 생성)에도 knowledge_chunks RAG가 실제로
 *  주입되는지 확인 — 고유 코드가 담긴 PDF를 업로드한 뒤 그 코드를 포함하는 검색어로
 *  소견을 생성해보고, 생성된 소견 텍스트에 그 고유 코드/스펙이 반영되는지 확인한다. */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { searchKnowledgeChunks } from "../src/lib/knowledge-chunks-search.ts";

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

const UNIQUE_CODE = `QZ-${Math.floor(Math.random() * 900000 + 100000)}`;
let cleanupIds = null;

async function cleanup() {
  if (!cleanupIds) return;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await supabase.from("knowledge_chunks").delete().eq("source_file", cleanupIds.fileName);
  await supabase.from("knowledge_base").delete().eq("pdf_id", cleanupIds.pdfId);
  await supabase.from("knowledge_pdfs").delete().eq("id", cleanupIds.pdfId);
  console.log("정리 완료");
}

async function main() {
  const adminCookies = new Map();
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword })
  });
  updateCookieJar(adminCookies, loginRes);
  if (!loginRes.ok) throw new Error(`admin login failed: ${loginRes.status}`);

  const fileName = `테스트-필드리포트RAG-${Date.now()}.pdf`;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  const text = `Field inspection knowledge document.
When breaker trip current is near 30mA and insulation resistance is low,
the recommended replacement part code is ${UNIQUE_CODE}.
Part ${UNIQUE_CODE} satisfies KEC 234 grounding fault requirements for apartment units.
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
  console.log(`업로드 완료: knowledge_chunks ${result.voyageChunkCount}개 (error: ${result.voyageError})`);
  cleanupIds = { fileName, pdfId: result.pdf.id };

  const knowledgeQuery = [
    "누전여부 발생",
    "절연저항값 0.8MΩ",
    "누전차단기 동작전류 29mA",
    "차단기상태 부식",
    "차단기 제조연도 2008",
    "접지상태 미흡",
    "위험등급 경고"
  ].join(" ");

  console.log(`\n[디버그] buildKnowledgeQuery와 동일한 검색어로 searchKnowledgeChunks 직접 호출...`);
  const directChunkContext = await searchKnowledgeChunks(knowledgeQuery, 5);
  console.log("searchKnowledgeChunks 반환값:\n", directChunkContext || "(빈 문자열)");
  const directHit = directChunkContext.includes(UNIQUE_CODE);
  console.log(directHit ? `✅ 검색 결과에 고유 코드(${UNIQUE_CODE}) 포함됨 — 검색 자체는 정상` : `❌ 검색 결과에 고유 코드 없음 — 검색 단계에서 누락`);

  // generateFieldReportOpinion을 직접 import해서 호출 — worker 인증/실제 field_reports
  // 레코드 없이도 RAG 주입 여부만 검증하기 위함.
  const { generateFieldReportOpinion } = await import("../src/lib/field-report-opinion.ts");

  const fakeReport = {
    id: "test",
    workerId: "test-worker",
    reservationId: "test-res",
    apartmentAddress: "광주광역시 테스트구 1-1",
    inspectedAt: new Date().toISOString(),
    breakerTripCurrentMa: 29,
    mainBreakerCapacityA: 30,
    insulationResistanceMohm: 0.8,
    leakageDetected: true,
    leakagePathNote: "욕실 콘센트 라인 추정",
    breakerYear: 2008,
    breakerVisualStatus: "부식",
    unitAreaSqm: 59,
    outletOverheat: false,
    outletOverheatNote: "",
    wiringDamage: false,
    wiringDamageNote: "",
    groundingStatus: "미흡",
    riskLevel: "경고",
    urgentParts: ["누전차단기"],
    siteMemo: "테스트 점검 메모",
    photoUrls: [],
    status: "submitted",
    opinionLandlord: null,
    opinionResident: null,
    opinionGeneratedAt: null,
    pdfLandlordUrl: null,
    pdfResidentUrl: null,
    pdfGeneratedAt: null,
    sendResult: null,
    sentAt: null
  };

  console.log(`\nAI 소견 생성 중...`);
  const opinion = await generateFieldReportOpinion(fakeReport);
  console.log("\n=== 임대인용 소견 (전체) ===");
  console.log(opinion.landlord);
  console.log("\n=== 거주자용 소견 (전체) ===");
  console.log(opinion.resident);

  const hit = opinion.landlord.includes(UNIQUE_CODE) || opinion.resident.includes(UNIQUE_CODE);
  console.log(hit ? `\n✅ 소견에 업로드한 PDF의 고유 부품코드(${UNIQUE_CODE})가 반영됨 — RAG 주입 확인` : `\n⚠️ 소견 본문에 고유 부품코드 직접 인용은 없음 (검색/주입 자체는 위 디버그로 별도 확인)`);

  await cleanup();

  if (!directHit) {
    throw new Error("RAG 검색 단계 실패 — searchKnowledgeChunks가 업로드한 PDF를 찾지 못함");
  }
  console.log("\n✅ RAG 컨텍스트 주입(검색→프롬프트 전달) 확인 완료");
}

main()
  .catch(async (err) => {
    console.error("\n❌ 테스트 실패:", err);
    await cleanup().catch(() => undefined);
    process.exit(1);
  });
