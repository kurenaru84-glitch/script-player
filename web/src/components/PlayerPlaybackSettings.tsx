"use client";

import { useEffect, useRef, useState } from "react";

const SPEEDS = [0.8, 1.0, 1.25] as const;
const REPEAT_OPTIONS = [0, 1, 2, 3, 5, 10] as const;

export type PlaybackSettings = {
  speed: (typeof SPEEDS)[number];
  /** 0=オフ、N=同セリフをN回再生してから次へ */
  lineRepeatCount: number;
};

type Props = {
  value: PlaybackSettings;
  onChange: (next: PlaybackSettings) => void;
};

export function PlayerPlaybackSettings({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const repeatLabel =
    value.lineRepeatCount === 0
      ? "オフ"
      : `${value.lineRepeatCount}回`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
        aria-expanded={open}
      >
        再生設定
        <span className="ml-1 text-zinc-500">
          x{value.speed}
          {value.lineRepeatCount > 0 ? ` · 🔁${value.lineRepeatCount}` : ""}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            速度
          </p>
          <div className="mt-1 flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...value, speed: s })}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
                  value.speed === s
                    ? "bg-sky-600 text-white"
                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                x{s}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            セリフリピート
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
            同じ行を指定回数再生後、自動で次の行へ
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {REPEAT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ ...value, lineRepeatCount: n })}
                className={`rounded-lg py-1.5 text-xs font-medium ${
                  value.lineRepeatCount === n
                    ? "bg-sky-600 text-white"
                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                {n === 0 ? "オフ" : `${n}回`}
              </button>
            ))}
          </div>
          {value.lineRepeatCount > 0 && (
            <p className="mt-2 text-[10px] text-sky-700 dark:text-sky-300">
              現在: 各セリフ {repeatLabel} → 次へ
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { SPEEDS as PLAYER_SPEEDS };
