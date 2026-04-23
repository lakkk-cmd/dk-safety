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
    return "고위험: 빠른 점검이 필요합니다.";
  }
  if (score100 >= DIAGNOSIS_CAUTION_MIN) {
    return "주의: 전문가 점검을 권장합니다.";
  }
  return "양호: 현재 상태를 유지하고 정기 점검하세요.";
}

export function scoreToneClass(score100: number): string {
  if (score100 >= DIAGNOSIS_HIGH_RISK_MIN) return "bg-rose-600";
  if (score100 >= DIAGNOSIS_CAUTION_MIN) return "bg-amber-500";
  return "bg-emerald-600";
}
