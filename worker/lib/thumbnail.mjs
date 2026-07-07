/**
 * dk-blog-factory 3단계: 블로그 썸네일 생성 (미리캔버스 대체, 무료)
 * satori(레이아웃→SVG) + sharp(SVG→PNG 800x800)
 * 템플릿 3종: warning(경고형) / info(정보형) / review(후기형)
 * 브랜드 토큰: dk-navy #0B1F3A, dk-gold #F5A623 (tailwind.config.ts 실제 값), Pretendard Bold
 */
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NAVY = "#0B1F3A";
const NAVY_LIGHT = "#14345C";
const GOLD = "#F5A623";
const SKY = "#EEF3FF";

const SIZE = 800;

// satori는 woff2 variable 폰트를 지원하지 않아 static OTF를 받아 캐시한다 (최초 1회, 무료 CDN)
const FONT_URL = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf";
const FONT_CACHE = path.join(__dirname, "..", "assets", "fonts", "Pretendard-Bold.otf");

let fontPromise = null;
async function loadFont() {
  fontPromise ??= (async () => {
    if (existsSync(FONT_CACHE)) return readFile(FONT_CACHE);
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`Pretendard 폰트 다운로드 실패: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(path.dirname(FONT_CACHE), { recursive: true });
    await writeFile(FONT_CACHE, buf);
    return buf;
  })();
  return fontPromise;
}

// satori용 요소 트리 헬퍼 (React 없이 plain object)
const el = (type, style, children, extra = {}) => ({
  type,
  props: { style, children, ...extra },
});

const warningIcon = {
  type: "svg",
  props: {
    width: 150,
    height: 150,
    viewBox: "0 0 100 100",
    children: [
      { type: "path", props: { d: "M50 8 L96 88 L4 88 Z", fill: GOLD } },
      { type: "rect", props: { x: 45, y: 36, width: 10, height: 30, rx: 5, fill: NAVY } },
      { type: "circle", props: { cx: 50, cy: 76, r: 6, fill: NAVY } },
    ],
  },
};

const TEMPLATES = {
  // 경고형 — 네이비 배경 + 골드 경고 아이콘
  warning: (title) =>
    el(
      "div",
      {
        width: SIZE, height: SIZE, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: `linear-gradient(160deg, ${NAVY_LIGHT} 0%, ${NAVY} 70%)`,
        padding: "60px", color: "#FFFFFF",
      },
      [
        warningIcon,
        el("div", {
          fontSize: 64, fontWeight: 700, textAlign: "center", lineHeight: 1.35,
          wordBreak: "keep-all", marginTop: 48,
        }, title),
        el("div", { fontSize: 28, color: GOLD, marginTop: 56 }, "우리집 전기주치의 · dkansim.com"),
      ]
    ),

  // 정보형 — 네이비 배경 + 골드 TIP 배지
  info: (title) =>
    el(
      "div",
      {
        width: SIZE, height: SIZE, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: NAVY, padding: "60px", color: "#FFFFFF",
      },
      [
        el("div", {
          background: GOLD, color: NAVY, fontSize: 40, fontWeight: 700,
          padding: "14px 44px", borderRadius: 999,
        }, "알아두면 유용한 TIP"),
        el("div", {
          fontSize: 62, fontWeight: 700, textAlign: "center", lineHeight: 1.35,
          wordBreak: "keep-all", marginTop: 56,
        }, title),
        el("div", { width: 220, height: 8, background: GOLD, borderRadius: 4, marginTop: 52 }, undefined),
        el("div", { fontSize: 28, color: SKY, marginTop: 40 }, "우리집 전기주치의 · dkansim.com"),
      ]
    ),

  // 후기형 — 밝은 스카이 배경 + 큰 따옴표, 네이비 텍스트
  review: (title) =>
    el(
      "div",
      {
        width: SIZE, height: SIZE, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: SKY, padding: "60px", color: NAVY,
      },
      [
        el("div", { fontSize: 160, fontWeight: 700, color: GOLD, lineHeight: 0.6, marginBottom: 8 }, "“"),
        el("div", {
          fontSize: 58, fontWeight: 700, textAlign: "center", lineHeight: 1.4,
          wordBreak: "keep-all",
        }, title),
        el("div", {
          background: NAVY, color: "#FFFFFF", fontSize: 26, fontWeight: 700,
          padding: "12px 36px", borderRadius: 999, marginTop: 64,
        }, "실제 점검 후기 · 우리집 전기주치의"),
      ]
    ),
};

export const THUMBNAIL_TEMPLATES = Object.keys(TEMPLATES);

/**
 * 800x800 썸네일 PNG 생성.
 * @param {{title: string, template: 'warning'|'info'|'review'}} props
 */
export async function generateThumbnail({ title, template }, outputPath) {
  const build = TEMPLATES[template];
  if (!build) throw new Error(`알 수 없는 템플릿: ${template} (가능: ${THUMBNAIL_TEMPLATES.join("/")})`);
  if (!title?.trim()) throw new Error("title이 필요합니다");

  const fontData = await loadFont();
  const svg = await satori(build(title.trim()), {
    width: SIZE,
    height: SIZE,
    fonts: [{ name: "Pretendard", data: fontData, weight: 700, style: "normal" }],
  });
  const info = await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return { outputPath, width: info.width, height: info.height, bytes: info.size };
}
