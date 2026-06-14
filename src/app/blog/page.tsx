import type { Metadata } from "next";
import Link from "next/link";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { listPublishedBlogPosts } from "@/lib/blog-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "전기 안전 정보 블로그 | 우리집 전기주치의(대경이엔피)",
  description: "광주 아파트 누전차단기, 콘센트, 분전반 점검과 수리에 관한 전기 안전 정보를 확인하세요.",
};

export default async function BlogIndexPage() {
  const posts = isAgentSupabaseReady() ? await listPublishedBlogPosts(50).catch(() => []) : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <header className="warranty-band rounded-[2rem] p-6 md:p-8">
        <p className="warranty-badge">전기 안전 정보</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">
          우리집 전기주치의(대경이엔피) 블로그
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-700">
          광주 아파트 전기 점검·수리에 관한 실용적인 정보를 전해드립니다.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500">아직 게시된 글이 없습니다.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {posts.map((post) => (
            <li key={post.id} className="surface-card p-5">
              <Link href={`/blog/${post.slug}`} className="block">
                <h2 className="text-lg font-bold text-slate-900">{post.title}</h2>
                {post.excerpt && <p className="mt-2 text-sm text-slate-600">{post.excerpt}</p>}
                {post.published_at && (
                  <p className="mt-3 text-xs text-slate-400">
                    {new Date(post.published_at).toLocaleDateString("ko-KR")}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 text-center">
        <Link
          href="/reservation"
          className="inline-flex items-center justify-center rounded-full bg-[var(--dk-blue)] px-6 py-3 text-sm font-bold text-white shadow-lg"
        >
          전기 점검 예약하기
        </Link>
      </div>
    </main>
  );
}
