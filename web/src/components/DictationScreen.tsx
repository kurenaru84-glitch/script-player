"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DictationPanel } from "@/components/DictationPanel";
import { VideoSubtitleOverlay } from "@/components/VideoSubtitleOverlay";
import { maskPrimaryLine } from "@/lib/subtitle/maskPrimaryLine";
import { getMediaMeta } from "@/lib/db/clientDb";
import { setLastMediaId } from "@/lib/lastMediaId";
import { alignBilingual } from "@/lib/subtitle/alignBilingual";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import type { BilingualCue } from "@/lib/subtitle/types";
import {
  loadVideoObjectUrl,
  peekVideoObjectUrl,
} from "@/lib/videoObjectUrlCache";

const SPEEDS = [0.8, 1.0, 1.25] as const;
const VIEW_HEIGHT =
  "calc(100dvh - 4.25rem - env(safe-area-inset-bottom, 0px))";

type Props = { mediaId: string };

export function DictationScreen({ mediaId }: Props) {
  const searchParams = useSearchParams();
  const initialCue = Number.parseInt(searchParams.get("cue") ?? "", 10);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState("");
  const [cues, setCues] = useState<BilingualCue[]>([]);
  const [lineIndex, setLineIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    setLastMediaId(mediaId);
  }, [mediaId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const meta = await getMediaMeta(mediaId);
        if (!meta) {
          setError("メディアが見つかりません");
          return;
        }
        setTitle(meta.title);
        const aligned = alignBilingual(
          parseSrt(meta.primarySrt),
          parseSrt(meta.translationSrt),
        );
        setCues(aligned);
        const start =
          !Number.isNaN(initialCue) && initialCue >= 0 && initialCue < aligned.length
            ? initialCue
            : 0;
        setLineIndex(start);
        const cached = peekVideoObjectUrl(mediaId);
        setVideoUrl(cached ?? (await loadVideoObjectUrl(mediaId)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [mediaId, initialCue]);

  const cue = cues[lineIndex];

  const findActiveIndex = useCallback(
    (timeSec: number): number | null => {
      const ms = timeSec * 1000;
      const idx = cues.findIndex((c) => ms >= c.startMs && ms < c.endMs);
      return idx >= 0 ? idx : null;
    },
    [cues],
  );

  const overlayCue = useMemo(() => {
    const idx = activeIndex ?? lineIndex;
    return cues[idx] ?? cue ?? null;
  }, [activeIndex, cue, cues, lineIndex]);

  const playLine = useCallback(
    (index: number, autoplay = true) => {
      const c = cues[index];
      const video = videoRef.current;
      if (!c || !video) return;
      setLineIndex(index);
      video.currentTime = c.startMs / 1000;
      if (autoplay) {
        void video.play().catch(() => undefined);
      }
    },
    [cues],
  );

  useEffect(() => {
    if (!videoUrl || cues.length === 0 || loading) return;
    playLine(lineIndex, true);
  }, [lineIndex, videoUrl, cues.length, loading, playLine]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed, videoUrl]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    const c = cues[lineIndex];
    if (!video || !c) return;
    const active = findActiveIndex(video.currentTime);
    setActiveIndex(active);
    if (video.currentTime >= c.endMs / 1000 - 0.05) {
      video.currentTime = c.startMs / 1000;
    }
  }, [cues, findActiveIndex, lineIndex]);

  const goRelative = (delta: number) => {
    const next = Math.min(Math.max(lineIndex + delta, 0), cues.length - 1);
    playLine(next);
  };

  const maskedLine = useMemo(() => {
    if (!overlayCue) return "";
    return maskPrimaryLine(overlayCue.primary);
  }, [overlayCue]);

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">ディクテを準備中…</p>
    );
  }

  if (error || !cue) {
    return (
      <div className="space-y-3 py-12 text-center">
        <p className="text-red-600">{error ?? "字幕がありません"}</p>
        <Link href="/my-list" className="text-sky-600 underline">
          My List
        </Link>
      </div>
    );
  }

  return (
    <div
      className="relative -mx-4 flex flex-col bg-zinc-50 dark:bg-zinc-950"
      style={{ height: VIEW_HEIGHT, maxHeight: VIEW_HEIGHT }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <Link
          href={`/player/${mediaId}?cue=${lineIndex}`}
          className="rounded-lg px-2 py-1 text-sm text-sky-600"
        >
          ← 再生
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
            #{overlayCue?.index ?? cue.index} · {title}
          </p>
        </div>
        <Link
          href={`/media/${mediaId}`}
          className="text-xs text-zinc-500"
        >
          設定
        </Link>
      </header>

      <div className="shrink-0 px-4 py-3 text-center">
        <p className="font-mono text-lg tracking-widest text-zinc-400">{maskedLine}</p>
        <p className="mt-1 text-[10px] text-zinc-500">リピート再生中 · 単語を並べ替え</p>
      </div>

      <div className="relative mx-auto w-full max-w-md shrink-0 overflow-hidden rounded-xl bg-black shadow-md">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            preload="auto"
            className="aspect-video w-full object-contain"
            onTimeUpdate={onTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-xs text-zinc-400">
            動画なし
          </div>
        )}
        <VideoSubtitleOverlay cue={overlayCue} maskPrimary />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <DictationPanel
          variant="fullscreen"
          cue={cue}
          cueKey={lineIndex}
          onSolved={() => {
            if (lineIndex + 1 < cues.length) {
              playLine(lineIndex + 1);
            }
          }}
          onSkip={() => goRelative(1)}
        />
      </div>

      <footer className="shrink-0 border-t border-zinc-200 bg-white/95 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => goRelative(-1)}
            className="rounded-full border border-zinc-300 p-2 dark:border-zinc-600"
            aria-label="前のセリフ"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) void v.play();
              else v.pause();
            }}
            className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white"
          >
            {isPlaying ? "一時停止" : "再生"}
          </button>
          <button
            type="button"
            onClick={() => goRelative(1)}
            className="rounded-full border border-zinc-300 p-2 dark:border-zinc-600"
            aria-label="次のセリフ"
          >
            ⏭
          </button>
        </div>
        <div className="mt-2 flex justify-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded px-2 py-0.5 text-xs ${
                speed === s ? "bg-sky-600 text-white" : "border border-zinc-300 dark:border-zinc-600"
              }`}
            >
              x{s}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
