"use client";

import { useEffect, useState } from "react";

const SITES = [
  { id: "hq", label: "경영진", icon: "🏢", url: "https://hq.dkansim.com" },
  { id: "agent", label: "에이전트", icon: "🤖", url: "https://agent.dkansim.com" },
  { id: "report", label: "리포트", icon: "📊", url: "https://report.dkansim.com" },
  { id: "contents", label: "콘텐츠", icon: "📝", url: "https://contents.dkansim.com" },
  { id: "main", label: "고객 사이트", icon: "🌐", url: "https://dkansim.com" },
] as const;

export default function SubdomainNav() {
  const [currentHost, setCurrentHost] = useState("");

  useEffect(() => {
    setCurrentHost(window.location.hostname);
  }, []);

  return (
    <div className="border-t border-white/10 bg-black/25">
      <div className="mx-auto max-w-5xl overflow-x-auto px-2 md:px-4">
        <ul className="flex min-w-max items-center gap-0.5 py-1">
          {SITES.map((site) => {
            const host = new URL(site.url).hostname;
            const active = currentHost === host || (currentHost === "" && site.id === "hq");
            return (
              <li key={site.id}>
                {active ? (
                  <span className="flex items-center gap-1.5 rounded-md bg-cc-gold/20 px-3 py-1.5 text-xs font-black text-cc-gold">
                    <span aria-hidden="true">{site.icon}</span>
                    {site.label}
                  </span>
                ) : (
                  <a
                    href={site.url}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-white/55 transition hover:bg-white/10 hover:text-white"
                  >
                    <span aria-hidden="true">{site.icon}</span>
                    {site.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
