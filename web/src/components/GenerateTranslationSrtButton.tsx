"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelTranslationJob,
  resumeTranslationJobIfNeeded,
  startTranslationJob,
  subscribeTranslationProgress,
  type TranslationProgress,
} from "@/lib/translation/translationJobRunner";

type Props = {
  mediaId: string;
  onComplete?: () => void;
  variant?: "compact" | "panel";
  className?: string;
};

export function GenerateTranslationSrtButton({
  mediaId,
  onComplete,
  variant = "compact",
  className,
}: Props) {
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void resumeTranslationJobIfNeeded(mediaId);
    return subscribeTranslationProgress(mediaId, (p) => {
      setProgress(p);
      if (p.status === "done") onComplete?.();
    });
  }, [mediaId, onComplete]);

  const run = useCallback(async () => {
    setStarting(true);
    try {
      await startTranslationJob(mediaId);
    } catch (e) {
      setProgress({
        done: 0,
        total: 0,
        status: "error",
        errorMessage: e instanceof Error ? e.message : "開始できませんでした",
      });
    } finally {
      setStarting(false);
    }
  }, [mediaId]);

  const busy =
    starting || progress?.status === "running" || Boolean(progress?.errorMessage?.includes("待機中"));

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : null;

  const label = (() => {
    if (starting) return "…";
    if (progress?.status === "done") return "訳✓";
    if (busy && pct != null) return `${pct}%`;
    if (progress?.status === "error") return "訳!";
    return "AI訳";
  })();

  const title = (() => {
    if (progress?.status === "done") return "翻訳 SRT 完成";
    if (progress?.status === "running" && progress.total > 0) {
      return `翻訳中 ${progress.done}/${progress.total}${progress.errorMessage ? ` — ${progress.errorMessage}` : ""}`;
    }
    if (progress?.status === "error") return progress.errorMessage ?? "エラー";
    return "メイン字幕から翻訳 SRT を AI 作成（タップで開始・途中保存・自動再試行）";
  })();

  if (variant === "panel") {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || progress?.status === "done"}
            onClick={() => void run()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? `翻訳中… ${pct ?? 0}%` : "AI で翻訳 SRT を作成"}
          </button>
          {busy && (
            <button
              type="button"
              className="text-xs text-zinc-500 underline"
              onClick={() => void cancelTranslationJob(mediaId)}
            >
              一時停止
            </button>
          )}
          {progress?.status === "error" && (
            <button
              type="button"
              className="text-xs text-violet-600 underline"
              onClick={() => void run()}
            >
              再開
            </button>
          )}
        </div>
        {progress && progress.status !== "done" && (
          <p className="mt-1 text-xs text-zinc-500">{title}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`relative flex items-center gap-1 ${className ?? ""}`}>
      <button
        type="button"
        title={title}
        disabled={busy && progress?.status !== "error"}
        onClick={() => {
          if (progress?.status === "error") void run();
          else if (progress?.status === "done") return;
          else void run();
        }}
        className={`relative flex h-8 min-w-[2.75rem] items-center justify-center rounded-lg px-2 text-[11px] font-semibold transition-colors ${
          progress?.status === "done"
            ? "bg-emerald-600/90 text-white"
            : progress?.status === "error"
              ? "bg-amber-500 text-white"
              : busy
                ? "bg-violet-500 text-white"
                : "border border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100"
        } disabled:opacity-70`}
      >
        {label}
        {busy && pct != null && (
          <span
            className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-violet-300/80 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950"
            style={{ opacity: 0.35 + (pct / 100) * 0.65 }}
            aria-hidden
          />
        )}
      </button>
      {busy && (
        <button
          type="button"
          title="一時停止"
          className="text-[10px] text-zinc-400 underline"
          onClick={() => void cancelTranslationJob(mediaId)}
        >
          ⏸
        </button>
      )}
    </div>
  );
}
