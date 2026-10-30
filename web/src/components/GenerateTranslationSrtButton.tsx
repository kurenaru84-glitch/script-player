"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelTranslationJob,
  installTranslationGlobalResume,
  kickTranslationJobNow,
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
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    installTranslationGlobalResume();
    void resumeTranslationJobIfNeeded(mediaId);
    const staleCheck = setInterval(() => {
      void resumeTranslationJobIfNeeded(mediaId);
    }, 60_000);
    const unsub = subscribeTranslationProgress(mediaId, (p) => {
      setProgress(p);
      if (p.status === "done") onComplete?.();
    });
    return () => {
      clearInterval(staleCheck);
      unsub();
    };
  }, [mediaId, onComplete]);

  const onPress = useCallback(async () => {
    if (progress?.status === "done") return;
    setHint(null);
    setStarting(true);
    try {
      if (progress?.status === "running") {
        await kickTranslationJobNow(mediaId);
        setHint("再開を送りました");
        return;
      }
      if (progress?.status === "error") {
        await kickTranslationJobNow(mediaId);
        return;
      }
      await startTranslationJob(mediaId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "開始できませんでした";
      setHint(msg);
      setProgress((p) => ({
        done: p?.done ?? 0,
        total: p?.total ?? 0,
        status: "error",
        errorMessage: msg,
      }));
    } finally {
      setStarting(false);
    }
  }, [mediaId, progress?.status]);

  const active =
    starting ||
    progress?.status === "running" ||
    Boolean(progress?.errorMessage?.match(/待機|混雑|再試行|再開/i));

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : null;

  const label = (() => {
    if (starting) return "…";
    if (progress?.status === "done") return "訳✓";
    if (active && pct != null) return `${pct}%`;
    if (progress?.status === "error") return "訳!";
    return "AI訳";
  })();

  const title = (() => {
    if (hint) return hint;
    if (progress?.status === "done") return "翻訳 SRT 完成";
    if (progress?.status === "running" && progress.total > 0) {
      return `翻訳中 ${progress.done}/${progress.total}${progress.errorMessage ? ` — ${progress.errorMessage}` : ""}（タップで再開）`;
    }
    if (progress?.status === "error") return progress.errorMessage ?? "エラー";
    return "メイン字幕から翻訳 SRT を AI 作成（タップで開始・再タップで再開）";
  })();

  if (variant === "panel") {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={progress?.status === "done" || starting}
            onClick={() => void onPress()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {active ? `翻訳中… ${pct ?? 0}%` : "AI で翻訳 SRT を作成"}
          </button>
          {active && (
            <button
              type="button"
              className="text-xs text-zinc-500 underline"
              onClick={() => void cancelTranslationJob(mediaId)}
            >
              一時停止
            </button>
          )}
        </div>
        {(hint || (progress && progress.status !== "done")) && (
          <p className="mt-1 text-xs text-zinc-500">{title}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col items-end gap-0.5 ${className ?? ""}`}>
      <div className="relative flex items-center gap-1">
        <button
          type="button"
          title={title}
          disabled={progress?.status === "done" || starting}
          onClick={() => void onPress()}
          className={`relative flex h-8 min-w-[2.75rem] items-center justify-center rounded-lg px-2 text-[11px] font-semibold transition-colors ${
            progress?.status === "done"
              ? "bg-emerald-600/90 text-white"
              : progress?.status === "error"
                ? "bg-amber-500 text-white"
                : active
                  ? "bg-violet-500 text-white"
                  : "border border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100"
          } disabled:opacity-70`}
        >
          {label}
          {active && pct != null && (
            <span
              className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-violet-300/80 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950"
              style={{ opacity: 0.35 + (pct / 100) * 0.65 }}
              aria-hidden
            />
          )}
        </button>
        {active && (
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
      {hint && (
        <p className="max-w-[14rem] text-right text-[9px] leading-tight text-amber-700 dark:text-amber-300">
          {hint}
        </p>
      )}
    </div>
  );
}
