/**
 * 세대전기점검표 1페이지 — "경로 A"(2026-09-22, CEO 절대기준 확정) 렌더러.
 *
 * 이전 경로(satori/next-og로 별지15를 "비슷하게" 다시 그림)는 CEO 절대기준(별지15 0% 변경)에
 * 정면으로 위배되어 폐기됐다(REQUIREMENTS_CEO_0pct_20260922.md, 진단출력_품질기준안_v2_CEO절대기준.md).
 * 이 파일은 대신:
 *
 *   1. `public/templates/unit-inspection-form-gazette-original.pdf`(고시 원본, 바이트 불변)를
 *      그대로 로드해서 페이지 자체를 건드리지 않고
 *   2. pdf-lib로 그 위에 "빈칸"에만 값을 스탬프한다(호·성명·일자, 점검결과 ○/×/, 비고,
 *      기타사항, 「{아파트명} 관리사무소」, 서명).
 *
 * 격자·고정문구·확인란 위치·범례는 원본 그대로이므로 다시 그리지 않는다. 좌표는
 * pdfjs-dist로 원본의 텍스트 레이어 좌표를 실측해 산출했다(문서:
 * docs/collab/apt-manager-inspection/PATH_A_COORDINATES.md).
 *
 * 글리프 주의: 원본 PDF 내부에는 ○(U+25CB)가 정상 렌더링되지만, 그 폰트는 원본 문서에
 * 실제로 쓰인 글자만 담은 서브셋이라(예: 임의 입주자 성명·아파트명 등 새 한글 텍스트는
 * 커버 못 함) 스탬프용으로 재사용할 수 없다. 그래서 별도 풀커버리지 폰트를 embed해야
 * 하는데, 이 저장소에 이미 있는 NotoSansKR-Bold.woff2는 서브셋이라 ○(U+25CB) 글리프가
 * 없다(실측 확인, fontkit.hasGlyphForCodePoint(0x25cb) === false) — CSS로 원을 그리는 대신
 * "문자 글리프"를 쓰라는 이번 지시와 정면 충돌한다. 이 함수는 그래서 스탬프 폰트 바이트를
 * 파라미터로 받는다(의존성 주입) — 실제 배포용 폰트 소싱(풀커버리지 오픈소스 한글 폰트 확보)은
 * 잔여 리스크로 HANDOFF_TO_GROK.md에 남겨둔다. 로컬 샘플 생성 시에는 Windows 시스템 폰트
 * (맑은 고딕, C:\Windows\Fonts\malgun.ttf)를 스크립트에서 주입해 검증한다 — 이 폰트 자체는
 * 저장소에 포함하지 않는다(MS 라이선스, 리포에 커밋 금지).
 */

import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { existsSync, readFileSync } from "fs";
import path from "path";
import type { ChecklistEntry, ChecklistItemId } from "@/lib/unit-inspection-rules";

export const TEMPLATE_PATH = path.join(process.cwd(), "public/templates/unit-inspection-form-gazette-original.pdf");

/**
 * 좌표표(pt, PDF 사용자 공간 — 원점 좌하단). 원본 페이지 크기 595 x 841pt(A4).
 * pdfjs-dist로 원본 텍스트 레이어를 실측해서 산출(문서화: PATH_A_COORDINATES.md).
 * "end"는 해당 라벨(호/귀하/년/월/일) 글자가 시작되는 x — 그 앞 빈칸에 오른쪽 정렬로 채운다.
 */
export const HEADER_COORDS = {
  unitBlank: { endX: 158, y: 705.5, fontSize: 12 }, // "___호" 앞
  nameBlank: { endX: 147, y: 677.5, fontSize: 11 }, // "___귀하" 앞
  yearBlank: { endX: 450, y: 677.5, fontSize: 11 },
  monthBlank: { endX: 488, y: 677.5, fontSize: 11 },
  dayBlank: { endX: 527, y: 677.5, fontSize: 11 }
};

