"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelGrammarJob,
  installGrammarGlobalResume,
  kickGrammarJobNow,
  resumeGrammarJobIfNeeded,
  startGrammarJob,
  subscribeGrammarProgress,
  type GrammarProgress,
} from "@/lib/grammar/grammarJobRunner";

type Props = {
  mediaId: string;
  onComplete?: () => void;
  variant?: "compact" | "panel";
  className?: string;
};

export function GenerateGrammarButton({
  mediaId,
  onComplete,
  variant = "compact",
  className,
}: Props) {
  const [progress, setProgress] = useState<GrammarProgress | null>(null);
  const [starting, setStarting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    installGrammarGlobalResume();
    void resumeGrammarJobIfNeeded(mediaId);
    const staleCheck = setInterval(() => {
      void resumeGrammarJobIfNeeded(mediaId);
    }, 60_000);
    const unsub = subscribeGrammarProgress(mediaId, (p) => {
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
        await kickGrammarJobNow(mediaId);
        setHint("再開を送りました");
        return;
      }
      await startGrammarJob(mediaId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "開始できませんでした";
      setHint(msg);
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
      ? Math.round((progress.done / progress.total) * 100)
      : null;

  const label =
    progress?.status === "done"
      ? "文法✓"
      : active && pct != null
        ? `${pct}%`
        : "AI文法";

  const title =
    progress?.status === "done"
      ? "文法解説は生成済み（各行メモで編集）"
      : active
        ? progress?.errorMessage ?? "文法解説を生成中…"
        : "全セリフの文法解説を AI で生成";

  if (variant === "panel") {
    return (
      <div className={className}>
        <button
          type="button"
          disabled={progress?.status === "done" || starting}
          onClick={() => void onPress()}
          className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
        >
          {label}
        </button>
        {progress && progress.status !== "done" && (
          <p className="mt-1 text-xs text-zinc-500">
            {progress.done}/{progress.total} {progress.errorMessage ?? ""}
          </p>
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
          className={`relative flex h-8 shrink-0 items-center justify-center rounded-lg px-2 text-[11px] font-semibold ${
            progress?.status === "done"
              ? "bg-emerald-600/90 text-white"
              : active
                ? "bg-amber-500 text-white"
                : "border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          } disabled:opacity-70`}
        >
          {label}
        </button>
        {active && (
          <button
            type="button"
            title="一時停止"
            className="text-[10px] text-zinc-400 underline"
            onClick={() => void cancelGrammarJob(mediaId)}
          >
            ⏸
          </button>
        )}
      </div>
      {hint && (
        <p className="max-w-[14rem] text-right text-[9px] leading-tight text-amber-800 dark:text-amber-200">
          {hint}
        </p>
      )}
    </div>
  );
}
