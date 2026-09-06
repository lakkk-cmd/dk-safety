import { headers } from "next/headers";

/** hq.dkansim.com에서는 미들웨어(middleware.ts)가 호스트 기반으로 "/"→"/hq"를 재작성해줘서
 *  루트 상대경로("/reservation" 등)가 그대로 맞지만, 그 재작성이 없는 환경(localhost 직접 접속,
 *  프리뷰 배포)에서는 "/hq" 접두사를 직접 붙여야 같은 링크가 올바르게 작동한다.
 *  서버 컴포넌트에서 hq 내부 페이지로 가는 Link href를 만들 때 이 접두사를 앞에 붙여 쓴다. */
export async function hqBasePath(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  return host.startsWith("hq.") ? "" : "/hq";
}
