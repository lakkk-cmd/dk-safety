/**
 * 공동주택 세대내 전기설비 점검기록표(직무고시 별지 15호) 12항목 정의 +
 * 「전기설비 검사 및 점검의 방법·절차 등에 관한 고시」 별표3(정기점검 부적합 전기설비
 * 처리방법) 규칙엔진.
 *
 * LLM이 아니라 고정 규칙표로 근거법령을 인용한다 — 환각 위험 없이 별표3 조항을 그대로 붙일 수
 * 있다. confidence:"best_fit"인 항목은 별지15호 확인사항 문구와 별표3 세부조항 문구가 완전히
 * 일치하지 않아 가장 가까운 조항으로 매핑한 것이므로, PDF/화면에 인용할 때 과신하지 않는다.
 */

export type ChecklistResult = "O" | "X" | "/" | "N/A";

export type ChecklistItemId =
  | "insulation_main_branch"
  | "insulation_equipment"
  | "wiring_meter_inlet"
  | "wiring_aging"
  | "wiring_breaker_capacity"
  | "elb_missing_or_faulty"
  | "elb_bathroom_outlet"
  | "dedicated_breaker_3kw"
  | "switchgear_damage"
  | "grounding_panel_resistance"
  | "grounding_equipment"
  | "grounding_indoor_wire";

