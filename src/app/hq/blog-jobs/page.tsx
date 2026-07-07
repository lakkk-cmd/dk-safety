import type { Metadata } from "next";
import BlogJobsClient from "@/components/hq/blog-jobs-client";

export const metadata: Metadata = {
  title: "블로그 발행 패키지 | AI 사령부",
};

export const dynamic = "force-dynamic";

// dk-blog-factory 발행 패키지 화면 — 워커가 만든 원고/보정사진/썸네일을 대장이 받아
// 네이버 에디터에 직접 붙여넣어 발행한다. 자동 발행 기능은 네이버 정책 위반이라 없다.
export default function HqBlogJobsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-1 text-xl font-extrabold text-cc-navy">✍️ 블로그 발행 패키지</h1>
      <p className="mb-6 text-sm text-gray-500">
        원고를 단락별로 복사해 네이버 에디터에 붙여넣고, [사진N] 마커 위치에 zip으로 받은 사진을 넣으세요.
        발행 후 URL을 기록하면 완료됩니다 (약 2~3분).
      </p>
      <BlogJobsClient />
    </div>
  );
}
