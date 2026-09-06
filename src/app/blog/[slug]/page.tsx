import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { getBlogPostBySlug, incrementBlogPostViewCount } from "@/lib/blog-store";
import { renderMarkdown } from "@/lib/markdown";
import SiteFooter from "@/components/site-footer";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isAgentSupabaseReady()) return {};
  const { slug: rawSlug } = await params;
  const post = await getBlogPostBySlug(decodeURIComponent(rawSlug)).catch(() => null);
  if (!post) return {};

  const description = post.meta_description ?? post.excerpt ?? undefined;
  return {
    title: `${post.title} | 우리집 전기주치의(대경이엔피) 블로그`,
    description,
    keywords: post.keywords?.length ? post.keywords : undefined,
    openGraph: {
      title: post.title,
      description,
      type: "article",
      publishedTime: post.published_at ?? undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  if (!isAgentSupabaseReady()) notFound();
  // Next.js 15 App Router는 이 동적 세그먼트를 퍼센트 인코딩된 그대로 넘겨준다(자동 디코딩 안 됨) —
  // 한글 슬러그라 그대로 쓰면 DB의 실제 값과 바이트가 달라 매번 404. decodeURIComponent로 맞춘다.
  // 이미 디코딩된 문자열(퍼센트 기호 없음)이 들어와도 decodeURIComponent는 그대로 반환하므로 안전하다.
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const post = await getBlogPostBySlug(slug).catch(() => null);
  if (!post) notFound();

  void incrementBlogPostViewCount(slug).catch(() => {});

  const eyebrow = post.keywords?.[0] ?? "전기 안전 정보";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:px-6">
      <Link href="/blog" className="text-sm text-slate-500 hover:underline">
        ← 블로그 목록
      </Link>

      <div className="blog-cover mt-4">
        <p className="blog-cover-eyebrow">{eyebrow}</p>
        <h1 className="text-2xl font-black tracking-[-0.02em] md:text-3xl">{post.title}</h1>
        {post.published_at && (
          <p className="mt-2 text-xs text-white/60">{new Date(post.published_at).toLocaleDateString("ko-KR")}</p>
        )}
        <svg className="blog-motif" viewBox="0 0 150 130" fill="none" aria-hidden="true">
          <rect x="28" y="14" width="78" height="104" rx="8" fill="#16305A" />
          <rect x="46" y="8" width="70" height="98" rx="8" fill="#1A5CFF" transform="rotate(6 46 8)" />
          <g transform="translate(58,26)">
            <rect x="0" y="0" width="12" height="20" rx="3" fill="#EDF1F8" />
            <rect x="18" y="0" width="12" height="20" rx="3" fill="#EDF1F8" />
            <rect x="36" y="2" width="12" height="20" rx="3" fill="#F5A623" transform="rotate(18 42 12)" />
            <rect x="0" y="30" width="12" height="20" rx="3" fill="#EDF1F8" />
            <rect x="18" y="30" width="12" height="20" rx="3" fill="#EDF1F8" />
          </g>
        </svg>
      </div>

      <article className="blog-article mt-6">
        <div className="space-y-3 text-sm md:text-base">{renderMarkdown(post.content)}</div>
      </article>

      <div className="blog-cta-band mt-10">
        <div>
          <p className="text-sm font-bold">전기 점검이 필요하신가요?</p>
          <p className="mt-0.5 text-xs" style={{ color: "rgba(11,31,58,0.72)" }}>
            우리집 전기주치의(대경이엔피)가 광주 아파트 전기 점검·수리를 도와드립니다.
          </p>
        </div>
        <Link href="/reservation" className="cta-btn">
          지금 예약하기 →
        </Link>
      </div>

      <SiteFooter />
    </main>
  );
}
