import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const ALLOWED_EXACT_HOSTS = new Set(["dkansim.com", "www.dkansim.com"]);
const ALLOWED_HOST_SUFFIX = ".dkansim.com";

/**
 * 카카오 "나에게 보내기" 메모의 "자세히 보기" 링크가 항상 등록된 도메인(dkansim.com)으로만
 * 열리는 문제 우회용 — 카카오 개발자 콘솔에 어떤 도메인이 등록돼 있든, hq/report/contents
 * 같은 서브도메인이나 외부 도메인으로 보낸 링크는 카카오가 무시하고 기본 홈으로 대체해버리는
 * 현상이 실기기 테스트(구글 링크조차 홈으로 대체됨)로 확인됨(2026-09-07). dkansim.com(등록된
 * 도메인) 자체는 정상적으로 열리므로, 이 페이지를 경유해서 실제 목적지로 다시 리다이렉트한다.
 */
export default async function GoRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  let target = "https://dkansim.com/home";

  if (next) {
    try {
      const url = new URL(next);
      const hostAllowed = ALLOWED_EXACT_HOSTS.has(url.hostname) || url.hostname.endsWith(ALLOWED_HOST_SUFFIX);
      if (url.protocol === "https:" && hostAllowed) {
        target = next;
      }
    } catch {
      // 잘못된 URL이면 기본 홈으로
    }
  }

  redirect(target);
}
