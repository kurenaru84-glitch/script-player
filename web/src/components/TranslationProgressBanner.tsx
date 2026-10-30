"use client";

import { useEffect, useState } from "react";
import {
  cancelTranslationJob,
  kickTranslationJobNow,
  startTranslationJob,
  subscribeAllTranslationProgress,
  type TranslationProgressSnapshot,
} from "@/lib/translation/translationJobRunner";

export function TranslationProgressBanner() {
  const [snapshots, setSnapshots] = useState<TranslationProgressSnapshot[]>([]);

  useEffect(() => subscribeAllTranslationProgress(setSnapshots), []);

  const active = snapshots.filter(
    (s) =>
      s.status === "running" ||
      s.status === "error" ||
      (s.errorMessage?.includes("待機") ?? false),
  );

  if (active.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col gap-1 px-2">
      {active.map((s) => {
        const pct =
          s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
        const waiting = Boolean(
          s.errorMessage?.match(/待機|混雑|再試行|自動再試行|再開しています/i),
        );
        const isError = s.status === "error";
        return (
          <div
            key={s.mediaId}
            className={`pointer-events-auto mx-auto w-full max-w-lg rounded-xl border px-3 py-2 shadow-lg backdrop-blur ${
              isError
                ? "border-amber-400 bg-amber-50/95 dark:bg-amber-950/90"
                : waiting
                  ? "border-violet-300 bg-violet-50/95 dark:bg-violet-950/90"
                  : "border-violet-400 bg-violet-100/95 dark:bg-violet-950/90"
            }`}
          >
            <div className="flex items-center gap-2">
              {!isError && (
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-violet-600"
                  aria-hidden
                />
              )}
              <p className="min-w-0 flex-1 text-xs font-semibold text-violet-950 dark:text-violet-100">
                {isError
                  ? "AI翻訳が一時停止しました"
                  : waiting
                    ? s.errorMessage?.includes("API混雑")
                      ? "AI翻訳 · API混雑 · 待機中"
                      : "AI翻訳 · 待機・再試行中"
                    : "AI翻訳を実行中"}
                {s.total > 0 && (
                  <span className="ml-1 font-normal text-violet-800 dark:text-violet-200">
                    {pct}%（{s.done}/{s.total} 行）
                  </span>
                )}
              </p>
              {isError ? (
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-amber-600 px-2 py-1 text-[10px] font-medium text-white"
                  onClick={() => void startTranslationJob(s.mediaId)}
                >
                  続行
                </button>
              ) : (
                <span className="flex shrink-0 gap-2">
                  {waiting && (
                    <button
                      type="button"
                      className="rounded-lg bg-violet-700 px-2 py-1 text-[10px] font-medium text-white"
                      onClick={() => void kickTranslationJobNow(s.mediaId)}
                    >
                      今すぐ
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-[10px] text-violet-700 underline dark:text-violet-300"
                    onClick={() => void cancelTranslationJob(s.mediaId)}
                  >
                    停止
                  </button>
                </span>
              )}
            </div>
            {!isError && s.total > 0 && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-200 dark:bg-violet-900">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    waiting ? "bg-amber-500" : "bg-violet-600"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {s.errorMessage && (
              <p className="mt-1 line-clamp-2 text-[10px] text-zinc-600 dark:text-zinc-400">
                {s.errorMessage}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
