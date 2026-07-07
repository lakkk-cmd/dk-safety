import { continueRender, delayRender } from "remotion";

// 메인 앱(globals.css)과 동일한 Pretendard Variable CDN 소스
const PRETENDARD_URL =
  "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2";

let loaded = false;

export function ensurePretendard(): void {
  if (loaded || typeof document === "undefined") return;
  loaded = true;

  const handle = delayRender("Pretendard 폰트 로딩");
  const font = new FontFace(
    "Pretendard",
    `url(${PRETENDARD_URL}) format("woff2-variations")`,
    { weight: "45 920", display: "swap" }
  );
  font
    .load()
    .then(() => {
      document.fonts.add(font);
      continueRender(handle);
    })
    .catch(() => {
      // 오프라인 등 로드 실패 시 시스템 폰트로 폴백하고 렌더는 계속
      continueRender(handle);
    });
}
