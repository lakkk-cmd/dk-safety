/** high=3, caution=2, unknown=1, safe=0 — 15문항 이론상 최대 45점(원점수). */
export const DIAGNOSIS_RAW_MAX = 45;

/** 0~100 위험지수 기준 고위험 하한. */
export const DIAGNOSIS_HIGH_RISK_MIN = 75;

/** 0~100 위험지수 기준 주의 하한. */
export const DIAGNOSIS_CAUTION_MIN = 45;

export type DiagnosisAnswerValue = "high" | "caution" | "unknown" | "safe";

export type DiagnosisScoreFields = {
  riskScore: number;
  scoreVersion?: 1 | 2 | 3;
};

export function answerToRiskPoints(answer: DiagnosisAnswerValue): number {
  if (answer === "high") return 3;
  if (answer === "caution") return 2;
  if (answer === "unknown") return 1;
  return 0;
}

export function computeRawRiskPoints(answers: { answer: DiagnosisAnswerValue }[]): number {
  return answers.reduce((acc, item) => {
    return acc + answerToRiskPoints(item.answer);
  }, 0);
}

export function rawPointsToScore100(raw: number): number {
  if (raw <= 0) return 0;
  return Math.min(100, Math.round((raw / DIAGNOSIS_RAW_MAX) * 100));
}

/** DB에 저장된 값을 항상 0~100 위험지수로 환산. v1은 riskScore에 원점수(0~30)가 들어 있음. */
export function diagnosisRiskScoreOn100(record: DiagnosisScoreFields): number {
  if (record.scoreVersion === 2 || record.scoreVersion === 3) {
    return Math.min(100, Math.max(0, Math.round(record.riskScore)));
  }
  return rawPointsToScore100(record.riskScore);
}

export function summaryFromScore100(score100: number): string {
  if (score100 >= DIAGNOSIS_HIGH_RISK_MIN) {
    return [
      "응답을 종합해 보면, 전기 안전 측면에서 우려되는 신호가 다소 많게 나타났습니다.",
      "감전·과열·화재로 이어질 수 있는 상황일 수 있어, 가능한 한 빨리 긴급 출동이나 전문 점검을 검토해 주시길 권해 드립니다. 불안하시면 먼저 전화 상담으로 현장 여부를 결정하셔도 됩니다."
    ].join("\n\n");
  }
  if (score100 >= DIAGNOSIS_CAUTION_MIN) {
    return [
      "지금 당장 큰 위험이 있다고 단정하기는 어렵지만, 응답만으로도 콘센트·차단기·누전 가능 영역은 평소보다 조금 더 살펴보실 만합니다.",
      "전문가 점검으로 가능성을 확인하거나, 우선 상담으로 우선순위를 정해 보셔도 좋습니다."
    ].join("\n\n");
  }
  return [
    "현재 응답만으로는 특별히 크게 걱정할 만한 패턴은 두드러지지 않습니다.",
    "입주 연차·계절·가전 교체 등에 따라 상태는 달라질 수 있으니, 가벼운 자가 점검 습관과 함께 주기적인 전문 점검을 이어 가시면 좋습니다."
  ].join("\n\n");
}

export function scoreToneClass(score100: number): string {
  if (score100 >= DIAGNOSIS_HIGH_RISK_MIN) return "bg-rose-600";
  if (score100 >= DIAGNOSIS_CAUTION_MIN) return "bg-amber-500";
  return "bg-emerald-600";
}