export type ChecklistItemDef = {
  id: ChecklistItemId;
  category: string; // 부적합 설비
  riskFactors: string[]; // 위험요인
  label: string; // 확인 사항
  /** 세대미방문 간이점검(EPS실)에서도 실측 가능한 3항목만 true — 나머지 9개는 서식에 N/A로 채운다 */
  simpleInspectable: boolean;
  /**
   * true면 워커가 현장에서 직접 ○/×를 눌러야만 다음 단계로 진행 가능(육안·수기 확인 필요).
   * false는 실측값(현재는 절연저항만)으로 자동 판정되어 버튼 없이 통과 — autoJudgeInsulationItem 참고.
   * 부하전류·누설전류(IGR)가 어떤 항목을 자동 판정하는지는 아직 확정되지 않아 전부 true로 둔다.
   */
  requiresManualCheck: boolean;
  regulation: string; // 별표3 근거규정
  actionTypes: ("통지" | "구두" | "개선")[];
  confidence: "exact" | "best_fit";
};

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    id: "insulation_main_branch",
    category: "절연(누전)",
    riskFactors: ["감전", "화재", "전력손실"],
    label: "주회로 및 각 분기회로 절연저항 기준치 미만",
    simpleInspectable: true,
    requiresManualCheck: false,
    regulation: "별표3-1-가 (전기설비기술기준 5,27,52 / KEC 131,132)",
    actionTypes: ["통지"],
    confidence: "exact"
  },
  {
    id: "insulation_equipment",
    category: "절연(누전)",
    riskFactors: ["감전", "화재", "전력손실"],
    label: "전기기계기구의 절연저항 기준치 미만",
    simpleInspectable: true,
    requiresManualCheck: false,
    regulation: "별표3-1-다 (전기설비기술기준 5,27,52 / KEC 131,132)",
    actionTypes: ["통지"],
    confidence: "exact"
  },
  {
    id: "wiring_meter_inlet",
    category: "배선(규격미달 불량전선)",
    riskFactors: ["감전", "합선", "화재"],
    label: "세대용 계량기 인입선 접촉불량 및 탄화·손상",
    simpleInspectable: true,
    requiresManualCheck: true,
    regulation: "별표3-2 인입구배선 및 옥내배선 관련 조항 (전기설비기술기준 39 / KEC 221.1.2)",
    actionTypes: ["구두", "개선"],
    confidence: "best_fit"
  },
  {
    id: "wiring_aging",
    category: "배선(규격미달 불량전선)",
    riskFactors: ["감전", "합선", "화재"],
    label: "전선 노후화, 열화 및 피복 손상이 심한 경우",
    simpleInspectable: false,
    requiresManualCheck: true,
    regulation: "별표3-2-사-2) (전기설비기술기준 50,51)",
    actionTypes: ["통지"],
    confidence: "exact"
  },
  {
    id: "wiring_breaker_capacity",
    category: "배선(규격미달 불량전선)",
    riskFactors: ["감전", "합선", "화재"],
    label: "전선보호용 개폐기, 차단기 용량 과다",
    simpleInspectable: false,
    requiresManualCheck: true,
    regulation: "별표3-4-마-2) 개폐기, 차단기 및 퓨즈 용량과다",
    actionTypes: ["구두", "개선"],
    confidence: "exact"
  },
  {
    id: "elb_missing_or_faulty",
    category: "배선기구(기구파손 불량기구)",
    riskFactors: ["감전", "합선", "화재", "전력손실"],
    label: "누전차단기 미설치 또는 동작불량, 열화 및 손상",
    simpleInspectable: false,
    // 누설전류(IGR) 실측값으로 자동판정(2026-08 확정) — autoJudgeLeakageItem 참고.
    requiresManualCheck: false,
    regulation: "별표3-3-가·라 누전차단기(ELB) 점검 (KEC 234.10 외, 권장 수명연한 제조일로부터 15년)",
    actionTypes: ["구두", "개선"],
    confidence: "exact"
  },
  {
    id: "elb_bathroom_outlet",
    category: "배선기구(기구파손 불량기구)",
    riskFactors: ["감전", "합선", "화재"],
    label: "욕실 등에 시설하는 콘센트회로에 인체 감전보호용 누전차단기 미설치",
    simpleInspectable: false,
    requiresManualCheck: true,
    regulation: "별표3-3-가-6) (2004.1.1. 이후 기준)",
    actionTypes: ["통지"],
    confidence: "exact"
  },
  {
    id: "dedicated_breaker_3kw",
    category: "배선기구(기구파손 불량기구)",
    riskFactors: ["감전", "합선", "화재"],
    label: "소비전력 3kW 이상 전기기계기구에 전용개폐기 미시설",
    simpleInspectable: false,
    requiresManualCheck: true,
    regulation: "별표3-4-다-1) (KEC 231.6)",
    actionTypes: ["통지", "개선"],
    confidence: "exact"
  },
  {
    id: "switchgear_damage",
    category: "배선기구(기구파손 불량기구)",
    riskFactors: ["감전", "합선", "화재"],
    label: "개폐기, 차단기, 배선기구, 접속기, 콘센트 등의 손상",
    simpleInspectable: false,
    requiresManualCheck: true,
    regulation: "별표3-2-사-3) (KEC 123)",
    actionTypes: ["구두"],
    confidence: "exact"
  },
  {
    id: "grounding_panel_resistance",
    category: "접지(미접지 기준치미달)",
    riskFactors: ["감전"],
    label: "금속제 분전반 접지저항 기준치 초과",
    simpleInspectable: false,
    requiresManualCheck: true,
    regulation: "별표3-5-가-1) (전기설비기술기준 6)",
    actionTypes: ["통지"],
    confidence: "exact"
  },
  {
    id: "grounding_equipment",
    category: "접지(미접지 기준치미달)",
    riskFactors: ["감전"],
    label: "전기기계기구(에어컨, 세탁기 등) 접지 미시설",
    simpleInspectable: false,
    requiresManualCheck: true,
    regulation: "별표3-5-가-2)-가) 가정용 (KEC 142.7)",
    actionTypes: ["구두"],
    confidence: "exact"
  },
  {
    id: "grounding_indoor_wire",
    category: "접지(미접지 기준치미달)",
    riskFactors: ["감전"],
    label: "옥내 전로에 접지선 미설치",
    simpleInspectable: false,
    requiresManualCheck: true,
    regulation: "별표3-5-가-3) 옥내전로 접지극 콘센트·접지시설 관련 (KEC 234.5)",
    actionTypes: ["통지"],
    confidence: "best_fit"
  }
];

