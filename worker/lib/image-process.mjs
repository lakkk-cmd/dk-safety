/**
 * dk-blog-factory 3단계: 현장 사진 일괄 보정 파이프라인 (포토스케이프 X 대체, 무료)
 * sharp: 리사이즈(가로 900px) → 자동 밝기/대비(normalize) → 샤픈 →
 * 우하단 워터마크("우리집 전기주치의") → jpg 85% 저장
 */
import sharp from "sharp";

const TARGET_WIDTH = 900;
const JPEG_QUALITY = 85;

// 우하단 워터마크 — 반투명 흰 텍스트 + 가독성용 옅은 그림자 (여백은 SVG 안에 포함)
const WATERMARK_SVG = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="252" height="44">
  <text x="235" y="24" text-anchor="end"
    font-family="Malgun Gothic, AppleGothic, sans-serif" font-size="19" font-weight="700"
    fill="rgba(0,0,0,0.35)" dx="1" dy="1">우리집 전기주치의</text>
  <text x="234" y="23" text-anchor="end"
    font-family="Malgun Gothic, AppleGothic, sans-serif" font-size="19" font-weight="700"
    fill="rgba(255,255,255,0.85)">우리집 전기주치의</text>
</svg>`);

// 노출 부족 사진의 평균 밝기를 이 수준까지 끌어올린다 (0~255)
const TARGET_MEAN_LUMA = 118;
const MAX_BRIGHTNESS_LIFT = 1.8;

/** 평균 밝기가 목표보다 어두우면 부족한 만큼만 밝기 배율 산출 (밝은 사진은 1.0 = 무보정) */
async function adaptiveBrightness(input) {
  const stats = await sharp(input).stats();
  const mean =
    stats.channels.slice(0, 3).reduce((sum, c) => sum + c.mean, 0) / Math.min(3, stats.channels.length);
  if (mean <= 0) return 1;
  return Math.min(MAX_BRIGHTNESS_LIFT, Math.max(1, TARGET_MEAN_LUMA / mean));
}

/**
 * 사진 1장 보정. input은 파일 경로 또는 Buffer.
 * 적응형 밝기(어두운 사진만 끌어올림) → 대비 스트레치(normalize) → 샤픈 → 워터마크.
 * @returns {Promise<{outputPath: string, width: number, height: number, bytes: number, brightnessLift: number}>}
 */
export async function processPhoto(input, outputPath) {
  const brightness = await adaptiveBrightness(input);
  const info = await sharp(input)
    .rotate() // EXIF 회전 반영 (폰 카메라 사진 필수)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .modulate({ brightness })
    .normalize({ lower: 1, upper: 99.5 })
    .sharpen()
    .composite([{ input: WATERMARK_SVG, gravity: "southeast" }])
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outputPath);
  return { outputPath, width: info.width, height: info.height, bytes: info.size, brightnessLift: brightness };
}

/** 여러 장 순차 보정 — 한 장 실패해도 나머지는 계속, 실패 목록 반환 */
export async function processPhotoBatch(inputs, outputPathFor) {
  const results = [];
  const failures = [];
  for (let i = 0; i < inputs.length; i++) {
    try {
      results.push(await processPhoto(inputs[i], outputPathFor(i)));
    } catch (e) {
      failures.push({ index: i, error: e?.message ?? String(e) });
    }
  }
  return { results, failures };
}