/** 12항목 "점검 결과" 셀 중심 x=479(헤더 "점검 결과" 폭 중심), 항목별 y(baseline).
 * 비고 열 좌우 경계는 CEO FAIL 지적(비고 텍스트가 오른쪽 세로선 밖으로 넘침) 이후
 * `@napi-rs/canvas`로 원본을 4배 확대 라스터해 격자선 픽셀을 직접 스캔해서 실측했다
 * (12개 항목 행 전체 y범위에서 x=506.8/544.5에 항상 존재하는 세로선 검출, frac>0.85) —
 * 이전엔 텍스트 라벨 위치로 어림짐작한 값(505)을 썼는데, 그 값 자체가 실제 왼쪽
 * 테두리(506.8)보다 1.8pt 왼쪽이라 경계선을 밟고 있었다. */
export const REMARK_COL_LEFT_BORDER = 506.8;
export const REMARK_COL_RIGHT_BORDER = 544.5;
export const RESULT_COLUMN_X = 479;
export const REMARK_COLUMN_X = 509.5; // 왼쪽 테두리(506.8)에서 2.7pt 안쪽
export const ROW_Y: Record<ChecklistItemId, number> = {
  insulation_main_branch: 558,
  insulation_equipment: 531,
  wiring_meter_inlet: 505,
  wiring_aging: 481,
  wiring_breaker_capacity: 456,
  elb_missing_or_faulty: 430,
  elb_bathroom_outlet: 396, // 원본에서 확인사항 문구가 2줄로 접히는 행 — 두 줄의 세로 중앙
  dedicated_breaker_3kw: 370,
  switchgear_damage: 343,
  grounding_panel_resistance: 317,
  grounding_equipment: 291,
  grounding_indoor_wire: 265
};

/** 기타사항 폰트(2026-09-22 9차 CEO 지시: 실측값 줄 글자가 바로 위 셀보다 작으면 실패) —
 * 원본 확인사항 열 항목 텍스트(예: "옥내 전로에 접지선 미설치")의 실측 폰트가 9.95pt였다
 * (pdfjs 텍스트 레이어 h값 실측). 기존 8pt에서 이 값으로 맞춤 — 폰트 실측 확인 결과 이
 * 문자열 길이로는 maxWidth(355pt) 안에 여유 있게 들어간다(167pt 안팎). */
export const ETC_ROW = { x: 176, y: 234, fontSize: 9.95, maxWidth: 355 };

/**
 * 확인란 미니테이블(원본 "확인 | 호/담당자+값+인" 3열 x 2행) 실측 격자 좌표.
 *
 * **8배율 육안 재확인(2026-09-22, 8차)으로 이전 이해가 틀렸음을 발견**: 이전엔 세로선이
 * 342.9/368.4/412.9/508.4 네 개(3칸: 확인|라벨|값+인)라고 봤는데, x=412.9는 실제 격자선이
 * 아니라 "호" 글리프 자체의 획이 다수 y에서 우연히 일관되게 어두워서(자동 스캔의 오탐)
 * 생긴 값이었다. 원본을 8배율로 직접 확대해 육안으로 다시 보니 세로선은 342.9/368.4/508.4
 * **세 개뿐**(2칸: 확인 | 호·담당자+값+인이 전부 합쳐진 넓은 한 칸)이다.
 *
 * 즉 "호"(x≈401.5~412.6)와 "인"(x≈497.1~507.1)은 같은 넓은 셀(368.4~508.4) 안에 나란히
 * 인쇄된 두 글자일 뿐, 그 사이에 별도 칸 경계가 없다. CEO 최신 지시(FAIL 스크린샷:
 * `CEO_fail_confirm_unit_number_wrong_cell.png`)에 따라 스탬프 규칙을 다음으로 확정:
 *   - 1행(호수): 숫자만(예: "501", "호" 재기입 금지) — "호" 글자 **바로 앞**의 빈 공간
 *     (368.4~401.5 사이)에 우측정렬로 채운다. "호" 뒤(412.6~497.1, "인" 앞)는 절대 안 씀 —
 *     이전엔 여기 "501호"를 넣어서 "호수가 인 칸에 있다"는 FAIL을 받았다.
 *   - 2행(담당자): 점검자 이름을 "담당자" 글자 뒤(라벨 끝~인 앞) 공간에 채운다 — 이 칸은
 *     라벨이 왼쪽에 짧게 있고 오른쪽이 넓게 비어있어 이름이 들어갈 유일한 공간이다.
 *   - 서명은 있을 때만 "인" 글자 바로 앞의 좁은 공간에 작게 넣는다.
 */
