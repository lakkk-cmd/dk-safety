"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, HomeIcon } from "@/components/ui/icons";

type Props = {
  homeHref?: string;
  homeLabel?: string;
};

export default function PageNavButtons({ homeHref = "/home", homeLabel = "홈으로" }: Props) {
  const router = useRouter();

  return (
    <div className="mb-4 flex items-center gap-2">
      <button type="button" onClick={() => router.back()} className="btn-outline px-3 py-2 text-sm">
        <span className="inline-flex items-center gap-1">
          <ArrowLeftIcon className="h-4 w-4" />
          뒤로가기
        </span>
      </button>
      <Link href={homeHref} className="btn-outline px-3 py-2 text-sm">
        <span className="inline-flex items-center gap-1">
          <HomeIcon className="h-4 w-4" />
          {homeLabel}
        </span>
      </Link>
    </div>
  );
}
