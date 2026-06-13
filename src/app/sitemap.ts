import type { MetadataRoute } from "next";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { listPublishedBlogPosts } from "@/lib/blog-store";

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.dkansim.com").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/reservation`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/blog`, changeFrequency: "daily", priority: 0.8 },
  ];

  if (!isAgentSupabaseReady()) return staticEntries;

  const posts = await listPublishedBlogPosts(200).catch(() => []);
  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.updated_at,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...postEntries];
}