export const CONFIRM_TABLE = {
  cellLeftBorder: 368.4, // 확인 | (호·담당자 통합 셀) 구분선
  hoLabelStart: 401.54, // "호" 글자 시작 x
  dandangjaLabelEnd: 405.62, // "담당자" 글자 끝 x
  inColumnStart: 497.13, // "인" 글자 시작 x — 스탬프는 반드시 이 앞에서 끝나야 함
  row1: { top: 146.8, bottom: 128.3 }, // "호" 행
  row2: { top: 128.3, bottom: 112.3 } // "담당자" 행
};
/** "담당자 ___ 인" 빈칸 — 점검자 이름을 "담당자" 라벨 뒤, "인" 앞 공간에 채운다
 * ("빈칸·직책만 금지" — 실제 이름 필수, 2026-09-22 CEO 지시). 위치(라벨 끝 405.6 ~ 인 시작
 * 497.1 사이)는 8차 재확인에서도 맞다고 확인됨. **폰트는 9차 CEO 지시로 8→9.95pt로
 * 확대** — 원본 "담당자"/"인" 라벨의 실측 폰트(9.95pt, pdfjs 텍스트 레이어 h값)와 맞춤.
 * 이 공간(91.5pt)엔 3~4자 이름이 9.95pt로도 여유 있게 들어간다(fontkit 실측: "홍길동"
 * ≈29.85pt). */
export const INSPECTOR_NAME_BLANK = { x: 417, y: 116.8, endX: 492, fontSize: 9.95 };
/** 세대 확인 호수 — "호" 글자 **바로 앞**에 숫자만 우측정렬로 채운다(8차 CEO 지시로 위치
 * 반전). **폰트는 9차 CEO 지시로 7→9.95pt로 확대** — 원본 "호" 라벨의 실측 폰트(9.95pt)와
 * 맞춤. 좁은 공간(368.4~399, ≈30.6pt)에도 9.95pt 4자리 숫자("1504")까지 fontkit 실측
 * 21.92pt로 들어감 확인. */
export const RESIDENT_CONFIRM_UNIT_LABEL = { endX: 399, y: 133.6, fontSize: 9.95 };
/** 서명 이미지 — "인" 글자 바로 앞의 좁은 공간에만(있을 때만). 이전엔 호수 텍스트 옆에
 * 나란히 뒀는데, 호수가 이제 "호" 앞으로 이동해서 서명은 "인" 앞 공간을 그대로 쓴다. */
export const RESIDENT_SIGNATURE_BOX = { x: 460, y: 131, width: 34, height: 13 };
/** {아파트명} 관리사무소 — 원본에 이 문구의 사전 인쇄 자리가 없어 "빈칸 기입"만으로는
 * 낼 수 없다. 이 한 줄만은 "0% 배경 불변" 원칙의 예외로 CEO가 직접 지시한 항목이다
 * (HANDOFF_TO_GROK.md 참고). 표·격자·기존 문구는 전혀 안 건드림.
 * **위치는 2026-09-22 9차 CEO 지시로 재조정**: "확인란 바로 아래"(y=98)가 페이지 맨
 * 하단 취지에 비해 너무 위쪽이라는 지적 — 약 4줄(≈52pt) 더 아래(y=46)로 내리고, 확인란
 * 오른쪽 경계가 아니라 **페이지 우측 여백 기준**으로 정렬한다(endX=540, 비고 열 우측
 * 테두리 544.5와 유사한 페이지 우측 컨텐츠 경계). y=46은 페이지 하단(y=0)까지 충분한
 * 여백이 남아 잘림 위험이 없다. */
export const OFFICE_FOOTER = { endX: 540, y: 46, fontSize: 8.5 };

export type PathAChecklistRow = { id: ChecklistItemId; result: ChecklistEntry["result"]; remark: string };

export type UnitInspectionPathAData = {
  dong: string;
  ho: string;
  residentName: string | null;
  inspectedAt: { year: number; month: number; day: number };
  checklist: PathAChecklistRow[];
  /** 부하전류·누설전류·절연저항 — 방문/미방문 공통으로 항상 기타사항에 같은 형식으로 표기(2026-09-22 2차 지시) */
  etcNotes: string;
  apartmentName: string;
  /** 담당자 칸에 채울 점검자 이름(전기안전관리자/워커) — 필수, 직책만 쓰지 않는다. */
  inspectorName: string;
  /** SignaturePad base64 PNG data URL — 세대방문점검만 존재(미방문은 세대 부재라 실제로 없음) */
  signatureData: string | null;
};

