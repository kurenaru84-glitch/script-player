"use client";

import { useEffect, useState } from "react";

export function MobileAccessHint() {
  const [lanUrl, setLanUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsPhone(/iPhone|iPad|Android/i.test(ua));

    fetch("/api/dev-url")
      .then((r) => r.json())
      .then((data: { enabled?: boolean; url?: string | null }) => {
        if (data.enabled && data.url) setLanUrl(data.url);
      })
      .catch(() => {});
  }, []);

  if (isPhone) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <p className="font-medium">スマホで利用中</p>
        <p className="mt-1 text-xs leading-relaxed opacity-90">
          Local Files から「ファイル」アプリ内の MP4 / SRT を選んでください。データはこの端末だけに保存されます。
        </p>
      </div>
    );
  }

  if (!lanUrl) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="font-medium">スマホで試す（同一 Wi‑Fi）</p>
      <p className="mt-1 break-all font-mono text-xs">{lanUrl}</p>
      <p className="mt-2 text-xs leading-relaxed opacity-90">
        Mac で <code className="rounded bg-black/5 px-1">npm run dev</code>{" "}
        実行中に、スマホのブラウザ（Chrome / Safari）で上の URL を開いてください。
        ホーム画面に追加する場合は Vercel（HTTPS）デプロイがおすすめです。
      </p>
      <button
        type="button"
        className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(lanUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? "コピーしました" : "URL をコピー"}
      </button>
    </div>
  );
}
