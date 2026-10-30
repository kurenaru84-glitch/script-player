"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  favoriteCueIndices,
  getMediaMeta,
  getNote,
  noteCueIndices,
  saveNote,
  toggleFavorite,
} from "@/lib/db/clientDb";
import {
  loadVideoObjectUrl,
  peekVideoObjectUrl,
} from "@/lib/videoObjectUrlCache";
import { alignBilingual } from "@/lib/subtitle/alignBilingual";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import type { BilingualCue } from "@/lib/subtitle/types";
import { DictationPanel } from "@/components/DictationPanel";
import { GenerateTranslationSrtButton } from "@/components/GenerateTranslationSrtButton";
import { useMediaSession } from "@/lib/useMediaSession";

const SPEEDS = [0.8, 1.0, 1.25] as const;
const PLAYER_HEIGHT = "calc(100dvh - 4.25rem - env(safe-area-inset-bottom, 0px))";

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
  const [lineRepeatMode, setLineRepeatMode] = useState(false);
  const [dictationMode, setDictationMode] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1.0);
  const [noteDraft, setNoteDraft] = useState("");
  const [notedIndices, setNotedIndices] = useState<Set<number>>(new Set());
  const [favoriteIndices, setFavoriteIndices] = useState<Set<number>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoritePlaylistActive, setFavoritePlaylistActive] = useState(false);
  const playlistStepRef = useRef(0);
  const playlistQueueRef = useRef<number[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [videoLoading, setVideoLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [videoPlayError, setVideoPlayError] = useState<string | null>(null);
  const [memoOpenIndex, setMemoOpenIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const videoLoadGen = useRef(0);
  const noteFocusedRef = useRef(false);
  const lastScrolledIndex = useRef<number | null>(null);
  const lastActiveIndexRef = useRef<number | null>(null);

  const reloadMetaOnly = useCallback(
    async (opts?: { showLoading?: boolean }) => {
      const showLoading = opts?.showLoading ?? true;
      setLoadError(null);
      if (showLoading) setLoadingMeta(true);
      try {
        const meta = await getMediaMeta(mediaId);
        if (!meta) {
          setLoadError("メディアが見つかりません");
          return;
        }
        setTitle(meta.title);
        setCues(
          alignBilingual(parseSrt(meta.primarySrt), parseSrt(meta.translationSrt)),
        );
        setNotedIndices(await noteCueIndices(mediaId));
        setFavoriteIndices(await favoriteCueIndices(mediaId));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        if (showLoading) setLoadingMeta(false);
      }
    },
    [mediaId],
  );

  const loadVideoTrack = useCallback(async () => {
    const gen = ++videoLoadGen.current;
    setVideoLoading(true);
    setLoadError(null);
    try {
      const cached = peekVideoObjectUrl(mediaId);
      if (cached) {
        if (gen === videoLoadGen.current) setVideoUrl(cached);
        return;
      }
      const url = await Promise.race([
        loadVideoObjectUrl(mediaId),
        new Promise<string>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "動画の読み込みがタイムアウトしました。プロパティから動画を選び直すか、Local Files で再登録してください。",
                ),
              ),
            120_000,
          ),
        ),
      ]);
      if (gen === videoLoadGen.current) setVideoUrl(url);
    } catch (e) {
      if (gen === videoLoadGen.current) {
        setLoadError(e instanceof Error ? e.message : "動画の読み込みに失敗しました");
      }
    } finally {
      if (gen === videoLoadGen.current) setVideoLoading(false);
    }
  }, [mediaId]);

  useEffect(() => {
    void (async () => {
      await reloadMetaOnly();
      await loadVideoTrack();
    })();
  }, [reloadMetaOnly, loadVideoTrack]);

  useEffect(() => {
    if (Number.isNaN(initialCue) || initialCue < 0) return;
    if (cues[initialCue]) setSelectedIndex(initialCue);
  }, [cues, initialCue]);

  const scrollLineIndex = useMemo(() => {
    if (isPlaying) {
      if (activeIndex != null) return activeIndex;
      return lastActiveIndexRef.current ?? selectedIndex ?? activeIndex;
    }
    if (selectedIndex != null) return selectedIndex;
    return activeIndex;
  }, [activeIndex, isPlaying, selectedIndex]);

  useEffect(() => {
    if (memoOpenIndex == null) {
      setNoteDraft("");
      return;
    }
    if (noteFocusedRef.current) return;
    const cue = cues[memoOpenIndex];
    if (!cue) return;
    getNote(mediaId, memoOpenIndex).then((n) => {
      setNoteDraft(n?.body ?? "");
    });
  }, [mediaId, memoOpenIndex, cues]);

  const findActiveIndex = useCallback(
    (timeSec: number): number | null => {
      const ms = timeSec * 1000;
      const idx = cues.findIndex((c) => ms >= c.startMs && ms < c.endMs);
      return idx >= 0 ? idx : null;
    },
    [cues],
  );

  const playCue = useCallback(
    (index: number, opts?: { keepPlaylist?: boolean }) => {
      const cue = cues[index];
      const video = videoRef.current;
      if (!cue || !video) return;
      setSelectedIndex(index);
      if (!opts?.keepPlaylist) {
        setFavoritePlaylistActive(false);
        playlistQueueRef.current = [];
        playlistStepRef.current = 0;
      }
      video.currentTime = cue.startMs / 1000;
      void video.play().catch(() => {
        setVideoPlayError("再生できません。プロパティから MP4 を選び直してください。");
      });
    },
    [cues],
  );

  const goRelative = useCallback(
    (delta: number) => {
      const base = selectedIndex ?? activeIndex ?? 0;
      const next = Math.min(Math.max(base + delta, 0), cues.length - 1);
      playCue(next);
    },
    [activeIndex, cues.length, playCue, selectedIndex],
  );

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const active = findActiveIndex(video.currentTime);
    if (active != null) lastActiveIndexRef.current = active;
    setActiveIndex(active);

    if (lineRepeatMode && selectedIndex != null) {
      const cue = cues[selectedIndex];
      if (cue && video.currentTime >= cue.endMs / 1000 - 0.05) {
        video.currentTime = cue.startMs / 1000;
      }
      return;
    }

    if (favoritePlaylistActive && playlistQueueRef.current.length > 0) {
      const step = playlistStepRef.current;
      const idx = playlistQueueRef.current[step];
      const cue = idx != null ? cues[idx] : undefined;
      if (cue && video.currentTime >= cue.endMs / 1000 - 0.05) {
        if (step + 1 < playlistQueueRef.current.length) {
          playlistStepRef.current = step + 1;
          playCue(playlistQueueRef.current[step + 1]!, { keepPlaylist: true });
        } else {
          setFavoritePlaylistActive(false);
          playlistQueueRef.current = [];
          playlistStepRef.current = 0;
        }
      }
    }
  }, [cues, favoritePlaylistActive, findActiveIndex, lineRepeatMode, playCue, selectedIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed, videoUrl]);

  useEffect(() => {
    if (scrollLineIndex == null || !listRef.current) {
      lastScrolledIndex.current = null;
      return;
    }
    if (lastScrolledIndex.current === scrollLineIndex) return;
    lastScrolledIndex.current = scrollLineIndex;
    const el = listRef.current.querySelector(
      `[data-cue-index="${scrollLineIndex}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollLineIndex]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch((e: unknown) => {
        setVideoPlayError(
          e instanceof Error ? e.message : "再生できませんでした（タップして再試行）",
        );
      });
    } else {
      video.pause();
    }
  }, []);

  useMediaSession(videoEl, {
    title: title || "Script Player",
    onPlay: () => videoRef.current?.play(),
    onPause: () => videoRef.current?.pause(),
    onPrevious: () => goRelative(-1),
    onNext: () => goRelative(1),
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [videoUrl]);

  const visibleIndices = useMemo(() => {
    const all = cues.map((_, i) => i);
    if (!showFavoritesOnly) return all;
    return all.filter((i) => favoriteIndices.has(i));
  }, [cues, favoriteIndices, showFavoritesOnly]);

  const startFavoritePlaylist = () => {
    const queue = [...favoriteIndices].sort((a, b) => a - b);
    if (queue.length === 0) return;
    setLineRepeatMode(false);
    setFavoritePlaylistActive(true);
    playlistQueueRef.current = queue;
    playlistStepRef.current = 0;
    playCue(queue[0]!, { keepPlaylist: true });
  };

  const saveCurrentNote = async () => {
    if (memoOpenIndex == null) return;
    const cue = cues[memoOpenIndex];
    if (!cue) return;
    await saveNote({
      mediaId,
      cueIndex: memoOpenIndex,
      primaryLine: cue.primary,
      translationLine: cue.translation,
      body: noteDraft,
    });
    setNotedIndices(await noteCueIndices(mediaId));
  };

  const copyCueLines = async (index: number) => {
    const cue = cues[index];
    if (!cue) return;
    const text = [cue.primary, cue.translation].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((v) => (v === index ? null : v)), 1500);
    } catch {
      setVideoPlayError("クリップボードにコピーできませんでした");
    }
  };

  const dictationCueIndex = useMemo(() => {
    if (selectedIndex != null) return selectedIndex;
    if (isPlaying && activeIndex != null) return activeIndex;
    return selectedIndex ?? activeIndex;
  }, [activeIndex, isPlaying, selectedIndex]);

  const dictationCue =
    dictationCueIndex != null ? cues[dictationCueIndex] ?? null : null;

  const overlayCue = useMemo(() => {
    if (dictationMode) return null;
    if (selectedIndex != null) return cues[selectedIndex] ?? null;
    if (activeIndex != null) return cues[activeIndex] ?? null;
    return null;
  }, [activeIndex, cues, dictationMode, selectedIndex]);

  if (loadingMeta) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">字幕・一覧を読み込み中…</p>
    );
  }

  if (loadError && !videoUrl && cues.length === 0) {
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
    <div
      className="relative flex flex-col"
      style={{ height: PLAYER_HEIGHT, maxHeight: PLAYER_HEIGHT }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 pb-2">
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <GenerateTranslationSrtButton
              mediaId={mediaId}
              variant="compact"
              onComplete={() => void reloadMetaOnly({ showLoading: false })}
            />
            <Link href={`/media/${mediaId}`} className="text-sky-600">
              設定
            </Link>
            <Link href="/my-list" className="text-sky-600">
              一覧
            </Link>
          </div>
      </div>

      <div className="sticky top-0 z-30 -mx-1 shrink-0 space-y-2 rounded-xl border border-zinc-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95">
          <div className="relative overflow-hidden rounded-lg bg-black">
            {videoLoading || !videoUrl ? (
              <div className="flex aspect-video max-h-[min(42vh,280px)] min-h-[140px] flex-col items-center justify-center gap-2 px-2 text-center text-xs text-zinc-300">
                <span>動画データを読み込み中…</span>
                {!videoLoading && (
                  <button
                    type="button"
                    className="rounded bg-white/20 px-2 py-1 text-[10px]"
                    onClick={() => void loadVideoTrack()}
                  >
                    再試行
                  </button>
                )}
              </div>
            ) : (
              <video
                ref={(el) => {
                  videoRef.current = el;
                  setVideoEl(el);
                }}
                src={videoUrl}
                playsInline
                preload="auto"
                className="aspect-video max-h-[min(42vh,280px)] w-full object-contain"
                onTimeUpdate={onTimeUpdate}
                onError={() => {
                  setVideoPlayError(
                    "動画形式を読み込めません。MP4 を選び直すか Local Files で再登録してください。",
                  );
                }}
                onLoadedData={() => setVideoPlayError(null)}
              />
            )}
            {(loadError || videoPlayError) && (
              <p className="px-2 pb-1 text-[10px] text-red-300">
                {loadError ?? videoPlayError}
              </p>
            )}
            {overlayCue && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1 pt-6 text-white">
                <p className="line-clamp-2 text-xs font-medium">{overlayCue.primary}</p>
                {overlayCue.translation && (
                  <p className="line-clamp-1 text-[10px] text-zinc-300">
                    {overlayCue.translation}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => goRelative(-1)}
              className="rounded-lg border border-zinc-300 px-2.5 py-2 text-xs dark:border-zinc-600"
            >
              前
            </button>
            <button
              type="button"
              onClick={togglePlayPause}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white"
            >
              {isPlaying ? "一時停止" : "再生"}
            </button>
            <button
              type="button"
              onClick={() => goRelative(1)}
              className="rounded-lg border border-zinc-300 px-2.5 py-2 text-xs dark:border-zinc-600"
            >
              次
            </button>
            <button
              type="button"
              onClick={() => setLineRepeatMode((v) => !v)}
              className={`rounded-lg px-2.5 py-2 text-xs ${
                lineRepeatMode
                  ? "bg-sky-100 text-sky-800 dark:bg-sky-900"
                  : "border border-zinc-300 dark:border-zinc-600"
              }`}
            >
              {lineRepeatMode ? "🔁 リピート" : "通常"}
            </button>
            <button
              type="button"
              onClick={() => setDictationMode((v) => !v)}
              className={`rounded-lg px-2.5 py-2 text-xs ${
                dictationMode
                  ? "bg-sky-600 text-white"
                  : "border border-zinc-300 dark:border-zinc-600"
              }`}
            >
              ディクテ
            </button>
            <div className="ml-auto flex gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`rounded px-2 py-1 text-xs ${
                    speed === s ? "bg-sky-600 text-white" : "border border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  x{s}
                </button>
              ))}
            </div>
          </div>

          {dictationMode && dictationCue && dictationCueIndex != null && (
            <DictationPanel
              cue={dictationCue}
              cueKey={dictationCueIndex}
              onSolved={() => {
                if (lineRepeatMode) return;
                goRelative(1);
              }}
            />
          )}

      </div>

      <div className="mt-2 flex shrink-0 flex-wrap gap-2">
          <ToggleChip
            active={dictationMode}
            onClick={() => setDictationMode((v) => !v)}
            label={dictationMode ? "ディクテ ON" : "ディクテ OFF"}
          />
          <ToggleChip
            active={lineRepeatMode}
            onClick={() => setLineRepeatMode((v) => !v)}
            label={lineRepeatMode ? "リピート ON" : "通常再生"}
          />
          <ToggleChip
            active={showFavoritesOnly}
            onClick={() => setShowFavoritesOnly((v) => !v)}
            label={`★のみ (${favoriteIndices.size})`}
          />
          <button
            type="button"
            disabled={favoriteIndices.size === 0}
            onClick={startFavoritePlaylist}
            className="rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 disabled:opacity-40 dark:bg-amber-950/40 dark:text-amber-100"
          >
            ★連続再生
          </button>
          {favoritePlaylistActive && (
            <button
              type="button"
              onClick={() => {
                setFavoritePlaylistActive(false);
                playlistQueueRef.current = [];
              }}
              className="text-xs text-zinc-500 underline"
            >
              連続停止
            </button>
          )}
      </div>

      <div
        ref={listRef}
        className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="space-y-2 py-[min(32vh,220px)]">
          {visibleIndices.map((index) => {
            const cue = cues[index]!;
            const speaking = isPlaying && activeIndex === index;
            const selected = selectedIndex === index;
            const hasNote = notedIndices.has(index);
            const favorite = favoriteIndices.has(index);
            const memoOpen = memoOpenIndex === index;
            return (
              <div
                key={`${cue.index}-${cue.startMs}`}
                data-cue-index={index}
                className={`scroll-my-[min(32vh,220px)] rounded-xl border transition-colors duration-200 ${
                  speaking
                    ? "scale-[1.02] border-sky-500 bg-sky-100 shadow-md ring-2 ring-sky-400 dark:border-sky-400 dark:bg-sky-900/70"
                    : selected || memoOpen
                      ? "border-sky-300 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/50"
                      : "border-transparent bg-white opacity-75 dark:bg-zinc-950 dark:opacity-70"
                }`}
              >
                <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    playCue(index);
                    setMemoOpenIndex((prev) => (prev === index ? null : index));
                  }}
                  className="min-w-0 flex-1 px-3 py-3 text-left active:scale-[0.99]"
                >
                  <div
                    className={`flex items-center gap-2 text-xs ${
                      speaking ? "font-bold text-sky-700 dark:text-sky-200" : "text-red-600"
                    }`}
                  >
                    <span className="font-bold">#{cue.index}</span>
                    {speaking && (
                      <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] text-white">
                        再生中
                      </span>
                    )}
                    {hasNote && (
                      <span className="rounded bg-emerald-100 px-1.5 text-emerald-800">メモ</span>
                    )}
                  </div>
                  <p
                    className={`mt-1 leading-snug ${
                      speaking
                        ? "text-base font-semibold text-zinc-900 dark:text-white"
                        : "text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {dictationMode ? "············" : cue.primary}
                  </p>
                  {cue.translation && (
                    <p
                      className={`mt-1 leading-snug ${
                        speaking
                          ? "text-sm font-medium text-sky-900/90 dark:text-sky-100"
                          : "text-sm text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {cue.translation}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="セリフをコピー"
                  title="英日テキストをコピー"
                  className="px-2 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyCueLines(index);
                  }}
                >
                  {copiedIndex === index ? "✓" : "⎘"}
                </button>
                <button
                  type="button"
                  aria-label="お気に入り"
                  className="px-2 text-lg leading-none"
                  onClick={async (e) => {
                    e.stopPropagation();
                    setFavoriteIndices(await toggleFavorite(mediaId, index));
                  }}
                >
                  {favorite ? "★" : "☆"}
                </button>
                </div>
                {memoOpen && (
                  <div className="border-t border-emerald-200/80 px-3 py-2 dark:border-emerald-900/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                        メモ #{cue.index}
                      </p>
                      {hasNote && (
                        <span className="text-[10px] text-emerald-700">保存済</span>
                      )}
                    </div>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onFocus={() => {
                        noteFocusedRef.current = true;
                      }}
                      onBlur={() => {
                        noteFocusedRef.current = false;
                      }}
                      rows={2}
                      placeholder="このセリフのメモ…"
                      className="mt-1 w-full rounded-lg border border-emerald-200/80 bg-white p-2 text-sm dark:border-emerald-900 dark:bg-zinc-950"
                    />
                    <button
                      type="button"
                      onClick={() => void saveCurrentNote()}
                      className="mt-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                    >
                      メモ保存
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-sky-600 text-white"
          : "border border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