export const SIMPLE_INSPECTION_ITEM_IDS: ChecklistItemId[] = CHECKLIST_ITEMS.filter((i) => i.simpleInspectable).map(
  (i) => i.id
);

/** 워커가 현장에서 직접 ○/×를 눌러야 하는 항목 — 화면의 필수입력 검사가 이 목록을 기준으로 다음 단계 진행을 막는다 */
export const MANUAL_CHECK_ITEM_IDS: ChecklistItemId[] = CHECKLIST_ITEMS.filter((i) => i.requiresManualCheck).map(
  (i) => i.id
);

export function getChecklistItemDef(id: ChecklistItemId): ChecklistItemDef | undefined {
  return CHECKLIST_ITEMS.find((d) => d.id === id);
}

export type ChecklistEntry = {
  id: ChecklistItemId;
  category: string;
  riskFactors: string[];
  item: string;
  result: ChecklistResult;
  note: string;
};

/** 점검유형에 맞는 12항목 초기 템플릿 — 미방문 간이점검은 실측 불가 9항목을 N/A로 채운다 */
export function buildChecklistTemplate(inspectionType: "visit" | "unvisited_simple"): ChecklistEntry[] {
  return CHECKLIST_ITEMS.map((def) => {
    const isNotApplicable = inspectionType === "unvisited_simple" && !def.simpleInspectable;
    return {
      id: def.id,
      category: def.category,
      riskFactors: def.riskFactors,
      item: def.label,
      result: isNotApplicable ? "N/A" : "/",
      note: isNotApplicable ? "해당없음" : ""
    };
  });
}

/**
 * 절연저항/누설전류(IGR) 실측값으로 3개 항목(절연 2개 + 누전차단기 미설치·동작불량)을 자동
 * 판정한다 — 워커가 버튼을 누르지 않아도 되는 케이스(2026-08 확정).
 *
 * 별표3의 절연저항/누설전류 기준은 세대 누전차단기 "회로 하나"를 기준으로 만들어졌는데,
 * 분전함처럼 여러 회로를 한번에 재면 절연저항은 병렬합성저항(1/R총 = 1/R1+...+1/Rn)이라
 * 항상 더 낮게, 누설전류는 여러 회로분이 합산되어 더 높게 나온다. 예전엔 이걸 단지마다
 * 관리자가 수동으로 입력한 기준값으로 보정했지만(102/103), 전기과장이 단지별 기준값을
 * 잘못 기억/오인지할 위험이 있어 2026-08-28부로 폐기했다. 대신 절연저항 0.22MΩ·누설전류
 * 1mA를 전국 공통 고정기준으로 삼고, 세대마다 다른 분전함 회로수(circuitBreakerCount,
 * 점검 시점에 전기과장이 직접 입력)를 곱하거나 나눠서 그 세대에 맞는 임계값을 매번 계산한다
 * — 사람이 기준값을 따로 기억할 필요가 없다. 회로수가 입력되지 않은 건(레거시 데이터 등)은
 * 계산 자체가 불가능하므로 해당없음("/")으로 남긴다.
 *
 * 다만 elb_missing_or_faulty는 "미설치 또는 동작불량"을 하나로 묶은 항목이라, IGR로는
 * "동작불량"만 검증 가능하고 "미설치"(차단기 자체가 없는 경우)는 실측만으로 못 잡는다 —
 * 회로에 ELB가 아예 없어도 누설전류 자체는 낮게 측정될 수 있다. 현장에서 육안으로 미설치를
 * 확인하는 절차가 별도로 필요하다는 걸 감안해야 한다.
 */
