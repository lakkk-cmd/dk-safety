/**
 * 카카오 카드뉴스 5장 PNG 렌더러 — next/og(satori) + 룩북(분전반 룩북) 디자인 코드화.
 * AI 이미지 생성(Flux) 없이 텍스트/색/폰트/로고만으로 찍어낸다 — 비용 0원, 매번 동일한 브랜드 톤.
 * scene-cards.tsx(영상 파이프라인)와 동일한 로컬 폰트 캐싱 패턴을 그대로 따른다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import React from "react";
import type { CardNewsSlide } from "./content-agents";

const SIZE = 1080;
const NAVY = "#0B1F3A";
const NAVY_SOFT = "#16305A";
const BLUE = "#1A5CFF";
const GOLD = "#F5A623";
const WHITE = "#FFFFFF";

let _blackHan: ArrayBuffer | null = null;
let _notoBold: ArrayBuffer | null = null;
let _plexMono: ArrayBuffer | null = null;
let _logoIvory: string | null = null;
let _logoBlue: string | null = null;

function readFontBuffer(relPath: string): ArrayBuffer {
  const buf = readFileSync(join(process.cwd(), relPath));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function loadFonts() {
  if (!_blackHan) _blackHan = readFontBuffer("public/fonts/BlackHanSans-Regular.ttf");
  if (!_notoBold) _notoBold = readFontBuffer("public/fonts/NotoSansKR-Bold.woff");
  if (!_plexMono) _plexMono = readFontBuffer("public/fonts/IBMPlexMono-SemiBold.ttf");
  return [
    { name: "BlackHanSans", data: _blackHan, style: "normal" as const, weight: 400 as const },
    { name: "NotoSansKR", data: _notoBold, style: "normal" as const, weight: 700 as const },
    { name: "IBMPlexMono", data: _plexMono, style: "normal" as const, weight: 600 as const },
  ];
}

/** 네이비 배경(표지·스텝)용 아이보리 로고 / 골드 배경(CTA)용 블루 로고 — 배경 대비를 위해 분리 */
function loadLogoDataUrl(kind: "ivory" | "blue"): string {
  if (kind === "ivory") {
    if (!_logoIvory) {
      const buf = readFileSync(join(process.cwd(), "public/logo-ivory.png"));
      _logoIvory = `data:image/png;base64,${buf.toString("base64")}`;
    }
    return _logoIvory;
  }
  if (!_logoBlue) {
    const buf = readFileSync(join(process.cwd(), "public/logo.png"));
    _logoBlue = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return _logoBlue;
}

async function renderToBuffer(element: React.ReactElement): Promise<Buffer> {
  const resp = new ImageResponse(element, { width: SIZE, height: SIZE, fonts: loadFonts() });
  return Buffer.from(await resp.arrayBuffer());
}

function LogoBadge({ kind }: { kind: "ivory" | "blue" }) {
  return React.createElement("img", {
    src: loadLogoDataUrl(kind),
    width: 44,
    height: 44,
    style: { objectFit: "contain" as const },
  });
}

function TopRow(props: { left: React.ReactNode; right: React.ReactNode }) {
  return React.createElement(
    "div",
    { style: { display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" } },
    props.left,
    props.right,
  );
}

/** 표지 카드: 네이비→블루 그라디언트, 후킹 타이틀 */
function CoverCard(slide: Extract<CardNewsSlide, { type: "cover" }>) {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width: SIZE,
        height: SIZE,
        padding: 72,
        background: `linear-gradient(155deg, ${NAVY} 0%, ${NAVY_SOFT} 70%, ${BLUE} 130%)`,
        fontFamily: "NotoSansKR",
      },
    },
    TopRow({
      left: React.createElement(LogoBadge, { kind: "ivory" }),
      right: React.createElement(
        "div",
        {
          style: {
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 2,
            color: GOLD,
            textTransform: "uppercase" as const,
          },
        },
        slide.eyebrow,
      ),
    }),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column" as const, flex: 1, justifyContent: "center", gap: 28 } },
      React.createElement(
        "div",
        {
          style: {
            fontFamily: "BlackHanSans",
            fontSize: 76,
            lineHeight: 1.32,
            color: WHITE,
            whiteSpace: "pre-wrap" as const,
          },
        },
        slide.title,
      ),
      React.createElement(
        "div",
        { style: { fontSize: 34, color: "rgba(255,255,255,0.82)" } },
        slide.sub,
      ),
    ),
    React.createElement(
      "div",
      { style: { fontSize: 24, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.5)" } },
      "우리집 전기주치의",
    ),
  );
}

/** 위험신호 카드(01~03): 네이비 단색, 스텝 번호 + 짧은 설명 */
function StepCard(slide: Extract<CardNewsSlide, { type: "step" }>) {
  const stepLabel = `0${slide.stepNum} / 0${slide.totalSteps}`;
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width: SIZE,
        height: SIZE,
        padding: 72,
        background: NAVY,
        fontFamily: "NotoSansKR",
      },
    },
    TopRow({
      left: React.createElement(LogoBadge, { kind: "ivory" }),
      right: React.createElement(
        "div",
        { style: { fontFamily: "IBMPlexMono", fontSize: 30, color: GOLD } },
        stepLabel,
      ),
    }),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column" as const, flex: 1, justifyContent: "center", gap: 24 } },
      React.createElement(
        "div",
        { style: { fontFamily: "BlackHanSans", fontSize: 62, lineHeight: 1.32, color: WHITE } },
        slide.title,
      ),
      React.createElement(
        "div",
        { style: { fontSize: 36, lineHeight: 1.5, color: "rgba(255,255,255,0.82)", maxWidth: 820 } },
        slide.body,
      ),
    ),
  );
}

/** 예약유도 카드: 골드 배경, 가격 + CTA 버튼 */
function CtaCard(slide: Extract<CardNewsSlide, { type: "cta" }>) {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width: SIZE,
        height: SIZE,
        padding: 72,
        background: GOLD,
        fontFamily: "NotoSansKR",
      },
    },
    TopRow({
      left: React.createElement(LogoBadge, { kind: "blue" }),
      right: React.createElement(
        "div",
        { style: { fontSize: 24, fontWeight: 700, letterSpacing: 1, color: NAVY } },
        "예약 안내",
      ),
    }),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column" as const, flex: 1, justifyContent: "center", gap: 24 } },
      React.createElement(
        "div",
        { style: { fontFamily: "BlackHanSans", fontSize: 62, lineHeight: 1.32, color: NAVY } },
        slide.title,
      ),
      React.createElement(
        "div",
        { style: { fontFamily: "IBMPlexMono", fontSize: 34, color: NAVY } },
        slide.price,
      ),
    ),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: NAVY,
          color: WHITE,
          fontSize: 32,
          fontWeight: 700,
          borderRadius: 16,
          padding: "22px 0",
          width: 420,
        },
      },
      slide.ctaLabel,
    ),
  );
}

/** 슬라이드 하나를 1080x1080 PNG 버퍼로 렌더링한다. */
export async function renderCardNewsSlide(slide: CardNewsSlide): Promise<Buffer> {
  if (slide.type === "cover") return renderToBuffer(CoverCard(slide));
  if (slide.type === "step") return renderToBuffer(StepCard(slide));
  return renderToBuffer(CtaCard(slide));
}
