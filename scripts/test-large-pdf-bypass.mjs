/** Vercel 4.5MB 함수 본문 제한을 실제로 우회하는지 확인하기 위해 4.5MB보다 큰 PDF를
 *  생성해 /api/admin/knowledge/sign-upload → Storage 직접 PUT → /api/knowledge/upload
 *  흐름으로 업로드해본다. (createImage로 랜덤 노이즈를 만들어 압축이 잘 안 되게 한다) */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
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

function randomNoisePng(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i++) {
    imageData.data[i] = Math.floor(Math.random() * 256);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer("image/png");
}

async function main() {
  const fileName = `테스트-대용량-4.5MB초과-${Date.now()}.pdf`;

  console.log("[1/6] 랜덤 노이즈 이미지 생성 중 (압축 안 되게)...");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // 첫 페이지엔 텍스트 추출 테스트용 글자도 넣는다 (분류/임베딩 파이프라인이 쓸 텍스트)
  const textPage = pdf.addPage([595, 842]);
  const text =
    "Large PDF upload test for Vercel 4.5MB body-size bypass. Electrical safety inspection, " +
    "circuit breaker panel checks, grounding fault diagnostics, KEC code citations. ".repeat(50);
  const lines = text.match(/.{1,90}/g) ?? [];
  let y = 800;
  for (const line of lines) {
    if (y < 40) break;
    textPage.drawText(line, { x: 40, y, size: 10, font });
    y -= 14;
  }

  let totalImageBytes = 0;
  const targetBytes = 6 * 1024 * 1024; // 6MB > Vercel 4.5MB 제한
  let imgIndex = 0;
  while (totalImageBytes < targetBytes) {
    const png = randomNoisePng(900);
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([900, 900]);
    page.drawImage(image, { x: 0, y: 0, width: 900, height: 900 });
    totalImageBytes += png.length;
    imgIndex++;
    console.log(`  이미지 ${imgIndex}장 추가, 누적 원본 PNG 크기: ${(totalImageBytes / 1024 / 1024).toFixed(2)}MB`);
  }

  const pdfBytes = await pdf.save();
  console.log(`[2/6] 테스트 PDF 생성 완료: ${(pdfBytes.length / 1024 / 1024).toFixed(2)}MB (페이지 ${imgIndex + 1}장)`);
  if (pdfBytes.length <= 4.5 * 1024 * 1024) {
    throw new Error(`PDF가 4.5MB를 넘지 않음 (${pdfBytes.length} bytes) — 테스트 의미 없음`);
  }

  const adminCookies = new Map();
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword })
  });
  updateCookieJar(adminCookies, loginRes);
  if (!loginRes.ok) throw new Error(`admin login failed: ${loginRes.status}`);
  console.log("[3/6] 관리자 로그인 완료");

  const signRes = await fetch(`${baseUrl}/api/admin/knowledge/sign-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ fileName })
  });
  const signed = await signRes.json();
  if (!signRes.ok) throw new Error(`sign-upload failed: ${signRes.status} ${JSON.stringify(signed)}`);
  console.log(`[4/6] 서명 URL 발급 완료: path=${signed.path}`);

  const putRes = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/pdf" },
    body: Buffer.from(pdfBytes)
  });
  if (!putRes.ok) throw new Error(`Storage PUT failed: ${putRes.status} ${await putRes.text()}`);
  console.log(`[5/6] Storage 직접 PUT 완료 — ${(pdfBytes.length / 1024 / 1024).toFixed(2)}MB가 Vercel 함수를 거치지 않고 업로드됨`);

  const startedAt = Date.now();
  const processRes = await fetch(`${baseUrl}/api/knowledge/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(adminCookies) },
    body: JSON.stringify({ fileName, path: signed.path })
  });
  const result = await processRes.json();
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (!processRes.ok) throw new Error(`/api/knowledge/upload failed (${elapsed}s): ${JSON.stringify(result)}`);
  console.log(`[6/6] 통합 처리 완료 (${elapsed}s):`);
  console.log(JSON.stringify(result, null, 2));

  if (!result.pdf?.id) throw new Error("pdf.id 없음 — 처리 실패");

  console.log(`\n✅ ${(pdfBytes.length / 1024 / 1024).toFixed(2)}MB PDF가 Vercel 4.5MB 본문 제한 없이 정상 업로드/처리됨`);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
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
