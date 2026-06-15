import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { getBlogPostBySlug, incrementBlogPostViewCount } from "@/lib/blog-store";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isAgentSupabaseReady()) return {};
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug).catch(() => null);
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
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug).catch(() => null);
  if (!post) notFound();

  void incrementBlogPostViewCount(slug).catch(() => {});

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:px-6">
      <Link href="/blog" className="text-sm text-slate-500 hover:underline">
        ← 블로그 목록
      </Link>

      <article className="mt-4">
        <h1 className="text-2xl font-black tracking-[-0.02em] text-slate-900 md:text-3xl">{post.title}</h1>
        {post.published_at && (
          <p className="mt-2 text-xs text-slate-400">{new Date(post.published_at).toLocaleDateString("ko-KR")}</p>
        )}
        <div className="mt-6 space-y-3 text-sm md:text-base">{renderMarkdown(post.content)}</div>
      </article>

      <div className="warranty-band mt-10 rounded-2xl p-6 text-center">
        <p className="text-base font-bold text-slate-900">전기 점검이 필요하신가요?</p>
        <p className="mt-1 text-sm text-slate-600">
          우리집 전기주치의(대경이엔피)가 광주 아파트 전기 점검·수리를 도와드립니다.
        </p>
        <Link
          href="/reservation"
          className="mt-4 inline-flex items-center justify-center rounded-full bg-[var(--dk-blue)] px-6 py-3 text-sm font-bold text-white shadow-lg"
        >
          지금 예약하기
        </Link>
      </div>
    </main>
  );
}