export const BASE_INSULATION_RESISTANCE_THRESHOLD_MOHM = 0.22;
export const BASE_LEAKAGE_CURRENT_THRESHOLD_MA = 1;

/** 세대 회로수 기준 실제 판정 임계값 — 절연저항은 병렬합성저항이라 회로수만큼 나누고, 누설전류는 회로분이 합산되므로 곱한다. */
export function computeInsulationResistanceThreshold(circuitBreakerCount: number | null): number | null {
  if (typeof circuitBreakerCount !== "number" || !Number.isFinite(circuitBreakerCount) || circuitBreakerCount < 1) return null;
  return BASE_INSULATION_RESISTANCE_THRESHOLD_MOHM / circuitBreakerCount;
}

export function computeLeakageCurrentThreshold(circuitBreakerCount: number | null): number | null {
  if (typeof circuitBreakerCount !== "number" || !Number.isFinite(circuitBreakerCount) || circuitBreakerCount < 1) return null;
  return BASE_LEAKAGE_CURRENT_THRESHOLD_MA * circuitBreakerCount;
}

export function autoJudgeInsulationItem(insulationResistance: number | null, thresholdMohm: number | null): ChecklistResult {
  if (typeof insulationResistance !== "number" || !Number.isFinite(insulationResistance)) return "/";
  if (typeof thresholdMohm !== "number" || !Number.isFinite(thresholdMohm)) return "/";
  return insulationResistance < thresholdMohm ? "X" : "O";
}

/** 누설전류는 절연저항과 반대 방향 — 기준값보다 "높으면" 부적합이다. */
export function autoJudgeLeakageItem(igr: number | null, thresholdMa: number | null): ChecklistResult {
  if (typeof igr !== "number" || !Number.isFinite(igr)) return "/";
  if (typeof thresholdMa !== "number" || !Number.isFinite(thresholdMa)) return "/";
  return igr > thresholdMa ? "X" : "O";
}

type AutoJudgeMeasurements = {
  insulationResistance: number | null;
  igr: number | null;
  circuitBreakerCount: number | null;
};

function autoJudge(id: ChecklistItemId, m: AutoJudgeMeasurements): { result: ChecklistResult; note: string } {
  if (id === "insulation_main_branch" || id === "insulation_equipment") {
    const threshold = computeInsulationResistanceThreshold(m.circuitBreakerCount);
    const result = autoJudgeInsulationItem(m.insulationResistance, threshold);
    const note =
      threshold === null
        ? "회로수 미입력 — 판정 보류"
        : `실측값(절연저항 ${m.insulationResistance}MΩ, 회로수 ${m.circuitBreakerCount}개 기준 임계값 ${threshold.toFixed(3)}MΩ) 기준 AI판정`;
    return { result, note };
  }
  if (id === "elb_missing_or_faulty") {
    const threshold = computeLeakageCurrentThreshold(m.circuitBreakerCount);
    const result = autoJudgeLeakageItem(m.igr, threshold);
    const note =
      threshold === null
        ? "회로수 미입력 — 판정 보류"
        : `실측값(누설전류 ${m.igr}mA, 회로수 ${m.circuitBreakerCount}개 기준 임계값 ${threshold}mA) 기준 AI판정`;
    return { result, note };
  }
  return { result: "/", note: "" };
}

/**
 * 워커가 입력한 항목별 결과(id+result+note)를 서버 신뢰 템플릿에 병합한다. category/riskFactors/
 * item 텍스트는 항상 CHECKLIST_ITEMS 기준으로 재구성해 클라이언트 위·변조를 막는다. requiresManualCheck
 * 가 false인 항목(절연 2개 + 누전차단기 미설치·동작불량)은 클라이언트가 뭘 보내든 무시하고
 * 실측값으로 서버가 다시 판정한다.
 */
