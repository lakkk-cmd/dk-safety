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
    riskFactors: ["감전", "합선", "화재"],
    label: "누전차단기 미설치 또는 동작불량, 열화 및 손상",
    simpleInspectable: false,
    requiresManualCheck: true,
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
 * 절연저항 실측값으로 절연(누전) 2항목을 자동 판정한다 — 워커가 버튼을 누르지 않아도 되는
 * 유일한 자동판정 케이스(2026-08 확정). 부하전류/누설전류(IGR)가 담당하는 항목은 아직
 * 기준값이 확정되지 않아 별도 자동판정 없이 수동 확인 대상으로 남아있다.
 *
 * 기준값(thresholdMohm)은 전역 상수가 아니라 단지별로 관리자가 직접 입력한 값이다 —
 * 「전기설비 검사 및 점검의 방법·절차 등에 관한 고시」 별표3의 절연저항 기준은 세대 누전차단기
 * "회로 하나"를 기준으로 만들어졌는데, 총괄분전반처럼 여러 회로를 한번에 재면 병렬합성저항
 * (1/R총 = 1/R1+...+1/Rn)이라 항상 더 낮게 나온다. 단지마다 세대당 회로 개수가 다르므로
 * "정상"으로 볼 기준값도 단지마다 달라야 한다(2026-08 실사용 피드백, apartments 102 참고).
 * threshold가 아직 설정 안 된 단지는 자동판정을 하지 않고 해당없음("/")으로 남긴다 —
 * 잘못된 전역 기준값을 몰래 대신 쓰는 것보다 "판정 보류"가 안전하다.
 */
export function autoJudgeInsulationItem(insulationResistance: number | null, thresholdMohm: number | null): ChecklistResult {
  if (typeof insulationResistance !== "number" || !Number.isFinite(insulationResistance)) return "/";
  if (typeof thresholdMohm !== "number" || !Number.isFinite(thresholdMohm)) return "/";
  return insulationResistance < thresholdMohm ? "X" : "O";
}

/**
 * 워커가 입력한 항목별 결과(id+result+note)를 서버 신뢰 템플릿에 병합한다. category/riskFactors/
 * item 텍스트는 항상 CHECKLIST_ITEMS 기준으로 재구성해 클라이언트 위·변조를 막는다. requiresManualCheck
 * 가 false인 항목(현재 절연 2항목)은 클라이언트가 뭘 보내든 무시하고 실측값으로 서버가 다시 판정한다.
 */
export function applyChecklistResults(
  inspectionType: "visit" | "unvisited_simple",
  overrides: { id: ChecklistItemId; result: ChecklistResult; note: string }[],
  measurements: { insulationResistance: number | null; insulationResistanceThresholdMohm: number | null }
): ChecklistEntry[] {
  const template = buildChecklistTemplate(inspectionType);
  const overrideMap = new Map(overrides.map((o) => [o.id, o]));
  return template.map((entry) => {
    const def = getChecklistItemDef(entry.id);
    if (!def) return entry;
    const isNotApplicable = inspectionType === "unvisited_simple" && !def.simpleInspectable;
    if (isNotApplicable) return entry; // 미방문 간이점검의 비실측 항목은 덮어쓸 수 없음 — 항상 N/A
    if (!def.requiresManualCheck) {
      const result = autoJudgeInsulationItem(measurements.insulationResistance, measurements.insulationResistanceThresholdMohm);
      const note = measurements.insulationResistanceThresholdMohm === null ? "단지 기준값 미설정 — 관리자 설정 필요" : "실측값 기준 자동판정";
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
 * 체크리스트의 부적합(X) 항목을 별표3 규칙표와 대조해 자동 안전진단을 산출한다. 절연 2항목은
 * applyChecklistResults가 이미 단지별 기준값으로 O/X를 확정해 넘겨주므로, 여기서는 그 결과가
 * X인 경우만 그대로 안내하면 된다 — 별도 임계치 로직이 필요 없다. 부하전류/누설전류(IGR)는
 * 분기회로 정격용량 대비 판정이 필요해(현장마다 다름) 고정 임계값을 두지 않고 실측값만
 * 기록한다 — 과부하 최종 판단은 전기선임자가 현장 정격을 보고 내린다.
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
        entry.note === "실측값 기준 자동판정"
          ? "실측 절연저항이 이 단지의 기준값에 못 미칩니다. 누전·감전 위험이 있어 조속한 정밀점검이 필요합니다."
          : entry.note ||
            `${def.category} 항목이 부적합으로 확인되었습니다. ${
              def.actionTypes.includes("개선") ? "조속한 개선(수리)이 필요합니다." : "세대에 통지가 필요합니다."
            }`
    });
  }

  return findings;
}
