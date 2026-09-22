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
import { readFileSync } from "fs";
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

export const ETC_ROW = { x: 176, y: 234, fontSize: 8, maxWidth: 355 };

/**
 * 확인란 미니테이블(원본 "확인 | 호/담당자 | 값 | 인" 4열 x 2행) 실측 격자 좌표 —
 * CEO FAIL 지적(호수가 세로선·인 칸을 침범 / 담당자 이름이 하단 오른쪽 셀 밖) 이후
 * REMARK_COL과 동일한 방식(4배 라스터+격자선 픽셀 스캔)으로 재실측했다:
 *   세로선: 342.9(좌측 외곽) / 368.4(확인|호·담당자 구분) / 412.9(호·담당자|값+인 구분) /
 *           508.4(우측 외곽)
 *   가로선: 146.8(1행 상단) / 128.3(1행·2행 구분) / 112.3(2행 하단)
 * "값+인"은 하나로 합쳐진 셀이고("인"은 그 안에 미리 인쇄된 글자, x≈497.13에서 시작) —
 * 즉 스탬프 가능 영역은 412.9(좌)~497.13("인" 시작, 좌) 사이뿐이다. 이전 좌표(담당자
 * x=408)는 이 셀의 왼쪽 경계(412.9)보다도 왼쪽이라 라벨 칸을 침범하고 있었다.
 */
export const CONFIRM_TABLE = {
  valueLeftBorder: 412.9,
  inColumnStart: 497.13, // "인" 글자 시작 x — 스탬프는 반드시 이 앞에서 끝나야 함
  row1: { top: 146.8, bottom: 128.3 }, // "호" 행
  row2: { top: 128.3, bottom: 112.3 } // "담당자" 행
};
/** "담당자 ___ 인" 빈칸(2026-09-22 2차 CEO 지시로 정정) — 관리사무소 명의가 아니라
 * **점검자 이름**을 채운다("빈칸·직책만 금지" — 실제 이름 필수). 좌표는 위 실측 격자
 * 기준(좌 412.9+패딩, 우 "인" 앞+패딩)으로 재조정. */
export const INSPECTOR_NAME_BLANK = { x: 417, y: 116.8, endX: 492, fontSize: 8 };
/** "확인 | 호 ___ 인" 빈칸 — 좌측엔 세대 호수, 우측엔 서명 이미지(있을 때만)를 나란히 채운다.
 * 좌표는 위 실측 격자 기준(좌 412.9+패딩)으로 재조정 — 이전 x=413은 경계선(412.9)에
 * 거의 붙어있어(패딩 0.1pt) 경계 침범으로 보였다. */
export const RESIDENT_CONFIRM_UNIT_LABEL = { x: 417, y: 133.6, fontSize: 6.5, maxWidth: 28 };
export const RESIDENT_SIGNATURE_BOX = { x: 450, y: 131, width: 42, height: 13 };
/** {아파트명} 관리사무소(2026-09-22 3차 CEO 지시로 위치 확정: "확인란 바로 아래") — 원본에
 * 이 문구의 사전 인쇄 자리가 없어 "빈칸 기입"만으로는 낼 수 없다. 확인란(담당자 행,
 * y=116.63) 바로 아래 여백에 붙여서 넣는다 — 이 한 줄만은 "0% 배경 불변" 원칙의 예외로
 * CEO가 직접 지시한 항목이다(HANDOFF_TO_GROK.md 참고). 표·격자·기존 문구는 전혀 안 건드림.
 * endX=497은 확인란 표의 오른쪽 경계(497.13, "인" 글자 위치)와 맞춰 시각적으로 그 표에
 * 붙어있는 것처럼 보이게 한다. */
export const OFFICE_FOOTER = { endX: 497, y: 98, fontSize: 8.5 };

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

