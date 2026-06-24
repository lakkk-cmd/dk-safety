/** pdf-parse(pdfjs-dist)는 Node 런타임에서도 전역 DOMMatrix를 그대로 참조하므로, import 시점 ReferenceError를
 *  막기 위해 @napi-rs/canvas의 구현으로 먼저 폴리필한 뒤에야 pdf-parse를 동적으로 불러온다.
 *  서버 전용 모듈만 이 파일을 import해야 한다 — 클라이언트 컴포넌트에서 import하면 네이티브 canvas 바이너리가
 *  브라우저 번들에 끼어들어 빌드가 깨진다. */

let domMatrixPolyfilled = false;

export async function loadPDFParse() {
  if (!domMatrixPolyfilled) {
    if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
      const canvas = await import("@napi-rs/canvas");
      (globalThis as { DOMMatrix?: unknown }).DOMMatrix = canvas.DOMMatrix;
    }
    domMatrixPolyfilled = true;
  }
  const { PDFParse } = await import("pdf-parse");
  return PDFParse;
}
