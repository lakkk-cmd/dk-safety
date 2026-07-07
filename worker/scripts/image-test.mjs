/**
 * image-process 실행 검증 — 어둡게 찍힌 "현장 사진" 3장을 합성으로 만들어
 * 보정 전/후를 worker/out/blog-test/에 나란히 저장한다.
 * Usage: node worker/scripts/image-test.mjs
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { processPhotoBatch } from "../lib/image-process.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "out", "blog-test");
mkdirSync(OUT_DIR, { recursive: true });

/** 어둡고 대비 낮은 합성 사진 (분전함/콘센트 느낌의 도형) — normalize 효과가 눈에 보이게 */
async function makeTestPhoto(index, outputPath) {
  const hues = [
    { bg: "#3a3a33", box: "#57544a", accent: "#6e2f2a" },
    { bg: "#2e3338", box: "#4a5158", accent: "#7a6a35" },
    { bg: "#35302e", box: "#5a4f45", accent: "#2f4a5e" },
  ][index % 3];
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
      <rect width="1600" height="1200" fill="${hues.bg}"/>
      <rect x="400" y="200" width="800" height="800" rx="24" fill="${hues.box}" stroke="#222" stroke-width="8"/>
      <rect x="470" y="300" width="140" height="240" rx="10" fill="${hues.accent}"/>
      <rect x="640" y="300" width="140" height="240" rx="10" fill="#44483f"/>
      <rect x="810" y="300" width="140" height="240" rx="10" fill="#44483f"/>
      <rect x="980" y="300" width="140" height="240" rx="10" fill="${hues.accent}"/>
      <rect x="470" y="620" width="650" height="90" rx="10" fill="#3c4038"/>
      <circle cx="1350" cy="180" r="90" fill="#4e4a3e"/>
      <text x="500" y="780" font-family="sans-serif" font-size="52" fill="#5f5b50">TEST SITE PHOTO ${index + 1}</text>
    </svg>`);
  // 노출 부족 사진처럼 전체적으로 어둡게
  await sharp(svg).modulate({ brightness: 0.62, saturation: 0.8 }).jpeg({ quality: 92 }).toFile(outputPath);
  return outputPath;
}

const originals = [];
for (let i = 0; i < 3; i++) {
  originals.push(await makeTestPhoto(i, path.join(OUT_DIR, `original-${i + 1}.jpg`)));
}
console.log("원본(어두운 합성 사진) 3장 생성 완료");

const { results, failures } = await processPhotoBatch(
  originals,
  (i) => path.join(OUT_DIR, `processed-${i + 1}.jpg`)
);

for (const r of results) {
  console.log(`  보정 완료: ${path.basename(r.outputPath)} — ${r.width}x${r.height}, ${(r.bytes / 1024).toFixed(0)}KB`);
}
if (failures.length > 0) {
  console.error("실패:", failures);
  process.exit(1);
}
console.log(`\n3장 전부 보정 성공 → ${OUT_DIR}`);
