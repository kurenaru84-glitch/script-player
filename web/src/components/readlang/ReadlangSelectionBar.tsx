"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addSavedWord } from "@/lib/db/clientDb";
import { translatePhraseViaApi } from "@/lib/readlang/translatePhraseClient";
import {
  findCueIndexFromNode,
  normalizeSelectedText,
  selectionInsideRoot,
} from "@/lib/readlang/selectionUtils";
import { isInteractiveTarget, wordAtPoint } from "@/lib/readlang/wordAtPoint";

export type ReadlangCueContext = {
  cueIndex: number;
  primary: string;
  translation: string;
};

type Props = {
  mediaId: string;
  sourceLanguage: string;
  rootRef: React.RefObject<HTMLElement | null>;
  getCue: (index: number) => ReadlangCueContext | undefined;
  onWordSaved?: () => void;
};

type PendingSelection = {
  text: string;
  cueIndex: number;
  rect: DOMRect;
  fromTap: boolean;
};

const TAP_MOVE_PX = 12;

export function ReadlangSelectionBar({
  mediaId,
  sourceLanguage,
  rootRef,
  getCue,
  onWordSaved,
}: Props) {
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pointerRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const openPending = useCallback((next: PendingSelection) => {
    setPending(next);
    setTranslation("");
    setError(null);
    setSaved(false);
  }, []);

  const clear = useCallback(() => {
    setPending(null);
    setTranslation("");
    setError(null);
    setSaved(false);
    setLoading(false);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const applySelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !rootRef.current) return;
      if (!selectionInsideRoot(sel, rootRef.current)) return;

      const text = normalizeSelectedText(sel.toString());
      if (!text) return;

      const cueIndex = findCueIndexFromNode(sel.anchorNode, rootRef.current);
      if (cueIndex == null) return;

      const range = sel.getRangeAt(0);
      openPending({
        text,
        cueIndex,
        rect: range.getBoundingClientRect(),
        fromTap: false,
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (isInteractiveTarget(e.target)) return;
      pointerRef.current = { x: e.clientX, y: e.clientY, moved: false };
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = pointerRef.current;
      if (!p || p.moved) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (dx * dx + dy * dy > TAP_MOVE_PX * TAP_MOVE_PX) p.moved = true;
    };

    const onPointerUp = (e: PointerEvent) => {
      const p = pointerRef.current;
      pointerRef.current = null;
      if (!p || p.moved || isInteractiveTarget(e.target)) return;

      window.setTimeout(() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          const selected = normalizeSelectedText(sel.toString());
          if (selected) {
            applySelection();
            return;
          }
        }

        const target = e.target;
        if (!(target instanceof Node) || !rootRef.current?.contains(target)) return;
        const cueIndex = findCueIndexFromNode(target, rootRef.current);
        if (cueIndex == null) return;

        const hit = wordAtPoint(e.clientX, e.clientY);
        if (!hit) return;
        const cueEl = rootRef.current.querySelector(
          `.readlang-selectable[data-cue-index="${cueIndex}"]`,
        );
        if (!cueEl?.contains(hit.node)) return;

        openPending({
          text: hit.text,
          cueIndex,
          rect: hit.rect,
          fromTap: true,
        });
        sel?.removeAllRanges();
      }, 40);
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    document.addEventListener("selectionchange", applySelection);

    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("selectionchange", applySelection);
    };
  }, [rootRef, openPending]);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const cue = getCue(pending.cueIndex);
        const ctx = cue ? `${cue.primary}\n${cue.translation}` : undefined;
        const tr = await translatePhraseViaApi(pending.text, {
          sourceLanguage,
          context: ctx,
        });
        if (!cancelled) setTranslation(tr);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "翻訳に失敗しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, getCue, sourceLanguage]);

  const runTranslate = async () => {
    if (!pending || loading) return;
    setLoading(true);
    setError(null);
    try {
      const cue = getCue(pending.cueIndex);
      const ctx = cue ? `${cue.primary}\n${cue.translation}` : undefined;
      const tr = await translatePhraseViaApi(pending.text, {
        sourceLanguage,
        context: ctx,
      });
      setTranslation(tr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "翻訳に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const runSave = async () => {
    if (!pending) return;
    const cue = getCue(pending.cueIndex);
    if (!cue) return;
    const tr = translation.trim();
    if (!tr) {
      setError("先に翻訳するか、意味を入力してください");
      return;
    }
    await addSavedWord({
      mediaId,
      cueIndex: pending.cueIndex,
      text: pending.text,
      translation: tr,
      contextPrimary: cue.primary,
      contextTranslation: cue.translation,
    });
    setSaved(true);
    onWordSaved?.();
    window.setTimeout(clear, 700);
  };

  if (!pending || typeof document === "undefined") return null;

  const top = Math.min(
    Math.max(pending.rect.top - 8, 12),
    window.innerHeight * 0.35,
  );

  return createPortal(
    <div
      className="fixed inset-x-2 z-[220] sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2"
      style={{ top }}
    >
      <div className="rounded-xl border border-sky-200 bg-white p-3 shadow-xl dark:border-sky-800 dark:bg-zinc-950">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
          {pending.fromTap ? "タップした語" : "選択した語句"}
        </p>
        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {pending.text}
        </p>
        {translation && (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">{translation}</p>
        )}
        <label className="mt-2 block">
          <span className="text-[10px] text-zinc-500">意味（編集可）</span>
          <input
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="翻訳後に自動入力…"
          />
        </label>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {saved && (
          <p className="mt-1 text-xs text-emerald-600">単語リストに追加しました</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void runTranslate()}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {loading ? "翻訳中…" : "再翻訳"}
          </button>
          <button
            type="button"
            onClick={() => void runSave()}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            リストに追加
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-lg px-2 py-1.5 text-xs text-zinc-500"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
