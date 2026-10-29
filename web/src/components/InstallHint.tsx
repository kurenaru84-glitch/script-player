"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "script-player-install-hint-dismiss";

/** スマホブラウザで初回だけ「ホーム画面に追加」の案内（PWA） */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator &&
          (navigator as Navigator & { standalone?: boolean }).standalone);
      if (standalone) return;
      const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (mobile) setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!show) return null;

  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
      <p className="font-medium">アプリのように使う</p>
      <p className="mt-1 text-xs leading-relaxed">
        {isIos
          ? "Safari の「共有」→「ホーム画面に追加」"
          : "Chrome メニュー →「アプリをインストール」または「ホーム画面に追加」"}
      </p>
      <button
        type="button"
        className="mt-2 text-xs text-sky-700 underline dark:text-sky-300"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
      >
        閉じる
      </button>
    </div>
  );
}
