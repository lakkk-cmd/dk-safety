/**
 * 판정 카드 / 폰 UI 미리보기 이미지 생성기
 * next/og (satori + resvg-js WASM) + NotoSansKR-Bold 서브셋 폰트
 * 한국어 텍스트를 100% 코드로 렌더링 — Flux AI 생성 없음
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import React from "react";

// 폰트 캐시 (Lambda warm instance 내 재사용)
let _fontCache: ArrayBuffer | null = null;

async function loadKoreanFont(): Promise<ArrayBuffer> {
  if (_fontCache) return _fontCache;
  const fontPath = join(process.cwd(), "public/fonts/NotoSansKR-Bold.woff");
  const buf = readFileSync(fontPath);
  _fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return _fontCache;
}

const W = 1080;
const H = 1920;
const NAVY = "#1a2744";
const GOLD = "#C9A227";
const WHITE = "#FFFFFF";

async function renderToBuffer(element: React.ReactElement): Promise<Buffer> {
  const fontData = await loadKoreanFont();
  const resp = new ImageResponse(element, {
    width: W,
    height: H,
    fonts: [{ name: "NotoSansKR", data: fontData, style: "normal", weight: 700 }],
  });
  return Buffer.from(await resp.arrayBuffer());
}

/** 판정 카드: 네이비 그라디언트 배경 + 아이콘 + 한국어 내레이션 */
export async function generateVerdictCardBuffer(narration: string): Promise<Buffer> {
  // 판정 종류 추론: 위험/주의 키워드면 경고 스타일
  const isDanger = /위험|주의|점검|누전|화재|불량/.test(narration);
  const icon = isDanger ? "⚠️" : "✅";
  const accentColor = isDanger ? "#FF6B35" : GOLD;
  const label = isDanger ? "주의 필요" : "안전 확인";

  const element = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        width: W,
        height: H,
        background: `linear-gradient(160deg, ${NAVY} 0%, #2d4a8a 60%, #1a3a6a 100%)`,
        fontFamily: "NotoSansKR",
      },
    },
    // 배경 장식 원
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        top: -200,
        right: -200,
        width: 600,
        height: 600,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.03)",
      },
    }),
    React.createElement("div", {
      style: {
        position: "absolute" as const,
        bottom: -150,
        left: -150,
        width: 500,
        height: 500,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.03)",
      },
    }),
    // 아이콘 원형 배경
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.1)",
          border: `4px solid ${accentColor}`,
          fontSize: 120,
          marginBottom: 48,
        },
      },
      icon,
    ),
    // 판정 라벨
    React.createElement(
      "div",
      {
        style: {
          color: accentColor,
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: 8,
          marginBottom: 40,
        },
      },
      label,
    ),
    // 구분선
    React.createElement("div", {
      style: {
        width: 120,
        height: 3,
        background: accentColor,
        marginBottom: 60,
        borderRadius: 2,
      },
    }),
    // 내레이션 텍스트 카드
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          background: "rgba(255,255,255,0.08)",
          border: `1px solid rgba(255,255,255,0.15)`,
          borderRadius: 32,
          padding: "60px 80px",
          maxWidth: 880,
          marginBottom: 80,
        },
      },
      React.createElement(
        "div",
        {
          style: {
            color: WHITE,
            fontSize: 52,
            fontWeight: 700,
            textAlign: "center" as const,
            lineHeight: 1.6,
          },
        },
        narration,
      ),
    ),
    // 브랜드
    React.createElement(
      "div",
      {
        style: {
          color: "rgba(255,255,255,0.4)",
          fontSize: 30,
          letterSpacing: 2,
        },
      },
      "우리집 전기주치의",
    ),
  );

  return renderToBuffer(element);
}

/** 폰 UI 미리보기: 스마트폰 프레임 안에 앱 예약 화면 */
export async function generatePhoneUiBuffer(narration: string): Promise<Buffer> {
  const PHONE_W = 430;
  const PHONE_H = 860;
  const PHONE_X = (W - PHONE_W) / 2;
  const PHONE_Y = 220;

  const element = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        width: W,
        height: H,
        background: `linear-gradient(180deg, #0f1e3d 0%, ${NAVY} 50%, #162038 100%)`,
        fontFamily: "NotoSansKR",
      },
    },
    // 상단 제목
    React.createElement(
      "div",
      {
        style: {
          color: GOLD,
          fontSize: 44,
          fontWeight: 700,
          marginTop: 120,
          marginBottom: 60,
          letterSpacing: 2,
        },
      },
      "앱 화면 미리보기",
    ),
    // 폰 프레임
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column" as const,
          width: PHONE_W,
          height: PHONE_H,
          background: WHITE,
          borderRadius: 48,
          border: "10px solid #333",
          overflow: "hidden",
          boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
        },
      },
      // 상태바
      React.createElement(
        "div",
        {
          style: {
            background: NAVY,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        },
        React.createElement(
          "div",
          { style: { color: WHITE, fontSize: 16, fontWeight: 700, letterSpacing: 1 } },
          "우리집 전기주치의",
        ),
      ),
      // 앱 콘텐츠
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column" as const,
            padding: "24px 20px",
            gap: 16,
            flex: 1,
          },
        },
        // 헤더 배너
        React.createElement(
          "div",
          {
            style: {
              background: `linear-gradient(135deg, ${NAVY}, #2d4a8a)`,
              borderRadius: 16,
              padding: "20px",
              display: "flex",
              flexDirection: "column" as const,
            },
          },
          React.createElement(
            "div",
            { style: { color: WHITE, fontSize: 18, fontWeight: 700 } },
            "전기 점검 예약",
          ),
          React.createElement(
            "div",
            { style: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 } },
            "아파트 전기 전문가가 방문합니다",
          ),
        ),
        // 폼 필드들
        ...(["고객 이름", "연락처", "주소", "방문 희망일"] as const).map((label) =>
          React.createElement(
            "div",
            {
              key: label,
              style: {
                display: "flex",
                flexDirection: "column" as const,
                gap: 4,
              },
            },
            React.createElement(
              "div",
              { style: { color: "#666", fontSize: 12, fontWeight: 700 } },
              label,
            ),
            React.createElement("div", {
              style: {
                height: 36,
                border: "1.5px solid #e0e0e0",
                borderRadius: 8,
                background: "#f8f9fa",
              },
            }),
          ),
        ),
        // 예약 버튼
        React.createElement(
          "div",
          {
            style: {
              background: NAVY,
              borderRadius: 12,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 8,
            },
          },
          React.createElement(
            "div",
            { style: { color: WHITE, fontSize: 16, fontWeight: 700 } },
            "무료 점검 예약하기",
          ),
        ),
      ),
    ),
    // 내레이션 텍스트
    React.createElement(
      "div",
      {
        style: {
          color: WHITE,
          fontSize: 48,
          fontWeight: 700,
          textAlign: "center" as const,
          lineHeight: 1.5,
          padding: "60px 100px 0",
          marginTop: 40,
        },
      },
      narration,
    ),
  );

  return renderToBuffer(element);
}
