"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMedia, getNote, noteCueIndices, saveNote } from "@/lib/db/clientDb";
import { alignBilingual } from "@/lib/subtitle/alignBilingual";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import type { BilingualCue } from "@/lib/subtitle/types";

const SPEEDS = [0.8, 1.0, 1.25] as const;

type Props = {
  mediaId: string;
};

export function RepeatPlayer({ mediaId }: Props) {
  const searchParams = useSearchParams();
  const initialCue = Number.parseInt(searchParams.get("cue") ?? "", 10);
  const videoRef = useRef<HTMLVideoElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [cues, setCues] = useState<BilingualCue[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1.0);
  const [noteDraft, setNoteDraft] = useState("");
  const [notedIndices, setNotedIndices] = useState<Set<number>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const record = await getMedia(mediaId);
        if (!record) {
          setLoadError("メディアが見つかりません");
          return;
        }
        if (cancelled) return;

        objectUrl = URL.createObjectURL(record.videoBlob);
        setVideoUrl(objectUrl);
        setTitle(record.title);

        const primary = parseSrt(record.primarySrt);
        const translation = parseSrt(record.translationSrt);
        const aligned = alignBilingual(primary, translation);
        setCues(aligned);

        const indices = await noteCueIndices(mediaId);
        if (!cancelled) setNotedIndices(indices);

        if (!cancelled && !Number.isNaN(initialCue) && initialCue >= 0 && aligned[initialCue]) {
          setSelectedIndex(initialCue);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  const selectedCue =
    selectedIndex != null ? cues[selectedIndex] ?? null : null;

  useEffect(() => {
    if (selectedIndex == null) {
      setNoteDraft("");
      return;
    }
    const cue = cues[selectedIndex];
    if (!cue) return;
    getNote(mediaId, selectedIndex).then((n) => {
      setNoteDraft(n?.body ?? "");
    });
  }, [mediaId, selectedIndex, cues]);

  const findActiveIndex = useCallback(
    (timeSec: number): number | null => {
      const ms = timeSec * 1000;
      const idx = cues.findIndex((c) => ms >= c.startMs && ms < c.endMs);
      return idx >= 0 ? idx : null;
    },
    [cues],
  );

  const playCue = useCallback(
    (index: number) => {
      const cue = cues[index];
      const video = videoRef.current;
      if (!cue || !video) return;
      setSelectedIndex(index);
      video.currentTime = cue.startMs / 1000;
      void video.play();
    },
    [cues],
  );

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setActiveIndex(findActiveIndex(video.currentTime));

    if (selectedIndex == null) return;
    const cue = cues[selectedIndex];
    if (!cue) return;
    const endSec = cue.endMs / 1000;
    if (video.currentTime >= endSec - 0.05) {
      video.currentTime = cue.startMs / 1000;
    }
  }, [cues, findActiveIndex, selectedIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed, videoUrl]);

  useEffect(() => {
    if (activeIndex == null || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-cue-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  const goRelative = (delta: number) => {
    const base = selectedIndex ?? activeIndex ?? 0;
    const next = Math.min(Math.max(base + delta, 0), cues.length - 1);
    playCue(next);
  };

  const saveCurrentNote = async () => {
    if (selectedIndex == null) return;
    const cue = cues[selectedIndex];
    if (!cue) return;
    await saveNote({
      mediaId,
      cueIndex: selectedIndex,
      primaryLine: cue.primary,
      translationLine: cue.translation,
      body: noteDraft,
    });
    const indices = await noteCueIndices(mediaId);
    setNotedIndices(indices);
  };

  const overlayCue = useMemo(() => {
    if (selectedIndex != null) return cues[selectedIndex] ?? null;
    if (activeIndex != null) return cues[activeIndex] ?? null;
    return null;
  }, [activeIndex, cues, selectedIndex]);

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">読み込み中…</p>
    );
  }

  if (loadError || !videoUrl) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-red-600">{loadError ?? "動画を開けません"}</p>
        <Link href="/my-list" className="text-sky-600 underline">
          My List に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        <Link href="/my-list" className="shrink-0 text-sm text-sky-600">
          一覧
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          // eslint-disable-next-line react/no-unknown-property -- iOS inline playback
          webkit-playsinline="true"
          className="aspect-video w-full touch-pan-y"
          onTimeUpdate={onTimeUpdate}
        />
        {overlayCue && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-8 text-white">
            <p className="text-base font-medium leading-snug">{overlayCue.primary}</p>
            {overlayCue.translation && (
              <p className="mt-1 text-sm text-zinc-200">{overlayCue.translation}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => goRelative(-1)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
        >
          前のセリフ
        </button>
        <button
          type="button"
          onClick={() => goRelative(1)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
        >
          次のセリフ
        </button>
        <span className="text-xs text-zinc-500">
          行タップで区間リピート
        </span>
        <div className="ml-auto flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded-lg px-2.5 py-1 text-sm ${
                speed === s
                  ? "bg-sky-600 text-white"
                  : "border border-zinc-300 dark:border-zinc-600"
              }`}
            >
              x{s}
            </button>
          ))}
        </div>
      </div>

      {selectedCue && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs font-medium text-zinc-500">学習メモ（Vocabulary に保存）</p>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            placeholder="Gemini の解説をコピペ、または自分のメモ"
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNoteDraft("");
                void saveCurrentNote();
              }}
              className="text-sm text-zinc-500"
            >
              クリア
            </button>
            <button
              type="button"
              onClick={() => void saveCurrentNote()}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white"
            >
              メモ保存
            </button>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="max-h-[42vh] space-y-2 overflow-y-auto rounded-xl border border-zinc-200 p-2 dark:border-zinc-700"
      >
        {cues.map((cue, index) => {
          const active = activeIndex === index;
          const selected = selectedIndex === index;
          const hasNote = notedIndices.has(index);
          return (
            <button
              key={`${cue.index}-${cue.startMs}`}
              type="button"
              data-cue-index={index}
              onClick={() => playCue(index)}
              className={`w-full rounded-lg px-3 py-3 text-left transition-colors active:scale-[0.99] ${
                selected
                  ? "bg-sky-100 ring-2 ring-sky-500 dark:bg-sky-950"
                  : active
                    ? "bg-sky-50 dark:bg-sky-950/40"
                    : "bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2 text-xs text-red-600">
                <span className="font-bold">#{cue.index}</span>
                {hasNote && (
                  <span className="rounded bg-emerald-100 px-1.5 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                    メモ
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium leading-snug">{cue.primary}</p>
              {cue.translation && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {cue.translation}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