/** 원본 비고란 실사용폭 — CEO FAIL 지적(비고 텍스트가 표 밖으로 넘침) 이후 격자선을 직접
 * 픽셀 스캔해 실측(REMARK_COL_LEFT_BORDER~RIGHT_BORDER = 506.8~544.5, 37.7pt). 텍스트
 * 시작점(REMARK_COLUMN_X=509.5)이 왼쪽 테두리에서 이미 2.7pt 들어간 지점이므로, 여기서부터
 * 오른쪽 테두리 앞 2pt까지만 허용한다: 544.5-509.5-2 = 33pt. "현장 확인 사실·숫자만
 * 짧게"라는 CEO 절대기준 1-3과도 방향이 맞다 — 판정 논설·AI 톤 문장은 여기 넣지 않는다. */
const REMARK_MAX_WIDTH_PT = 33;
function clampRemarkToWidth(font: PDFFont, text: string, fontSize: number, maxWidth = REMARK_MAX_WIDTH_PT): string {
  if (!text) return "";
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(cut + "…", fontSize) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut + "…";
}

function resultGlyph(result: ChecklistEntry["result"]): string {
  if (result === "O") return "○";
  if (result === "X") return "×";
  return "/"; // "/" 와 "N/A" 둘 다 원본 범례의 "/"(해당없음) 기호
}

/** GREEK CAPITAL LETTER OMEGA(U+03A9, 소스에서 "Ω"로 입력되는 기본값)는 NanumGothic-Regular.ttf에
 * 글리프가 없다(fontkit 실측 확인) — 있는 글리프인 OHM SIGN(U+2126, 시각적으로 동일)으로
 * 치환한다. 2026-09-23 실제 발급본에서 "절연 0.013M" 뒤 단위 기호가 통째로 사라지던 증상의
 * 원인 중 하나(주 원인은 아래 subset 버그) — subset:false로도 존재하지 않는 글리프 자체는
 * 여전히 그려지지 않으므로 별도로 치환해야 한다. */
function normalizeForStampFont(text: string): string {
  return text.replace(/Ω/g, "Ω");
}

type GlyphCheckFont = ReturnType<typeof fontkit.create>;

/** 폰트에 없는 글리프는 pdf-lib가 조용히 그리지 않고 넘어간다(예외 없음) — 그대로 두면 다음에
 * 같은 문제가 또 "원인 모를 빈칸"으로 재발한다. 실제 찍히는 텍스트에서 이 폰트가 못 그리는
 * 글자가 남아있으면 무엇을 못 그렸는지 로그로 남긴다(2026-09-23). pdf-lib의 PDFFont는
 * hasGlyphForCodePoint를 노출하지 않으므로, 같은 폰트 바이트로 별도 생성한 fontkit Font로
 * 확인한다. */
function warnIfUnsupportedGlyphs(glyphFont: GlyphCheckFont, label: string, text: string) {
  const missing = [...new Set([...text])].filter((ch) => !glyphFont.hasGlyphForCodePoint(ch.codePointAt(0)!));
  if (missing.length > 0) {
    console.warn(`[unit-inspection-pdf-path-a] "${label}" 스탬프 텍스트에 폰트가 지원하지 않는 문자가 있어 해당 글자만 빠집니다: ${missing.join(" ")} (원문: ${text})`);
  }
}

function drawRightAligned(page: PDFPage, font: PDFFont, glyphFont: GlyphCheckFont, label: string, rawText: string, endX: number, y: number, fontSize: number) {
  if (!rawText) return;
  const text = normalizeForStampFont(rawText);
  warnIfUnsupportedGlyphs(glyphFont, label, text);
  const width = font.widthOfTextAtSize(text, fontSize);
  page.drawText(text, { x: endX - width, y, size: fontSize, font, color: rgb(0, 0, 0) });
}

/**
 * 관리사무소 명의는 단지명 길이가 제각각이라(예: "유니버시아드힐스테이트3단지") 고정
 * 폰트크기로는 82pt 셀 폭을 넘기기 쉽다 — 담당자 빈칸 폭 안에 들어가도록 자동 축소한다
 * (원본 셀 폭/줄 수를 바꾸지 않기 위한 유일한 방법, 0% 원칙 유지).
 */
