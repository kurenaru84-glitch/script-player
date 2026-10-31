"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { explainGrammarViaApi } from "@/lib/grammar/grammarBatchClient";
import { ReadlangSelectionBar } from "@/components/readlang/ReadlangSelectionBar";

type Props = {
  open: boolean;
  mediaId: string;
  cueIndex: number;
  primary: string;
  translation?: string;
  sourceLanguage?: string;
  noteDraft: string;
  grammarDraft: string;
  onNoteChange: (value: string) => void;
  onGrammarChange: (value: string) => void;
  onSave: (overrides?: { body?: string; grammarBody?: string }) => void | Promise<void>;
  onClose: () => void;
};

export function CueNoteModal({
  open,
  mediaId,
  cueIndex,
  primary,
  translation,
  noteDraft,
  grammarDraft,
  onNoteChange,
  onGrammarChange,
  onSave,
  onClose,
  sourceLanguage,
}: Props) {
  const readlangRootRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setGenError(null);
      setGenerating(false);
      setSavedHint(null);
    }
  }, [open]);

  const getReadlangCue = useCallback(
    (index: number) => {
      if (index !== cueIndex) return undefined;
      return {
        cueIndex,
        primary,
        translation: translation ?? "",
      };
    },
    [cueIndex, primary, translation],
  );

  const runGrammarAi = async () => {
    if (generating) return;
    if (
      grammarDraft.trim() &&
      !window.confirm("既存の文法解説を AI の結果で上書きしますか？")
    ) {
      return;
    }
    setGenError(null);
    setGenerating(true);
    try {
      const [text] = await explainGrammarViaApi(
        [{ primary, translation }],
        { sourceLanguage },
      );
      if (!text?.trim()) throw new Error("空の解説が返りました");
      const grammar = text.trim();
      onGrammarChange(grammar);
      try {
        await onSave({ body: noteDraft, grammarBody: grammar });
        setSavedHint("文法解説を保存しました");
      } catch (saveErr) {
        setGenError(
          saveErr instanceof Error
            ? `生成は成功しましたが保存に失敗: ${saveErr.message}`
            : "保存に失敗しました",
        );
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

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
      <ReadlangSelectionBar
        mediaId={mediaId}
        sourceLanguage={sourceLanguage ?? "英語"}
        rootRef={readlangRootRef}
        getCue={getReadlangCue}
      />
      <div
        ref={readlangRootRef}
        role="dialog"
        aria-label={`メモ 行 ${cueIndex + 1}`}
        className="fixed inset-x-2 top-[max(0.75rem,env(safe-area-inset-top))] z-[211] flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2"
      >
        <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div
              className="readlang-selectable min-w-0 cursor-text select-text"
              data-cue-index={String(cueIndex)}
            >
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
          <div className="block">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                文法・語彙（B1+・編集可）
              </span>
              <button
                type="button"
                disabled={generating}
                onClick={() => void runGrammarAi()}
                className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
              >
                {generating ? "生成中…" : "AI 文法・語彙"}
              </button>
            </div>
            {genError && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{genError}</p>
            )}
            {savedHint && (
              <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                {savedHint}
              </p>
            )}
            <textarea
              value={grammarDraft}
              onChange={(e) => onGrammarChange(e.target.value)}
              rows={8}
              placeholder="「AI 文法・語彙」または直接入力…"
              className="mt-1.5 w-full min-h-[10rem] resize-y rounded-xl border border-amber-200/90 bg-amber-50/40 p-3 text-[15px] leading-relaxed text-zinc-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-zinc-100"
            />
            {grammarDraft.trim() && (
              <div
                className="readlang-selectable mt-2 cursor-text select-text rounded-xl border border-dashed border-amber-300/80 bg-amber-50/50 p-3 text-[15px] leading-relaxed text-zinc-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-zinc-100"
                data-cue-index={String(cueIndex)}
              >
                <p className="pointer-events-none mb-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                  タップ / 選択 → Words に追加
                </p>
                <p className="whitespace-pre-wrap">{grammarDraft}</p>
              </div>
            )}
          </div>
          <div className="block">
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
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => void onSave({ body: noteDraft, grammarBody: grammarDraft })}
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