export function applyChecklistResults(
  inspectionType: "visit" | "unvisited_simple",
  overrides: { id: ChecklistItemId; result: ChecklistResult; note: string }[],
  measurements: AutoJudgeMeasurements
): ChecklistEntry[] {
  const template = buildChecklistTemplate(inspectionType);
  const overrideMap = new Map(overrides.map((o) => [o.id, o]));
  return template.map((entry) => {
    const def = getChecklistItemDef(entry.id);
    if (!def) return entry;
    const isNotApplicable = inspectionType === "unvisited_simple" && !def.simpleInspectable;
    if (isNotApplicable) return entry; // 미방문 간이점검의 비실측 항목은 덮어쓸 수 없음 — 항상 N/A
    if (!def.requiresManualCheck) {
      const { result, note } = autoJudge(entry.id, measurements);
      return { ...entry, result, note };
    }
    const override = overrideMap.get(entry.id);
    if (!override) return entry;
    return { ...entry, result: override.result, note: override.note.trim() };
  });
}

export type DiagnosisEntry = {
  item: string;
  verdict: "부적합";
  regulation: string;
  actionTypes: string[];
  comment: string;
};

/**
 * 체크리스트의 부적합(X) 항목을 별표3 규칙표와 대조해 자동 안전진단을 산출한다. 자동판정
 * 항목(절연 2개 + ELB)은 applyChecklistResults가 이미 note에 실측값을 담아 넘겨주므로,
 * 그 note를 코멘트로 그대로 쓰면 된다. 부하전류는 분기회로 정격용량 대비 판정이 필요해
 * (현장마다 다름) 고정 임계값을 두지 않고 실측값만 기록한다 — 과부하 최종 판단은 전기선임자가
 * 현장 정격을 보고 내린다.
 */
export function diagnoseChecklist(checklist: ChecklistEntry[]): DiagnosisEntry[] {
  const findings: DiagnosisEntry[] = [];

  for (const entry of checklist) {
    if (entry.result !== "X") continue;
    const def = getChecklistItemDef(entry.id);
    if (!def) continue;
    findings.push({
      item: def.label,
      verdict: "부적합",
      regulation: def.regulation,
      actionTypes: def.actionTypes,
      comment:
        entry.note ||
        `${def.category} 항목이 부적합으로 확인되었습니다. ${
          def.actionTypes.includes("개선") ? "조속한 개선(수리)이 필요합니다." : "세대에 통지가 필요합니다."
        }`
    });
  }

  return findings;
}

export type CompanyAdvisoryEntry = {
  item: string;
  comment: string;
};

// 회사 자체 기준(대표님 결정, 2026-08) — 별표3은 콘센트·스위치 자체의 권장 수명연한을
// 명시하지 않는다(누전차단기·개폐기·차단기만 15년으로 명시). 법적 근거가 아니므로
// DiagnosisEntry(별표3 규칙엔진)와 절대 섞지 않고 CompanyAdvisoryEntry로 분리해 저장·표시한다.
const OUTLET_SERVICE_LIFE_YEARS = 10;
const SWITCH_SERVICE_LIFE_YEARS = 10;

/**
 * 콘센트/스위치 설치연도가 입력된 경우에만(선택값) 회사 자체 교체주기 기준으로 안내를
 * 산출한다. 연도 미입력이면 판단하지 않는다 — 모르는 값을 임의로 추정하지 않는다.
 */
