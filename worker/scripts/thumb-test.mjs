/**
 * thumbnail 실행 검증 — 템플릿 3종(warning/info/review) 각 1장 생성.
 * Usage: npm run thumb:test (루트) 또는 node worker/scripts/thumb-test.mjs
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateThumbnail } from "../lib/thumbnail.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "out", "blog-test");
mkdirSync(OUT_DIR, { recursive: true });

const SAMPLES = [
  { template: "warning", title: "누전차단기가 자꾸 떨어진다면 꼭 확인하세요" },
  { template: "info", title: "아파트 콘센트 교체, 셀프로 가능할까?" },
  { template: "review", title: "화곡동 아파트 전기 점검 다녀왔습니다" },
];

for (const sample of SAMPLES) {
  const out = path.join(OUT_DIR, `thumb-${sample.template}.png`);
  const r = await generateThumbnail(sample, out);
  console.log(`  ${sample.template}: ${path.basename(r.outputPath)} — ${r.width}x${r.height}, ${(r.bytes / 1024).toFixed(0)}KB`);
}
console.log(`\n썸네일 3종 생성 완료 → ${OUT_DIR}`);
