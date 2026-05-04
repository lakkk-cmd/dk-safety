/**
 * 접수 시 입력한 동·호를 입금 안내(예금주 표기 등)에 쓰는 한 줄 문자열로 만듭니다.
 */
export function formatResidentDongHoDepositHolder(dong: string, ho: string): string {
  const d = String(dong ?? "")
    .trim()
    .replaceAll(/[^0-9]/g, "");
  const h = String(ho ?? "")
    .trim()
    .replaceAll(/[^0-9]/g, "");
  if (!d && !h) return "";
  return `${d}동 ${h}호`;
}