export function checkCompanyServiceLifeAdvisories(
  measurements: { outletInstallYear: number | null; switchInstallYear: number | null },
  now: Date = new Date()
): CompanyAdvisoryEntry[] {
  const advisories: CompanyAdvisoryEntry[] = [];
  const currentYear = now.getFullYear();

  if (typeof measurements.outletInstallYear === "number" && Number.isFinite(measurements.outletInstallYear)) {
    const age = currentYear - measurements.outletInstallYear;
    if (age >= OUTLET_SERVICE_LIFE_YEARS) {
      advisories.push({
        item: "콘센트 교체 권장",
        comment: `설치 후 약 ${age}년 경과(권장 교체주기 ${OUTLET_SERVICE_LIFE_YEARS}년 초과) — 화재예방을 위한 우리집 전기주치의 권장 기준입니다.`
      });
    }
  }
  if (typeof measurements.switchInstallYear === "number" && Number.isFinite(measurements.switchInstallYear)) {
    const age = currentYear - measurements.switchInstallYear;
    if (age >= SWITCH_SERVICE_LIFE_YEARS) {
      advisories.push({
        item: "스위치 교체 권장",
        comment: `설치 후 약 ${age}년 경과(권장 교체주기 ${SWITCH_SERVICE_LIFE_YEARS}년 초과) — 화재예방을 위한 우리집 전기주치의 권장 기준입니다.`
      });
    }
  }
  return advisories;
}

/**
 * 2026-08-24 문구 정리(여러 차례에 걸쳐 진행됨 — "기준 자동판정"→"기준 AI판정", "법적 의무사항은
 * 아니며 ~ 자체 권장 기준입니다"→"~ 권장 기준입니다", "(회사 자체 권장 교체주기 N년 초과)"→
 * "(권장 교체주기 N년 초과)", "우리집 전기주치의 권장 기준입니다"→"화재예방을 위한 우리집
 * 전기주치의 권장 기준입니다") 이전에 이미 pdf_url이 발급된 건은 전기안전관리법 제24조 4년
 * 보존 요건에 따라 DB 트리거가 UPDATE 자체를 막아 원본 레코드를 고칠 수 없다(보증서와 동일한
 * 불변 아카이브 설계). 대신 원본은 그대로 두고, 새 문구를 적용한 "수정본" PDF를 별도 파일로만
 * 재발급할 때 쓰는 순수 문자열 치환 함수 — 실측값 재판정(autoJudge 재호출)이 아니라 이미
 * 저장된 결과(O/X/N/A)는 그대로 두고 문구만 고치는 것이므로, 그사이 단지 기준값이 바뀌었어도
 * 원래 판정이 달라지지 않는다. 문구 정리가 여러 라운드에 걸쳐 있었으므로, 원본이든 이전 라운드에
 * 이미 한 번 재발급된 텍스트든 어느 상태에서 시작해도 최종 문구로 수렴하도록 짰다(멱등).
 */
function fixLegacyWording(text: string): string {
  let t = text;
  t = t.replace(/기준 자동판정/g, "기준 AI판정");
  t = t.replace(/회사 자체 권장 교체주기/g, "권장 교체주기");
  // "법적 의무사항은 아니며 우리집 전기주치의 자체 권장 기준입니다"(원본) /
  // "우리집 전기주치의 권장 기준입니다"(1차 수정본) 둘 다 최종 문구로 수렴시킨다.
  t = t.replace(/(법적 의무사항은 아니며 )?우리집 전기주치의( 자체)? 권장 기준입니다\.?/g, "화재예방을 위한 우리집 전기주치의 권장 기준입니다.");
  t = t.replace(/(화재예방을 위한 )+/g, "화재예방을 위한 "); // 재실행 시 접두어 중복 방지
  return t;
}

export function reissueWithFixedWording(
  checklistItems: ChecklistEntry[],
  autoDiagnosis: DiagnosisEntry[],
  companyAdvisories: CompanyAdvisoryEntry[]
): { checklistItems: ChecklistEntry[]; autoDiagnosis: DiagnosisEntry[]; companyAdvisories: CompanyAdvisoryEntry[] } {
  return {
    checklistItems: checklistItems.map((c) => ({ ...c, note: fixLegacyWording(c.note) })),
    autoDiagnosis: autoDiagnosis.map((d) => ({ ...d, comment: fixLegacyWording(d.comment) })),
    companyAdvisories: companyAdvisories.map((a) => ({ ...a, comment: fixLegacyWording(a.comment) }))
  };
}
