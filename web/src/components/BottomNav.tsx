"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getLastMediaId } from "@/lib/lastMediaId";

const tabs = [
  { href: "/my-list", label: "My List", match: (p: string) => p === "/my-list" || p.startsWith("/player/") },
  { href: "/dictation", label: "Dictation", match: (p: string) => p.startsWith("/dictation") },
  { href: "/local", label: "Local", match: (p: string) => p === "/local" || p.startsWith("/local/") },
  { href: "/vocabulary", label: "Words", match: (p: string) => p === "/vocabulary" || p.startsWith("/vocabulary/") },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const [dictationHref, setDictationHref] = useState("/dictation");

  useEffect(() => {
    const id = getLastMediaId();
    setDictationHref(id ? `/dictation/${id}` : "/dictation");
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((tab) => {
          const href = tab.label === "Dictation" ? dictationHref : tab.href;
          const active = tab.match(pathname);
          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={href}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center text-[11px] font-medium transition-colors touch-manipulation ${
                  active
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
