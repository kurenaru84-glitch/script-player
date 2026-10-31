"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  cueIndex: number;
  primary: string;
  translation?: string;
  noteDraft: string;
  grammarDraft: string;
  onNoteChange: (value: string) => void;
  onGrammarChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export function CueNoteModal({
  open,
  cueIndex,
  primary,
  translation,
  noteDraft,
  grammarDraft,
  onNoteChange,
  onGrammarChange,
  onSave,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="閉じる"
        className="fixed inset-0 z-[210] bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={`メモ 行 ${cueIndex + 1}`}
        className="fixed inset-x-2 top-[max(0.75rem,env(safe-area-inset-top))] z-[211] flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2"
      >
        <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-500">#{cueIndex + 1}</p>
              <p className="mt-1 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                {primary}
              </p>
              {translation && (
                <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {translation}
                </p>
              )}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <label className="block">
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              文法解説（AI 生成・編集可）
            </span>
            <textarea
              value={grammarDraft}
              onChange={(e) => onGrammarChange(e.target.value)}
              rows={8}
              placeholder="「AI文法」で一括生成、またはここに直接入力…"
              className="mt-1.5 w-full min-h-[10rem] resize-y rounded-xl border border-amber-200/90 bg-amber-50/40 p-3 text-[15px] leading-relaxed text-zinc-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              自分のメモ
            </span>
            <textarea
              value={noteDraft}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={6}
              placeholder="単語・覚えたいフレーズ・感想…"
              className="mt-1.5 w-full min-h-[8rem] resize-y rounded-xl border border-emerald-200/90 bg-white p-3 text-[15px] leading-relaxed dark:border-emerald-900/60 dark:bg-zinc-950"
            />
          </label>
        </div>

        <div className="shrink-0 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onSave}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white"
          >
            保存
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