function fitFontSizeToWidth(font: PDFFont, text: string, maxWidth: number, startSize: number, minSize = 5.5): number {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

/**
 * 원본 PDF를 바이트 불변 배경으로 로드해 빈칸만 스탬프한 1페이지 PDF를 반환한다.
 * @param stampFontBytes 스탬프용 풀커버리지 한글 폰트(○/×/한글 전부 있어야 함) — 이 저장소의
 *   서브셋 NotoSansKR은 ○ 글리프가 없어 쓸 수 없다(위 파일 상단 주석 참고). 실제 배포 전
 *   반드시 라이선스 확인된 폰트로 교체할 것 — 잔여 리스크.
 */
export async function renderUnitInspectionPage1PathA(
  data: UnitInspectionPathAData,
  stampFontBytes: Uint8Array
): Promise<Uint8Array> {
  // Vercel standalone 빌드는 outputFileTracingIncludes에 명시된 파일만 함수 번들에 포함한다
  // (2026-09-23 실제 회귀: `await import()`로 간접 로드되는 이 모듈의 fs.readFileSync는 정적
  // 트레이싱이 못 따라가 public/templates/*를 빠뜨렸다 — next.config.ts 참고). readFileSync의
  // 기본 ENOENT는 어느 파일이 왜 없는지 안 알려줘서 재발 시 원인 파악이 오래 걸리므로, 여기서
  // 먼저 존재를 확인해 어떤 배포 문제인지 바로 알 수 있는 에러로 바꾼다.
  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(
      `경로 A 고시 원본 템플릿을 찾을 수 없습니다: ${TEMPLATE_PATH} (next.config.ts outputFileTracingIncludes 누락 가능성 — 배포 번들에 public/templates가 포함됐는지 확인)`
    );
  }
  const templateBytes = readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  // subset:true는 끈다 — 2026-09-23 실제 발급본에서 ○ 결과·상당수 한글·숫자가 통째로
  // 사라지던 회귀의 진짜 원인. 이 폰트(NanumGothic-Regular.ttf, 13,297글리프)는 필요한
  // 글리프를 전부 갖고 있음을 fontkit으로 직접 실측 확인했는데도(○/×/한글/숫자 전부
  // hasGlyphForCodePoint=true) subset:true로 embed하면 CJK 글리프 다수가 빠지거나 다른
  // 글자로 바뀌어 그려졌다 — pdf-lib의 CID 서브셋팅이 글리프 인덱스가 큰(한글처럼 수천
  // 단위) 폰트에서 깨지는 알려진 한계로 보인다. subset:false(풀 임베드)로 전환하니 동일
  // 데이터로 전부 정상 렌더링됨을 직접 재현·검증했다(파일 크기는 커지지만 발급/다운로드용
  // 문서라 허용 범위).
  const font = await pdfDoc.embedFont(stampFontBytes, { subset: false });
  const glyphFont: GlyphCheckFont = fontkit.create(Buffer.from(stampFontBytes));
  const page = pdfDoc.getPages()[0];

  // 헤더: 호 / 성명 / 일자 — 전부 기존 라벨 앞 빈칸에 우측정렬로 채운다(라벨 자체는 원본 그대로).
  drawRightAligned(page, font, glyphFont, "unit", `${data.dong}동 ${data.ho}`, HEADER_COORDS.unitBlank.endX, HEADER_COORDS.unitBlank.y, HEADER_COORDS.unitBlank.fontSize);
  drawRightAligned(page, font, glyphFont, "residentName", data.residentName ?? "입주자 미확인", HEADER_COORDS.nameBlank.endX, HEADER_COORDS.nameBlank.y, HEADER_COORDS.nameBlank.fontSize);
  drawRightAligned(page, font, glyphFont, "year", String(data.inspectedAt.year), HEADER_COORDS.yearBlank.endX, HEADER_COORDS.yearBlank.y, HEADER_COORDS.yearBlank.fontSize);
  drawRightAligned(page, font, glyphFont, "month", String(data.inspectedAt.month), HEADER_COORDS.monthBlank.endX, HEADER_COORDS.monthBlank.y, HEADER_COORDS.monthBlank.fontSize);
  drawRightAligned(page, font, glyphFont, "day", String(data.inspectedAt.day), HEADER_COORDS.dayBlank.endX, HEADER_COORDS.dayBlank.y, HEADER_COORDS.dayBlank.fontSize);

  // 12항목 점검결과 + 비고 — 문자 글리프(○/×//)만 사용, CSS/도형 대체 없음.
  for (const row of data.checklist) {
    const y = ROW_Y[row.id];
    if (y === undefined) continue;
    const glyph = resultGlyph(row.result);
    const color = row.result === "X" ? rgb(0.66, 0.13, 0.09) : rgb(0, 0, 0);
    page.drawText(glyph, { x: RESULT_COLUMN_X - font.widthOfTextAtSize(glyph, 12) / 2, y, size: 12, font, color });
    const remarkFontSize = 6.5;
    const remark = clampRemarkToWidth(font, normalizeForStampFont(row.remark), remarkFontSize);
    if (remark) {
      warnIfUnsupportedGlyphs(glyphFont, `remark(${row.id})`, remark);
      page.drawText(remark, { x: REMARK_COLUMN_X, y, size: remarkFontSize, font, color: rgb(0.2, 0.2, 0.2) });
    }
  }

  // 기타사항 — 원본 행 취지 안의 보충(부하전류/IGR/절연저항 실측값 등 짧게).
  if (data.etcNotes) {
    const etcText = clampRemarkToWidth(font, normalizeForStampFont(data.etcNotes), ETC_ROW.fontSize, ETC_ROW.maxWidth);
    warnIfUnsupportedGlyphs(glyphFont, "etcNotes", etcText);
    page.drawText(etcText, { x: ETC_ROW.x, y: ETC_ROW.y, size: ETC_ROW.fontSize, font, color: rgb(0, 0, 0) });
  }

  // 담당자 — 점검자 이름(2026-09-22 2차 지시: 빈칸·직책만 금지, 실제 이름 필수).
  const inspectorText = normalizeForStampFont(data.inspectorName);
  warnIfUnsupportedGlyphs(glyphFont, "inspectorName", inspectorText);
  const inspectorMaxWidth = INSPECTOR_NAME_BLANK.endX - INSPECTOR_NAME_BLANK.x;
  const inspectorFontSize = fitFontSizeToWidth(font, inspectorText, inspectorMaxWidth, INSPECTOR_NAME_BLANK.fontSize);
  page.drawText(inspectorText, { x: INSPECTOR_NAME_BLANK.x, y: INSPECTOR_NAME_BLANK.y, size: inspectorFontSize, font, color: rgb(0, 0, 0) });

  // 세대 확인 — 호수 숫자만(원본 "호" 글자를 다시 쓰지 않는다, 2026-09-22 8차 CEO 지시),
  // "호" 라벨 바로 앞에 우측정렬로 채운다 + 서명 이미지(있을 때만, 미방문은 세대 부재라 없음).
  drawRightAligned(page, font, glyphFont, "confirmHo", data.ho, RESIDENT_CONFIRM_UNIT_LABEL.endX, RESIDENT_CONFIRM_UNIT_LABEL.y, RESIDENT_CONFIRM_UNIT_LABEL.fontSize);
  if (data.signatureData) {
    const pngBytes = Buffer.from(data.signatureData.split(",")[1] ?? "", "base64");
    const png = await pdfDoc.embedPng(pngBytes);
    const scale = Math.min(RESIDENT_SIGNATURE_BOX.width / png.width, RESIDENT_SIGNATURE_BOX.height / png.height);
    page.drawImage(png, {
      x: RESIDENT_SIGNATURE_BOX.x,
      y: RESIDENT_SIGNATURE_BOX.y,
      width: png.width * scale,
      height: png.height * scale
    });
  }

  // 하단 관리사무소 명의(2026-09-22 2차 지시: 페이지 맨 하단, 잘림 0) — 원본에 없는 신설 줄
  // (위 타입 주석 참고, CEO 명시 지시에 따른 유일한 예외).
  const officeText = `${data.apartmentName} 관리사무소`;
  drawRightAligned(page, font, glyphFont, "officeText", officeText, OFFICE_FOOTER.endX, OFFICE_FOOTER.y, OFFICE_FOOTER.fontSize);

  return pdfDoc.save();
}
