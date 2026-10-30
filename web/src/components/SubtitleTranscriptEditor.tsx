"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMediaMeta, updateMedia } from "@/lib/db/clientDb";
import { mergeCueWithPrevious, splitCueAt } from "@/lib/subtitle/cueEditOps";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import { serializeSrt } from "@/lib/subtitle/serializeSrt";
import type { SubtitleCue } from "@/lib/subtitle/types";
import { formatMs } from "@/lib/subtitle/parseSrt";

type Track = "primary" | "translation";

type Props = {
  mediaId: string;
};

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function SubtitleTranscriptEditor({ mediaId }: Props) {
  const [track, setTrack] = useState<Track>("primary");
  const [primaryCues, setPrimaryCues] = useState<SubtitleCue[]>([]);
  const [translationCues, setTranslationCues] = useState<SubtitleCue[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const cues = track === "primary" ? primaryCues : translationCues;
  const setCues = track === "primary" ? setPrimaryCues : setTranslationCues;

  const load = useCallback(async () => {
    const meta = await getMediaMeta(mediaId);
    if (!meta) {
      setError("メディアが見つかりません");
      return;
    }
    setTitle(meta.title);
    setPrimaryCues(parseSrt(meta.primarySrt));
    setTranslationCues(parseSrt(meta.translationSrt ?? ""));
  }, [mediaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateCueText = (index: number, text: string) => {
    setCues((prev) =>
      prev.map((c, i) => (i === index ? { ...c, text } : c)),
    );
  };

  const onEnterSplit = (index: number, el: HTMLTextAreaElement) => {
    const next = splitCueAt(cues, index, el.selectionStart);
    if (!next) return;
    setCues(next);
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-cue-row="${index + 1}"] textarea`);
      if (row instanceof HTMLTextAreaElement) {
        row.focus();
        row.setSelectionRange(0, 0);
      }
    });
  };

  const onBackspaceMerge = (index: number) => {
    const next = mergeCueWithPrevious(cues, index);
    if (!next) return;
    setCues(next);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateMedia(mediaId, {
        primarySrt: serializeSrt(primaryCues),
        translationSrt: serializeSrt(translationCues),
      });
      setMessage("字幕を保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 pb-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/media/${mediaId}`} className="text-sm text-sky-600">
            ← 設定
          </Link>
          <Link href={`/player/${mediaId}`} className="text-sm text-sky-600">
            プレイヤー
          </Link>
        </div>
        <h1 className="text-lg font-semibold">字幕エディタ</h1>
        <p className="text-xs text-zinc-500">{title}</p>
        <p className="text-xs text-violet-700 dark:text-violet-300">
          <strong>Enter</strong> … カーソル位置で区切る ·{" "}
          <strong>行頭 + Backspace</strong> … 上の行と結合 · Shift+Enter … 改行
        </p>
      </header>

      <div className="flex gap-2">
        <TrackTab active={track === "primary"} onClick={() => setTrack("primary")}>
          メイン ({primaryCues.length})
        </TrackTab>
        <TrackTab
          active={track === "translation"}
          onClick={() => setTrack("translation")}
        >
          翻訳 ({translationCues.length})
        </TrackTab>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
        style={{ maxHeight: "calc(100dvh - 16rem)" }}
      >
        {cues.map((cue, index) => (
          <div
            key={`${cue.index}-${cue.startMs}`}
            data-cue-row={index}
            className="rounded-lg border border-transparent px-2 py-1.5 focus-within:border-violet-300 focus-within:bg-violet-50/50 dark:focus-within:bg-violet-950/30"
          >
            <div className="mb-1 flex items-center gap-2 text-[10px] text-zinc-500">
              <span className="font-mono tabular-nums">{formatClock(cue.startMs)}</span>
              <span className="text-zinc-400">#{index + 1}</span>
              <span className="truncate font-mono text-[9px] text-zinc-400">
                {formatMs(cue.startMs)} → {formatMs(cue.endMs)}
              </span>
            </div>
            <textarea
              value={cue.text}
              rows={Math.min(6, Math.max(2, cue.text.split("\n").length + 1))}
              className="w-full resize-y rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm leading-relaxed dark:border-zinc-600 dark:bg-zinc-900"
              onChange={(e) => updateCueText(index, e.target.value)}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onEnterSplit(index, el);
                }
                if (
                  e.key === "Backspace" &&
                  el.selectionStart === 0 &&
                  el.selectionEnd === 0 &&
                  index > 0
                ) {
                  e.preventDefault();
                  onBackspaceMerge(index);
                }
              }}
            />
          </div>
        ))}
        {cues.length === 0 && (
          <p className="p-4 text-center text-sm text-zinc-500">字幕がありません</p>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="w-full rounded-xl bg-violet-600 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "保存中…" : "保存する"}
      </button>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function TrackTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        active
          ? "bg-violet-600 text-white"
          : "border border-zinc-300 text-zinc-700 dark:border-zinc-600"
      }`}
    >
      {children}
    </button>
  );
}
