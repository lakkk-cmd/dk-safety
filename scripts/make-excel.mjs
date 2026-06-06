import ExcelJS from "exceljs";
import { mkdir } from "fs/promises";
import path from "path";

// ─── 색상 ───────────────────────────────────────────────────────────────────
const C = {
  HEADER:      "1F497D",
  ONLINE:      "BDD7EE",   // 하늘색
  OFFLINE:     "C6EFCE",   // 연초록
  FINANCE:     "FFF2CC",   // 연노랑
  MILESTONE:   "F4B942",   // 주황색
  GOLD:        "FFD700",
  YEAR1:       "E2EFDA",
  YEAR2:       "DDEBF7",
  YEAR3:       "FCE4D6",
  Q1:          "E2EFDA",
  Q2:          "DDEBF7",
  Q3:          "FCE4D6",
  Q4:          "EDE7F6",
  WHITE:       "FFFFFF",
};

const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex}` } });
const border = () => {
  const s = { style: "thin" };
  return { left: s, right: s, top: s, bottom: s };
};
const center = (wrap = true) => ({ horizontal: "center", vertical: "middle", wrapText: wrap });
const left = () => ({ horizontal: "left", vertical: "middle", wrapText: true });

function hdr(ws, row, col, value, bgHex, { bold = true, white = true, size = 10 } = {}) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.fill = fill(bgHex);
  cell.font = { bold, color: { argb: white ? "FFFFFFFF" : "FF000000" }, size };
  cell.alignment = center();
  cell.border = border();
  return cell;
}

function data(ws, row, col, value, bgHex, opts = {}) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  if (bgHex) cell.fill = fill(bgHex);
  cell.font = { bold: opts.bold ?? false, size: opts.size ?? 9, color: { argb: "FF000000" } };
  cell.alignment = opts.align === "center" ? center() : left();
  cell.border = border();
  return cell;
}

// ─── 전체요약 시트 ─────────────────────────────────────────────────────────
function buildSummary(wb) {
  const ws = wb.addWorksheet("전체요약");
  ws.views = [{ state: "frozen", ySplit: 2 }];

  // 제목
  ws.mergeCells("A1:H1");
  const title = ws.getCell("A1");
  title.value = "대경이엔피 (우리집 안심전기) 3년 로드맵 & 1년차 실행계획";
  title.fill = fill(C.HEADER);
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.alignment = center();
  ws.getRow(1).height = 36;

  // ── 연도별 목표 ──
  ws.mergeCells("A3:H3");
  ws.getCell("A3").value = "■ 연도별 성장 목표";
  ws.getCell("A3").font = { bold: true, size: 12, color: { argb: "FF1F497D" } };

  const yHdrs = ["구분", "기간", "연매출목표", "주간건수", "단가", "집중과제", "주요전략", "비고"];
  yHdrs.forEach((h, i) => hdr(ws, 4, i + 1, h, C.HEADER));

  const years = [
    [C.YEAR1, "1년차", "2026.06~2027.05", "5,000만원", "4~5건/주", "20만원", "브랜드 정착·반복 고객 확보·플랫폼 안정화", "플랫폼·앱 출시"],
    [C.YEAR2, "2년차", "2027.06~2028.05", "2억5,000만원", "15~20건/주", "25만원", "파트너 기사 도입·서비스 다양화·앱 MAU 확대", "B2B·특허 활용"],
    [C.YEAR3, "3년차", "2028.06~2029.05", "7억5,000만원", "50건+/주", "30만원", "법인 전환·전국화·B2B 계약·프랜차이즈", "투자 유치"],
  ];
  years.forEach(([color, ...vals], ri) => {
    vals.forEach((v, ci) => data(ws, 5 + ri, ci + 1, v, color, { align: "center" }));
  });

  // ── 1년차 분기별 목표 ──
  ws.mergeCells("A9:H9");
  ws.getCell("A9").value = "■ 1년차 분기별 목표";
  ws.getCell("A9").font = { bold: true, size: 12, color: { argb: "FF1F497D" } };

  const qHdrs = ["분기", "기간", "주차", "목표매출", "예약건수", "주간평균", "핵심 마일스톤", "비고"];
  qHdrs.forEach((h, i) => hdr(ws, 10, i + 1, h, C.HEADER));

  const quarters = [
    [C.Q1, "Q1", "2026.06~08", "1~13주",  "500만원",   "25건",  "1.9건/주", "플랫폼 오픈·첫 현장·앱 출시 준비", ""],
    [C.Q2, "Q2", "2026.09~11", "14~26주", "1,000만원", "50건",  "3.8건/주", "앱 MAU 확대·쇼츠 20편·월 예약 30건", ""],
    [C.Q3, "Q3", "2026.12~2027.02", "27~39주", "1,500만원", "75건",  "5.8건/주", "정기관리 패키지·재방문율 30%·후기 50건", "파트너 검토"],
    [C.Q4, "Q4", "2027.03~05", "40~52주", "2,000만원", "100건", "7.7건/주", "월 예약 40건·KIBO 신청·파트너 기사 확대", "법인 준비"],
  ];
  quarters.forEach(([color, ...vals], ri) => {
    vals.forEach((v, ci) => data(ws, 11 + ri, ci + 1, v, color, { align: "center" }));
  });

  // 합계 행
  const totals = ["합계", "2026.06~2027.05", "1~52주", "5,000만원", "250건", "4.8건/주", "1년차 목표 달성 → 2년차 파트너 기사 도입", ""];
  totals.forEach((v, ci) => data(ws, 15, ci + 1, v, C.GOLD, { bold: true, align: "center", size: 10 }));

  // 범례
  ws.mergeCells("A17:H17");
  ws.getCell("A17").value = "■ 색상 범례";
  ws.getCell("A17").font = { bold: true, size: 11, color: { argb: "FF1F497D" } };

  const legend = [
    [1, C.ONLINE, "온라인 (SNS/플랫폼)"],
    [3, C.OFFLINE, "오프라인 (현장/홍보)"],
    [5, C.FINANCE, "재무/관리"],
    [7, C.MILESTONE, "마일스톤"],
  ];
  legend.forEach(([col, color, label]) => {
    data(ws, 18, col, label, color, { align: "center" });
  });

  // 컬럼 너비
  [8, 20, 10, 14, 12, 10, 42, 14].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.getRow(3).height = 22;
  ws.getRow(9).height = 22;
}

// ─── 분기 시트 ────────────────────────────────────────────────────────────
const COLS = ["주차", "기간", "온라인(SNS/플랫폼)", "오프라인(현장/홍보)", "재무/관리", "주간목표건수", "누적예약건수", "누적매출(만원)", "마일스톤"];
const WIDTHS = [7, 16, 38, 38, 30, 12, 12, 14, 32];

function addWeekDate(startISO, weekIdx) {
  const d = new Date(startISO);
  d.setDate(d.getDate() + weekIdx * 7);
  const e = new Date(d);
  e.setDate(e.getDate() + 6);
  return `${d.getMonth()+1}/${d.getDate()}~${e.getMonth()+1}/${e.getDate()}`;
}

function buildQuarterSheet(wb, sheetName, startISO, targetMan, qNum, weeks) {
  const ws = wb.addWorksheet(sheetName);
  ws.views = [{ state: "frozen", ySplit: 2 }];

  // 제목
  ws.mergeCells("A1:I1");
  const t = ws.getCell("A1");
  t.value = `${sheetName} 실행계획 — 목표 ${targetMan.toLocaleString()}만원 (단가 20만원 기준)`;
  t.fill = fill(C.HEADER);
  t.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  t.alignment = center();
  ws.getRow(1).height = 30;

  // 헤더
  COLS.forEach((h, i) => hdr(ws, 2, i + 1, h, C.HEADER));
  ws.getRow(2).height = 22;

  let cumJobs = 0;
  let cumRev = 0;

  weeks.forEach((w, wi) => {
    const row = wi + 3;
    cumJobs += w.jobs;
    cumRev += w.jobs * 20;

    const rowData = [
      [`W${wi + 1}`, "center"],
      [addWeekDate(startISO, wi), "center"],
      [w.online, "left"],
      [w.offline, "left"],
      [w.finance, "left"],
      [`${w.jobs}건`, "center"],
      [`${cumJobs}건`, "center"],
      [`${cumRev.toLocaleString()}만원`, "center"],
      [w.milestone || "", "center"],
    ];

    rowData.forEach(([val, align], ci) => {
      const cell = ws.getCell(row, ci + 1);
      cell.value = val;
      cell.border = border();
      cell.font = { size: 9 };
      cell.alignment = align === "center" ? center() : left();

      if (ci === 2) cell.fill = fill(C.ONLINE);
      else if (ci === 3) cell.fill = fill(C.OFFLINE);
      else if (ci === 4) cell.fill = fill(C.FINANCE);
      else if (ci === 8 && w.milestone) {
        cell.fill = fill(C.MILESTONE);
        cell.font = { bold: true, size: 9 };
      }
    });
    ws.getRow(row).height = 54;
  });

  // 합계 행
  const totalRow = weeks.length + 3;
  const totalJobs = weeks.reduce((s, w) => s + w.jobs, 0);
  const totalRev = totalJobs * 20;
  const totals = ["합계", "-", "-", "-", "-", `${totalJobs}건`, "-", `${totalRev.toLocaleString()}만원`, `Q${qNum} 완료`];
  totals.forEach((v, ci) => data(ws, totalRow, ci + 1, v, C.GOLD, { bold: true, align: "center", size: 10 }));
  ws.getRow(totalRow).height = 22;

  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// ─── 주차별 내용 데이터 ──────────────────────────────────────────────────────

const Q1 = [
  { jobs: 0, online: "· 인스타그램 계정 개설·프로필 완성\n· 네이버 스마트플레이스 등록\n· dkansim.com 랜딩페이지 점검", offline: "· 명함 300장 제작 주문\n· 아파트 관리사무소 홍보 허가 문의\n· 서비스 구역 지도 작성", finance: "· 사업자등록증·통장 확인\n· 초기 비용 예산 확정 (광고비 10만)", milestone: "🚀 사업 준비 완료" },
  { jobs: 1, online: "· 인스타 첫 게시물 (서비스 소개)\n· 카카오톡 채널 개설\n· 네이버 블로그 첫 포스팅", offline: "· 아파트 엘리베이터 광고 부착 (2개 단지)\n· 관리사무소 브로셔 배포", finance: "· 첫 예약 시스템 테스트·결제 연동 확인 (Toss)\n· 첫 매출 기장", milestone: "🎉 공식 오픈" },
  { jobs: 1, online: "· 첫 시공 후기 인스타 포스팅\n· 블로그 '아파트 누전차단기 교체' 키워드 글", offline: "· 첫 현장 방문 완료 (누전 점검)\n· 현장 사진 촬영 및 후기 수집", finance: "· 재료비 영수증 정리\n· 세금계산서 발행 확인", milestone: "🔧 첫 현장 완료" },
  { jobs: 1, online: "· 인스타 릴스 제작 (30초 시공 영상)\n· 네이버 카페 지역 커뮤니티 홍보", offline: "· 2단지 추가 브로셔 배포\n· 입주민 카카오톡 단체방 홍보", finance: "· 주간 수입·지출 정리\n· 재료비 공급업체 단가 협상", milestone: "" },
  { jobs: 2, online: "· 인스타 팔로워 100명 목표\n· 블로그 '콘센트 교체 셀프 위험' 포스팅\n· 유튜브 쇼츠 1편 제작·업로드", offline: "· 현장 2건 완료\n· 완료 고객 5점 후기 요청", finance: "· 첫 달 수입 정산 (부가세 별도)\n· 광고비 효과 검토", milestone: "📊 1개월 결산" },
  { jobs: 2, online: "· dkansim.com 앱 출시 일정 확정\n· 앱스토어 등록 준비 자료 제출\n· 인스타 스토리 광고 첫 집행 (5만원)", offline: "· 현장 2건 완료\n· 아파트 주민센터 게시판 홍보", finance: "· 앱 출시 관련 비용 예산 확보\n· 수도광열비·통신비 사업용 구분", milestone: "📱 앱 출시 준비" },
  { jobs: 2, online: "· 유튜브 쇼츠 2편 업로드\n· 앱 베타 테스트 (지인 10명)\n· 블로그 SEO 키워드 3개 추가", offline: "· 현장 2건 완료\n· 고객 재방문 의사 확인", finance: "· 세금계산서 발행 절차 확인\n· 산재보험 가입 여부 검토", milestone: "" },
  { jobs: 2, online: "· 앱 정식 출시 (iOS·Android)\n· 앱 출시 인스타 홍보 이벤트\n· 앱 예약 유도 (10% 할인쿠폰 발급)", offline: "· 현장 2건 완료\n· 앱 설치 QR코드 현장 배포", finance: "· 앱 유지관리 월 비용 책정\n· Q1 중간 매출 점검", milestone: "📱 앱 정식 출시" },
  { jobs: 2, online: "· 앱 다운로드 50건 목표\n· 유튜브 쇼츠 3편\n· 카카오 채널 구독자 100명 목표", offline: "· 현장 2건 완료\n· 특허 홍보 문구 삽입 시작", finance: "· 종합소득세 예납 확인\n· 부가세 신고 준비 (1기)", milestone: "⚖️ 부가세 1기 준비" },
  { jobs: 2, online: "· 블로그 월 방문자 500명 목표\n· 인스타 광고 타겟팅 최적화\n· 유튜브 쇼츠 4편", offline: "· 현장 2건 완료\n· 아파트 단지 3곳 추가 홍보", finance: "· 재료 소모품 재고 정리\n· 월간 원가율 계산", milestone: "" },
  { jobs: 3, online: "· 인스타 팔로워 200명 목표\n· 후기 게시물 3개 업로드\n· 앱 리뷰 이벤트 진행", offline: "· 현장 3건 완료\n· 재방문 고객 1명 확보", finance: "· Q1 손익 분석 초안 작성\n· Q2 광고 예산 계획", milestone: "" },
  { jobs: 3, online: "· 유튜브 쇼츠 5편 (누적)\n· 블로그 키워드 10개 등록\n· 카카오채널 자동응답 세팅", offline: "· 현장 3건 완료\n· 우수 고객 재방문 리워드 설계", finance: "· 결제 정산 Supabase 대조\n· 다음 분기 단가 검토", milestone: "" },
  { jobs: 4, online: "· Q1 성과 인스타 홍보 포스팅\n· Q2 예고 이벤트 게시\n· 앱 업데이트 1.1 배포", offline: "· 현장 4건으로 Q1 목표 달성\n· Q2 단지 추가 홍보 계획", finance: "· Q1 최종 매출·비용 정산\n· Q2 예산안 확정", milestone: "🏁 Q1 마감·성과 점검" },
];

const Q2 = [
  { jobs: 3, online: "· 유튜브 쇼츠 6·7편 업로드\n· 인스타 광고 월 10만원 집행\n· 앱 MAU 100명 목표", offline: "· 신규 단지 5곳 브로셔 배포\n· 관리소장 미팅 2곳", finance: "· Q2 예산 집행 시작\n· 재료비 대량구매 협상", milestone: "🚀 Q2 스타트" },
  { jobs: 3, online: "· 블로그 방문자 1,000명/월 목표\n· 유튜브 쇼츠 8편\n· 카카오채널 구독자 200명", offline: "· 현장 3건 완료\n· 추석 사전 예약 홍보 시작", finance: "· 주간 손익계산서 루틴화\n· 세금계산서 발행 2건", milestone: "" },
  { jobs: 4, online: "· 추석 전 SNS 집중 홍보\n· 유튜브 쇼츠 9·10편\n· 인스타 팔로워 400명 목표", offline: "· 추석 전 4건 완료\n· 입주민 대상 안전점검 이벤트", finance: "· 부가세 1기 최종 신고\n· 9월 매출 100만원 돌파", milestone: "🎑 추석 시즌 홍보" },
  { jobs: 4, online: "· 추석 연휴 중 쇼츠 예약 게시\n· 앱 푸시알림 기능 테스트\n· 고객 만족도 설문 발송", offline: "· 추석 연휴 후 현장 4건\n· 단지 게시판 계절 점검 안내문", finance: "· 추석 연휴 지출 정산\n· 9월 수입 마감", milestone: "" },
  { jobs: 4, online: "· 유튜브 쇼츠 11·12편\n· 앱 MAU 150명 목표\n· 인스타 릴스 '겨울 전기 점검' 예고", offline: "· 현장 4건 완료\n· 재방문 고객 5명 누적", finance: "· 월간 원가율 35% 이하 유지\n· 광고비 ROI 점검", milestone: "📊 2개월 누적 점검" },
  { jobs: 4, online: "· 블로그 상위 노출 키워드 분석\n· 유튜브 쇼츠 13편\n· 네이버 플레이스 리뷰 20개 목표", offline: "· 현장 4건 완료\n· 아파트 단지 10곳 누적 홍보", finance: "· 세금계산서 발행 루틴 정착\n· 순이익률 계산", milestone: "" },
  { jobs: 4, online: "· 유튜브 쇼츠 14·15편\n· 인스타 스토리 설문 (서비스 수요)\n· 앱 로그인 사용자 200명", offline: "· 현장 4건 (누적 40건 달성)\n· 10월 성수기 예약 선점", finance: "· 10월 매출 목표 300만원\n· 재료 재고 점검", milestone: "🔔 누적 40건 달성" },
  { jobs: 4, online: "· 쇼츠 16편 (겨울 전기 안전 시리즈)\n· 블로그 주 2회 포스팅 루틴\n· 카카오채널 구독자 350명", offline: "· 현장 4건 완료\n· 재방문 고객 재예약 3건", finance: "· Q2 중간 손익 결산\n· 연말정산 서류 준비 시작", milestone: "" },
  { jobs: 4, online: "· 쇼츠 17편\n· 인스타 팔로워 600명 목표\n· 앱 신규 기능 (AS 예약) 기획", offline: "· 현장 4건 완료\n· 단지 관리소장 정기 미팅 2곳", finance: "· 부가세 2기 준비\n· 광고비 예산 월 15만원으로 증액", milestone: "" },
  { jobs: 4, online: "· 쇼츠 18·19편 (동절기 시리즈)\n· 블로그 월 방문자 2,000명\n· 네이버 리뷰 30개 목표", offline: "· 현장 4건 완료\n· 신규 단지 7곳 추가 홍보", finance: "· 11월 매출 목표 350만원\n· 연간 소득세 추정 계산", milestone: "📊 3개월 누적 점검" },
  { jobs: 4, online: "· 쇼츠 20편 달성 이벤트\n· 인스타 팔로워 700명\n· 앱 MAU 200명 목표", offline: "· 현장 4건 완료\n· 겨울 안전점검 패키지 홍보 시작", finance: "· 부가세 2기 신고 준비 완료\n· Q2 손익 초안 작성", milestone: "🎬 유튜브 쇼츠 20편 달성" },
  { jobs: 4, online: "· Q2 성과 콘텐츠 제작\n· 쇼츠 Q3 시리즈 기획\n· 앱 겨울 이벤트 배너 업데이트", offline: "· 현장 4건 (월 예약 30건 달성)\n· Q3 사전 예약 받기 시작", finance: "· 부가세 2기 신고 완료\n· 연말 세금 납부 준비", milestone: "✅ 월 예약 30건 달성" },
  { jobs: 3, online: "· Q2 마감 인스타 성과 공유\n· Q3 예고 게시물\n· 앱 업데이트 1.2 (AS 기능)", offline: "· 현장 3건 완료\n· Q3 홍보 전략 수립", finance: "· Q2 최종 매출 정산\n· 연간 세금 납부 일정 확정", milestone: "🏁 Q2 마감 · 월 예약 30건" },
];

const Q3 = [
  { jobs: 5, online: "· 겨울 전기 안전 시리즈 쇼츠 21·22편\n· 블로그 '동절기 누전차단기 점검' 집중\n· 앱 동절기 프로모션 배너", offline: "· 정기관리 패키지 (연 2회) 첫 계약\n· 아파트 단지 15곳 홍보", finance: "· 정기관리 패키지 단가 책정 (35만원)\n· Q3 예산 확정", milestone: "🎁 정기관리 패키지 출시" },
  { jobs: 5, online: "· 인스타 팔로워 900명\n· 쇼츠 23편\n· 앱 정기점검 예약 기능 배포", offline: "· 현장 5건 완료\n· 정기관리 패키지 홍보 집중", finance: "· 연말 소득세 신고 준비\n· 정기관리 수입 별도 관리", milestone: "" },
  { jobs: 5, online: "· 크리스마스 이벤트 인스타 (선착순 할인)\n· 쇼츠 24·25편\n· 앱 알림 오픈 안내", offline: "· 연말 5건 현장 완료\n· 정기계약 고객 3명 달성", finance: "· 12월 매출 목표 400만원\n· 연간 소득세 가산세 주의 확인", milestone: "🎄 연말 집중 홍보" },
  { jobs: 6, online: "· 신년 이벤트 사전 예고 게시\n· 블로그 '2026년 전기 안전 총정리'\n· 앱 신년 알림 발송", offline: "· 연초 예약 4건 사전 확정\n· 2개 단지 정기계약 추가", finance: "· 연간 종합소득세 추정 완료\n· 1년 손익 회고 초안", milestone: "🎊 새해 맞이 이벤트" },
  { jobs: 6, online: "· 신년 쇼츠 26편 (2027 안전 계획)\n· 인스타 팔로워 1,000명 목표\n· 앱 MAU 300명 목표", offline: "· 현장 6건 완료\n· 신규 단지 20곳 누적 홍보", finance: "· 종합소득세 예정신고 납부\n· 월 순이익 목표 200만원", milestone: "🎯 팔로워 1,000명" },
  { jobs: 6, online: "· 쇼츠 27·28편\n· 블로그 월 방문자 3,000명\n· 네이버 리뷰 40개 목표", offline: "· 현장 6건 완료\n· 재방문율 25% 달성 여부 점검", finance: "· 월간 원가율 32% 이하 목표\n· 광고비 월 20만원 집행", milestone: "" },
  { jobs: 6, online: "· 인스타 릴스 '전기 셀프점검 5가지'\n· 쇼츠 29편\n· 앱 신기능 (AS 이력 조회) 배포", offline: "· 현장 6건 완료\n· 정기관리 고객 5명 누적", finance: "· 정기관리 연매출 비중 10% 목표\n· 재료 대량구매 협상 2차", milestone: "" },
  { jobs: 6, online: "· 쇼츠 30편 기념 이벤트\n· 인스타 팔로워 1,200명\n· 앱 MAU 350명", offline: "· 현장 6건 완료\n· 단지 관리소장 5곳 정기 미팅", finance: "· 월 매출 500만원 목표\n· Q3 중간 손익 점검", milestone: "🎬 쇼츠 30편 달성" },
  { jobs: 6, online: "· 블로그 방문자 월 3,500명\n· 쇼츠 31·32편\n· 앱 리뷰 이벤트 2차", offline: "· 현장 6건 완료\n· 재방문율 30% 달성 확인", finance: "· 부가세 1기 2027 준비\n· KIBO 창업지원 사전 검토", milestone: "✅ 재방문율 30%" },
  { jobs: 6, online: "· 쇼츠 33편\n· 후기 이벤트 (50번째 후기 선물)\n· 앱 친구 추천 기능 기획", offline: "· 현장 6건 완료\n· 고객 후기 50건 수집 캠페인", finance: "· KIBO 신청 서류 준비 시작\n· 2년차 예산 초안 작성", milestone: "⭐ 누적 후기 50건 목표" },
  { jobs: 6, online: "· 인스타 팔로워 1,500명\n· 쇼츠 34·35편\n· 앱 MAU 400명", offline: "· 현장 6건 완료\n· 파트너 기사 후보 리스트 작성", finance: "· 파트너 기사 단가 모델 설계\n· 법인 전환 요건 사전 검토", milestone: "👥 파트너 기사 검토 시작" },
  { jobs: 6, online: "· 쇼츠 36편\n· Q3 성과 콘텐츠 제작\n· 앱 친구 추천 기능 배포", offline: "· 현장 6건 완료\n· 단지 정기관리 계약 7곳 누적", finance: "· Q3 손익 초안\n· 2년차 전환 비용 예산 확인", milestone: "" },
  { jobs: 5, online: "· Q3 마감 성과 공유\n· Q4 예고 게시물\n· 앱 업데이트 1.3", offline: "· 현장 5건 완료\n· Q4 홍보 전략 수립", finance: "· Q3 최종 정산\n· 파트너 기사 계약 조건 초안", milestone: "🏁 Q3 마감 · 후기 50건" },
];

const Q4 = [
  { jobs: 7, online: "· 봄 시즌 전기 안전 시리즈 시작\n· 쇼츠 37·38편\n· 인스타 팔로워 1,800명 목표", offline: "· 파트너 기사 1명 계약 체결\n· 봄 이사철 예약 집중 홍보", finance: "· KIBO 창업지원 신청 완료\n· 파트너 기사 수수료 구조 확정", milestone: "🤝 파트너 기사 1호 계약" },
  { jobs: 7, online: "· 쇼츠 39·40편\n· 앱 MAU 500명 목표\n· 블로그 월 방문자 4,000명", offline: "· 파트너 기사 첫 현장 (2인 체계)\n· 이사철 물량 집중 처리", finance: "· 부가세 1기 2027 신고\n· 파트너 기사 주간 정산 루틴", milestone: "⚖️ 부가세 1기 2027 신고" },
  { jobs: 7, online: "· 쇼츠 41편\n· 인스타 릴스 '파트너 기사 소개'\n· 앱 2인 배정 기능 기획", offline: "· 2인 체계 현장 7건 완료\n· 신규 단지 25곳 누적 홍보", finance: "· 월 매출 700만원 목표\n· KIBO 진행 현황 확인", milestone: "" },
  { jobs: 8, online: "· 쇼츠 42·43편\n· 앱 2인 배정 기능 배포\n· 인스타 팔로워 2,000명 목표", offline: "· 현장 8건 (2인 체계 정착)\n· 아파트 단지 30곳 누적 홍보", finance: "· 월 순이익 목표 400만원\n· 법인 전환 시뮬레이션", milestone: "🎯 팔로워 2,000명" },
  { jobs: 8, online: "· 쇼츠 44편\n· 블로그 SEO 최적화 2차\n· 앱 MAU 600명", offline: "· 현장 8건 완료\n· 재방문율 35% 목표", finance: "· 2년차 비용 구조 분석\n· 파트너 기사 추가 1명 검토", milestone: "" },
  { jobs: 8, online: "· 쇼츠 45·46편\n· 인스타 팔로워 2,200명\n· 앱 친구추천 MAU 기여 분석", offline: "· 현장 8건 완료\n· 정기관리 계약 10곳 누적 목표", finance: "· 정기관리 연매출 비중 15%\n· 광고비 월 25만원 집행", milestone: "✅ 정기관리 10곳" },
  { jobs: 8, online: "· 쇼츠 47편\n· 블로그 월 방문자 5,000명\n· 앱 업데이트 1.4 (정기관리 자동알림)", offline: "· 현장 8건 완료\n· 4월 황금연휴 예약 선점", finance: "· Q4 중간 손익 점검\n· 연매출 4,000만원 달성 확인", milestone: "📊 연매출 4,000만원 점검" },
  { jobs: 8, online: "· 쇼츠 48·49편\n· 인스타 팔로워 2,500명\n· 앱 MAU 700명 목표", offline: "· 황금연휴 현장 8건 완료\n· 연휴 후 집중 예약 처리", finance: "· 파트너 기사 2호 계약 완료\n· 3인 체계 원가율 분석", milestone: "🤝 파트너 기사 2호 계약" },
  { jobs: 8, online: "· 쇼츠 50편 기념 이벤트\n· 1년차 성과 콘텐츠 제작\n· 앱 사용자 리뷰 이벤트 3차", offline: "· 현장 8건 완료\n· 월 예약 40건 달성 여부 점검", finance: "· 종합소득세 신고 완료\n· 2년차 사업계획서 초안", milestone: "🎬 쇼츠 50편 달성" },
  { jobs: 8, online: "· 2년차 예고 콘텐츠 시리즈\n· 인스타 팔로워 2,800명\n· 앱 MAU 800명", offline: "· 현장 8건 (월 예약 40건 달성)\n· 단지 35곳 누적 홍보", finance: "· KIBO 지원금 수령 확인\n· 법인 전환 서류 준비", milestone: "✅ 월 예약 40건 달성" },
  { jobs: 8, online: "· 쇼츠 51·52편\n· 블로그 방문자 월 6,000명\n· 앱 2년차 로드맵 공개", offline: "· 현장 8건 완료\n· 파트너 기사 3인 체계 완성", finance: "· 법인 설립 견적 확인\n· 2년차 예산 최종 확정", milestone: "🏢 법인 전환 준비" },
  { jobs: 7, online: "· 1년 회고 인스타 포스팅\n· 쇼츠 53편 (1년 하이라이트)\n· 앱 1주년 이벤트 기획", offline: "· 현장 7건 완료\n· 정기관리 고객 감사 연락", finance: "· 1년차 최종 손익계산서\n· 세금 납부 일정 최종 확인", milestone: "" },
  { jobs: 6, online: "· 1년차 성과 공식 발표\n· 2년차 목표 공개 이벤트\n· 앱 2.0 베타 예고", offline: "· 최종 현장 6건 완료\n· 2년차 파트너 기사 체계 완성", finance: "· 1년차 전체 정산 완료\n· 법인 설립 신청", milestone: "🎊 1년차 완주 · 2년차 도약" },
];

// ─── 워크북 생성 및 저장 ──────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = "대경이엔피";
wb.created = new Date();

buildSummary(wb);
buildQuarterSheet(wb, "Q1 (2026.06~08)", "2026-06-07", 500, 1, Q1);
buildQuarterSheet(wb, "Q2 (2026.09~11)", "2026-09-06", 1000, 2, Q2);
buildQuarterSheet(wb, "Q3 (2026.12~2027.02)", "2026-12-06", 1500, 3, Q3);
buildQuarterSheet(wb, "Q4 (2027.03~05)", "2027-03-07", 2000, 4, Q4);

// 저장: /mnt/user-data/outputs/ 우선, 실패 시 프로젝트 루트
const tryPaths = [
  "/mnt/user-data/outputs/대경이엔피_1년차_실행계획.xlsx",
  path.join(process.cwd(), "outputs", "대경이엔피_1년차_실행계획.xlsx"),
];

let saved = false;
for (const p of tryPaths) {
  try {
    await mkdir(path.dirname(p), { recursive: true });
    await wb.xlsx.writeFile(p);
    console.log(`✅ 저장 완료: ${p}`);
    saved = true;
    break;
  } catch (e) {
    console.warn(`저장 실패 (${p}):`, e.message);
  }
}
if (!saved) {
  console.error("❌ 모든 경로에서 저장 실패");
  process.exit(1);
}
