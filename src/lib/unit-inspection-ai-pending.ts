/** AI 상세진단(2페이지) 사후보정이 끝나기 전인지 판별한다.
 *
 * 제출 후 백그라운드 생성이 25~45초 걸리고, 그 전까지 PDF 2페이지는 placeholder다.
 * 화면 안내는 이 창 안에서만 보여주고, 정정본이 생기면 즉시 끈다.
 * 브라우저 시계가 서버보다 늦으면 inspectedAt이 미래로 보이는데, 그 경우에도
 * "방금 제출"로 취급해야 자동 갱신이 시작된다. 너무 먼 미래(데이터 오류)는 제외한다.
 */
export const AI_DIAGNOSIS_PENDING_WINDOW_MS = 5 * 60 * 1000;
export const AI_DIAGNOSIS_POLL_INTERVAL_MS = 15 * 1000;

export function isAiDiagnosisPending(inspectedAt: string, hasCorrection: boolean, now = Date.now()): boolean {
  if (hasCorrection) return false;
  const inspectedMs = new Date(inspectedAt).getTime();
  if (!Number.isFinite(inspectedMs)) return false;
  const age = now - inspectedMs;
  return age > -AI_DIAGNOSIS_PENDING_WINDOW_MS && age < AI_DIAGNOSIS_PENDING_WINDOW_MS;
}
