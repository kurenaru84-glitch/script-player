"use client";

import { useEffect, useMemo, useState } from "react";
import type { BilingualCue } from "@/lib/subtitle/types";
import {
  buildShuffledTokens,
  normalizeDictationAnswer,
  primaryToDictationWords,
  type DictationToken,
} from "@/lib/dictation/dictationWords";

type Props = {
  cue: BilingualCue;
  cueKey: number;
  variant?: "compact" | "fullscreen";
  onSolved?: () => void;
  onSkip?: () => void;
};

export function DictationPanel({
  cue,
  cueKey,
  variant = "compact",
  onSolved,
  onSkip,
}: Props) {
  const fullscreen = variant === "fullscreen";
  const targetWords = useMemo(
    () => primaryToDictationWords(cue.primary),
    [cue.primary],
  );
  const targetAnswer = useMemo(
    () => normalizeDictationAnswer(cue.primary),
    [cue.primary],
  );

  const [pool, setPool] = useState<DictationToken[]>([]);
  const [picked, setPicked] = useState<DictationToken[]>([]);
  const [result, setResult] = useState<"idle" | "ok" | "ng">("idle");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setPool(buildShuffledTokens(targetWords, cueKey * 9973 + cue.index));
    setPicked([]);
    setResult("idle");
    setRevealed(false);
  }, [cueKey, cue.index, targetWords]);

  if (targetWords.length === 0) {
    return (
      <div className="space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          この行はディクテ対象外（歌詞・効果音のみ）
        </p>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-sky-600 underline"
          >
            次のセリフへ
          </button>
        )}
      </div>
    );
  }

  const pick = (token: DictationToken) => {
    setResult("idle");
    setPicked((p) => [...p, token]);
    setPool((p) => p.filter((t) => t.id !== token.id));
  };

  const unpickLast = () => {
    setResult("idle");
    setPicked((p) => {
      const last = p[p.length - 1];
      if (!last) return p;
      setPool((poolNow) => [...poolNow, last]);
      return p.slice(0, -1);
    });
  };

  const check = () => {
    const attempt = normalizeDictationAnswer(picked.map((t) => t.word).join(" "));
    if (attempt === targetAnswer) {
      setResult("ok");
      onSolved?.();
    } else {
      setResult("ng");
    }
  };

  const chipClass = fullscreen
    ? "rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md active:scale-95"
    : "rounded-full bg-sky-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm active:scale-95";

  return (
    <div
      className={
        fullscreen
          ? "flex flex-col gap-4"
          : "space-y-2 rounded-lg border border-sky-200 bg-sky-50/80 p-2 dark:border-sky-900 dark:bg-sky-950/40"
      }
    >
      {!fullscreen && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
            Dictation · #{cue.index}
          </p>
          <span className="text-[10px] text-zinc-500">単語を順にタップ</span>
        </div>
      )}

      <div
        className={
          fullscreen
            ? "min-h-[3rem] rounded-xl border border-dashed border-sky-300 bg-white px-3 py-2 dark:border-sky-800 dark:bg-zinc-900"
            : "min-h-[2.25rem] rounded-lg border border-dashed border-sky-300 bg-white/90 px-2 py-1.5 dark:border-sky-800 dark:bg-zinc-950"
        }
      >
        {picked.length === 0 ? (
          <span className="text-sm text-zinc-400">ここに並べる</span>
        ) : (
          <p className="text-base font-medium leading-relaxed text-zinc-900 dark:text-zinc-100">
            {picked.map((t) => t.word).join(" ")}
          </p>
        )}
      </div>

      <div
        className={
          fullscreen
            ? "flex min-h-[8rem] flex-wrap content-center justify-center gap-2 py-2"
            : "flex min-h-[2.5rem] flex-wrap justify-center gap-1.5"
        }
      >
        {pool.map((t) => (
          <button
            key={`${cueKey}-${t.id}-${t.word}`}
            type="button"
            onClick={() => pick(t)}
            className={chipClass}
          >
            {t.word}
          </button>
        ))}
      </div>

      <div className={`flex flex-wrap gap-2 ${fullscreen ? "justify-center" : ""}`}>
        <button
          type="button"
          onClick={check}
          disabled={picked.length === 0}
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          答え合わせ
        </button>
        <button
          type="button"
          onClick={unpickLast}
          disabled={picked.length === 0}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          1つ戻す
        </button>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          答えを見る
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
          >
            スキップ
          </button>
        )}
      </div>

      {result === "ok" && (
        <p className="text-center text-base font-semibold text-emerald-600">正解！</p>
      )}
      {result === "ng" && (
        <p className="text-center text-sm text-amber-700 dark:text-amber-300">
          違います。もう一度並べ替えてみてください。
        </p>
      )}
      {(revealed || result === "ok") && (
        <div className="rounded-xl bg-white p-3 text-sm shadow-sm dark:bg-zinc-900">
          <p className="font-medium text-zinc-800 dark:text-zinc-100">{cue.primary}</p>
          {cue.translation && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{cue.translation}</p>
          )}
        </div>
      )}
    </div>
  );
}