function drawRightAligned(page: PDFPage, font: PDFFont, text: string, endX: number, y: number, fontSize: number) {
  if (!text) return;
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
  const templateBytes = readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(stampFontBytes, { subset: true });
  const page = pdfDoc.getPages()[0];

  // 헤더: 호 / 성명 / 일자 — 전부 기존 라벨 앞 빈칸에 우측정렬로 채운다(라벨 자체는 원본 그대로).
  drawRightAligned(page, font, `${data.dong}동 ${data.ho}`, HEADER_COORDS.unitBlank.endX, HEADER_COORDS.unitBlank.y, HEADER_COORDS.unitBlank.fontSize);
  drawRightAligned(page, font, data.residentName ?? "입주자 미확인", HEADER_COORDS.nameBlank.endX, HEADER_COORDS.nameBlank.y, HEADER_COORDS.nameBlank.fontSize);
  drawRightAligned(page, font, String(data.inspectedAt.year), HEADER_COORDS.yearBlank.endX, HEADER_COORDS.yearBlank.y, HEADER_COORDS.yearBlank.fontSize);
  drawRightAligned(page, font, String(data.inspectedAt.month), HEADER_COORDS.monthBlank.endX, HEADER_COORDS.monthBlank.y, HEADER_COORDS.monthBlank.fontSize);
  drawRightAligned(page, font, String(data.inspectedAt.day), HEADER_COORDS.dayBlank.endX, HEADER_COORDS.dayBlank.y, HEADER_COORDS.dayBlank.fontSize);

  // 12항목 점검결과 + 비고 — 문자 글리프(○/×//)만 사용, CSS/도형 대체 없음.
  for (const row of data.checklist) {
    const y = ROW_Y[row.id];
    if (y === undefined) continue;
    const glyph = resultGlyph(row.result);
    const color = row.result === "X" ? rgb(0.66, 0.13, 0.09) : rgb(0, 0, 0);
    page.drawText(glyph, { x: RESULT_COLUMN_X - font.widthOfTextAtSize(glyph, 12) / 2, y, size: 12, font, color });
    const remarkFontSize = 6.5;
    const remark = clampRemarkToWidth(font, row.remark, remarkFontSize);
    if (remark) {
      page.drawText(remark, { x: REMARK_COLUMN_X, y, size: remarkFontSize, font, color: rgb(0.2, 0.2, 0.2) });
    }
  }

  // 기타사항 — 원본 행 취지 안의 보충(부하전류/IGR/절연저항 실측값 등 짧게).
  if (data.etcNotes) {
    const etcText = clampRemarkToWidth(font, data.etcNotes, ETC_ROW.fontSize, ETC_ROW.maxWidth);
    page.drawText(etcText, { x: ETC_ROW.x, y: ETC_ROW.y, size: ETC_ROW.fontSize, font, color: rgb(0, 0, 0) });
  }

  // 담당자 — 점검자 이름(2026-09-22 2차 지시: 빈칸·직책만 금지, 실제 이름 필수).
  const inspectorMaxWidth = INSPECTOR_NAME_BLANK.endX - INSPECTOR_NAME_BLANK.x;
  const inspectorFontSize = fitFontSizeToWidth(font, data.inspectorName, inspectorMaxWidth, INSPECTOR_NAME_BLANK.fontSize);
  page.drawText(data.inspectorName, { x: INSPECTOR_NAME_BLANK.x, y: INSPECTOR_NAME_BLANK.y, size: inspectorFontSize, font, color: rgb(0, 0, 0) });

  // 세대 확인 — 호수(항상, 동은 위 헤더에 이미 있어 칸이 좁은 여기선 호만) + 서명 이미지
  // (있을 때만, 미방문은 세대 부재라 실제로 없음).
  const unitLabel = clampRemarkToWidth(font, `${data.ho}호`, RESIDENT_CONFIRM_UNIT_LABEL.fontSize, RESIDENT_CONFIRM_UNIT_LABEL.maxWidth);
  page.drawText(unitLabel, { x: RESIDENT_CONFIRM_UNIT_LABEL.x, y: RESIDENT_CONFIRM_UNIT_LABEL.y, size: RESIDENT_CONFIRM_UNIT_LABEL.fontSize, font, color: rgb(0, 0, 0) });
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
  drawRightAligned(page, font, officeText, OFFICE_FOOTER.endX, OFFICE_FOOTER.y, OFFICE_FOOTER.fontSize);

  return pdfDoc.save();
}
