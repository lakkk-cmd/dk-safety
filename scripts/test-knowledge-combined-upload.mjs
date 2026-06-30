/** /api/knowledge/upload 통합 파이프라인 e2e 테스트:
 *  sign-upload → Storage 직접 PUT(서명 URL) → /api/knowledge/upload 한 번 호출로
 *  knowledge_base(Claude 분류)와 knowledge_chunks(Voyage) 둘 다 채워지는지 확인. */
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

async function main() {
  const fileName = `테스트-통합파이프라인-${Date.now()}.pdf`;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  const text =
    "Electrical safety inspection knowledge base test document. " +
    "This covers circuit breaker panel inspection, grounding fault checks, " +
    "and KEC code citations for residential apartment electrical systems. ".repeat(40);
  const lines = text.match(/.{1,90}/g) ?? [];
  let y = 800;
  for (const line of lines) {
    if (y < 40) {
      page.drawText("", {});
      break;
    }
    page.drawText(line, { x: 40, y, size: 10, font });
    y -= 14;
  }
  const pdfBytes = await pdf.save();
  console.log(`[1/5] 테스트 PDF 생성 완료 (${pdfBytes.length} bytes)`);

  const adminCookies = new Map();
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword })
  });
  updateCookieJar(adminCookies, loginRes);
  if (!loginRes.ok) throw new Error(`admin login failed: ${loginRes.status}`);
  console.log("[2/5] 관리자 로그인 완료");

  const signRes = await fetch(`${baseUrl}/api/admin/knowledge/sign-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ fileName })
  });
  const signed = await signRes.json();
  if (!signRes.ok) throw new Error(`sign-upload failed: ${signRes.status} ${JSON.stringify(signed)}`);
  console.log(`[3/5] 서명 URL 발급 완료: path=${signed.path}`);

  const putRes = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/pdf" },
    body: Buffer.from(pdfBytes)
  });
  if (!putRes.ok) throw new Error(`Storage PUT failed: ${putRes.status} ${await putRes.text()}`);
  console.log("[4/5] Storage 직접 PUT 완료 (Vercel 4.5MB 제한 우회 경로)");

  const startedAt = Date.now();
  const processRes = await fetch(`${baseUrl}/api/knowledge/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ fileName, path: signed.path })
  });
  const result = await processRes.json();
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (!processRes.ok) throw new Error(`/api/knowledge/upload failed (${elapsed}s): ${JSON.stringify(result)}`);
  console.log(`[5/5] 통합 처리 완료 (${elapsed}s):`);
  console.log(JSON.stringify(result, null, 2));

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: kbRows, error: kbErr } = await supabase
    .from("knowledge_base")
    .select("id, pdf_id")
    .eq("pdf_id", result.pdf.id);
  if (kbErr) throw kbErr;

  const { data: chunkRows, error: chunkErr } = await supabase
    .from("knowledge_chunks")
    .select("id, source_file")
    .eq("source_file", fileName);
  if (chunkErr) throw chunkErr;

  console.log(`\n=== DB 검증 ===`);
  console.log(`knowledge_base (pdf_id=${result.pdf.id}): ${kbRows.length} rows`);
  console.log(`knowledge_chunks (source_file=${fileName}): ${chunkRows.length} rows`);

  if (kbRows.length === 0) throw new Error("knowledge_base에 행이 생기지 않음 (분류 파이프라인 실패)");
  if (chunkRows.length === 0) throw new Error("knowledge_chunks에 행이 생기지 않음 (Voyage 파이프라인 실패)");

  console.log("\n✅ 두 파이프라인 모두 정상 동작 확인");

  // cleanup
  await supabase.from("knowledge_chunks").delete().eq("source_file", fileName);
  await supabase.from("knowledge_base").delete().eq("pdf_id", result.pdf.id);
  await fetch(`${baseUrl}/api/admin/knowledge/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ id: result.pdf.id })
  });
  console.log("정리 완료 (테스트 데이터 삭제)");
}

main().catch((err) => {
  console.error("\n❌ 테스트 실패:", err);
  process.exit(1);
});
