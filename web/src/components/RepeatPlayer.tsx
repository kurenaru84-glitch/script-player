"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  favoriteCueIndices,
  getMediaMeta,
  getNote,
  cueNoteFlags,
  saveNote,
  toggleFavorite,
} from "@/lib/db/clientDb";
import {
  loadVideoObjectUrl,
  peekVideoObjectUrl,
} from "@/lib/videoObjectUrlCache";
import { loadBilingualSubtitles } from "@/lib/subtitle/loadBilingualSubtitles";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import type { BilingualCue } from "@/lib/subtitle/types";
import { GenerateTranslationSrtButton } from "@/components/GenerateTranslationSrtButton";
import { GenerateGrammarButton } from "@/components/GenerateGrammarButton";
import { CueNoteModal } from "@/components/CueNoteModal";
import {
  PlayerPlaybackSettings,
  type PlaybackSettings,
} from "@/components/PlayerPlaybackSettings";
import { VideoSubtitleOverlay } from "@/components/VideoSubtitleOverlay";
import { setLastMediaId } from "@/lib/lastMediaId";
import {
  enterVideoPictureInPicture,
  useBackgroundPlayback,
} from "@/lib/useBackgroundPlayback";
import { useMediaSession } from "@/lib/useMediaSession";
import { shouldHandleLineRepeatEnd } from "@/lib/subtitle/lineRepeatAtTime";

const PLAYER_HEIGHT = "calc(100dvh - 4.25rem - env(safe-area-inset-bottom, 0px))";
/** 字幕終端付近（ms）。timeupdate は疎いので余裕を取る */
const CUE_END_TOLERANCE_MS = 120;

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
  const [playback, setPlayback] = useState<PlaybackSettings>({
    speed: 1.0,
    lineRepeatCount: 0,
  });
  const lineRepeatPassRef = useRef(0);
  const lineRepeatIndexRef = useRef<number | null>(null);
  const lineEndHandledRef = useRef(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [grammarDraft, setGrammarDraft] = useState("");
  const [memoIndices, setMemoIndices] = useState<Set<number>>(new Set());
  const [grammarIndices, setGrammarIndices] = useState<Set<number>>(new Set());
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
  const [pipSupported, setPipSupported] = useState(false);
  const videoLoadGen = useRef(0);
  const lastScrolledIndex = useRef<number | null>(null);
  const lastActiveIndexRef = useRef<number | null>(null);
  const { markUserPaused, markUserPlay } = useBackgroundPlayback(videoEl);

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
        setCues(loadBilingualSubtitles(meta).cues);
        const flags = await cueNoteFlags(mediaId);
        setMemoIndices(flags.memo);
        setGrammarIndices(flags.grammar);
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
    setLastMediaId(mediaId);
  }, [mediaId]);

  useEffect(() => {
    setPipSupported(
      typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled),
    );
  }, []);

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
      setGrammarDraft("");
      return;
    }
    const cue = cues[memoOpenIndex];
    if (!cue) return;
    getNote(mediaId, memoOpenIndex).then((n) => {
      setNoteDraft(n?.body ?? "");
      setGrammarDraft(n?.grammarBody ?? "");
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
      lineRepeatPassRef.current = 0;
      lineRepeatIndexRef.current = index;
      lineEndHandledRef.current = false;
      if (!opts?.keepPlaylist) {
        setFavoritePlaylistActive(false);
        playlistQueueRef.current = [];
        playlistStepRef.current = 0;
      }
      video.currentTime = cue.startMs / 1000;
      markUserPlay();
      void video.play().catch(() => {
        setVideoPlayError("再生できません。プロパティから MP4 を選び直してください。");
      });
    },
    [cues, markUserPlay],
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
    const tMs = video.currentTime * 1000;
    const active = findActiveIndex(video.currentTime);
    if (active != null) {
      lastActiveIndexRef.current = active;
      if (
        playback.lineRepeatCount > 0 &&
        !favoritePlaylistActive &&
        lineRepeatIndexRef.current == null
      ) {
        lineRepeatIndexRef.current = active;
        lineRepeatPassRef.current = 0;
      }
    }
    setActiveIndex(active);

    const repeatN = playback.lineRepeatCount;
    if (repeatN > 0 && !favoritePlaylistActive) {
      const repeatIdx =
        lineRepeatIndexRef.current ??
        active ??
        lastActiveIndexRef.current;
      const endHit =
        repeatIdx != null
          ? shouldHandleLineRepeatEnd({
              cues,
              repeatIdx,
              timeMs: tMs,
              activeIdx: active,
              endToleranceMs: CUE_END_TOLERANCE_MS,
            })
          : null;

      if (endHit) {
        const { cue, repeatIdx: idx } = endHit;
        if (!lineEndHandledRef.current) {
          lineEndHandledRef.current = true;
          lineRepeatIndexRef.current = idx;
          lineRepeatPassRef.current += 1;
          if (lineRepeatPassRef.current < repeatN) {
            lineEndHandledRef.current = false;
            video.currentTime = cue.startMs / 1000 + 0.02;
            return;
          }
          lineRepeatPassRef.current = 0;
          lineRepeatIndexRef.current = null;
          const next = idx + 1;
          if (next < cues.length) {
            playCue(next);
          } else {
            markUserPaused();
            video.pause();
          }
          return;
        }
      } else if (
        repeatIdx != null &&
        cues[repeatIdx] &&
        tMs < cues[repeatIdx]!.endMs - CUE_END_TOLERANCE_MS
      ) {
        lineEndHandledRef.current = false;
      }
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
  }, [
    cues,
    favoritePlaylistActive,
    findActiveIndex,
    markUserPaused,
    playback.lineRepeatCount,
    playCue,
  ]);

  useEffect(() => {
    if (playback.lineRepeatCount <= 0) {
      lineRepeatIndexRef.current = null;
      lineRepeatPassRef.current = 0;
      lineEndHandledRef.current = false;
      return;
    }
    if (lineRepeatIndexRef.current != null) return;
    const idx = lastActiveIndexRef.current ?? activeIndex ?? selectedIndex;
    if (idx != null) {
      lineRepeatIndexRef.current = idx;
      lineRepeatPassRef.current = 0;
    }
  }, [activeIndex, playback.lineRepeatCount, selectedIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playback.speed;
  }, [playback.speed, videoUrl]);

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
      markUserPlay();
      void video.play().catch((e: unknown) => {
        setVideoPlayError(
          e instanceof Error ? e.message : "再生できませんでした（タップして再試行）",
        );
      });
    } else {
      markUserPaused();
      video.pause();
    }
  }, [markUserPaused, markUserPlay]);

  useMediaSession(videoEl, {
    title: title || "Script Player",
    onPlay: () => {
      markUserPlay();
      void videoRef.current?.play();
    },
    onPause: () => {
      markUserPaused();
      videoRef.current?.pause();
    },
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
      grammarBody: grammarDraft,
    });
    const flags = await cueNoteFlags(mediaId);
    setMemoIndices(flags.memo);
    setGrammarIndices(flags.grammar);
  };

  const refreshNoteFlags = useCallback(async () => {
    const flags = await cueNoteFlags(mediaId);
    setMemoIndices(flags.memo);
    setGrammarIndices(flags.grammar);
  }, [mediaId]);

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

  /** 再生中はタイムコードに合わせて更新、停止中は選択行 */
  const overlayCue = useMemo(() => {
    if (isPlaying && activeIndex != null) return cues[activeIndex] ?? null;
    if (selectedIndex != null) return cues[selectedIndex] ?? null;
    if (activeIndex != null) return cues[activeIndex] ?? null;
    return null;
  }, [activeIndex, cues, isPlaying, selectedIndex]);

  const dictationCueParam =
    selectedIndex ?? activeIndex ?? (initialCue >= 0 ? initialCue : 0);

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
      <div className="min-w-0 shrink-0 space-y-2 pb-2">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <PlayerPlaybackSettings value={playback} onChange={setPlayback} />
            <GenerateTranslationSrtButton
              mediaId={mediaId}
              variant="compact"
              onComplete={() => void reloadMetaOnly({ showLoading: false })}
            />
            <GenerateGrammarButton
              mediaId={mediaId}
              variant="compact"
              onComplete={() => void refreshNoteFlags()}
            />
            <Link
              href={`/dictation/${mediaId}?cue=${dictationCueParam}`}
              className="shrink-0 text-sky-600"
            >
              ディクテ
            </Link>
            <Link
              href={`/media/${mediaId}/subtitles`}
              className="shrink-0 text-sky-600"
            >
              字幕編集
            </Link>
            <Link href={`/media/${mediaId}`} className="shrink-0 text-sky-600">
              設定
            </Link>
            <Link href="/my-list" className="shrink-0 text-sky-600">
              一覧
            </Link>
          </div>
      </div>

      <div className="sticky top-0 z-30 shrink-0 space-y-2 rounded-xl border border-zinc-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95">
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
                disableRemotePlayback={false}
                className="aspect-video max-h-[min(42vh,280px)] w-full cursor-pointer object-contain"
                onClick={() => togglePlayPause()}
                onTimeUpdate={onTimeUpdate}
                onError={() => {
                  setVideoPlayError(
                    "動画形式を読み込めません。MP4 を選び直すか Local Files で再登録してください。",
                  );
                }}
                onLoadedData={() => setVideoPlayError(null)}
              />
            )}
            {videoUrl && !videoLoading && (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {!isPlaying && (
                    <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
                      タップで再生
                    </span>
                  )}
                </div>
                {pipSupported && (
                  <button
                    type="button"
                    title="小窓再生（画面オフでも続けやすい）"
                    className="absolute bottom-1 right-1 rounded-md bg-black/65 px-2 py-1 text-[10px] font-medium text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      void enterVideoPictureInPicture(videoRef.current);
                      markUserPlay();
                      void videoRef.current?.play();
                    }}
                  >
                    小窓
                  </button>
                )}
              </>
            )}
            {(loadError || videoPlayError) && (
              <p className="px-2 pb-1 text-[10px] text-red-300">
                {loadError ?? videoPlayError}
              </p>
            )}
            <VideoSubtitleOverlay cue={overlayCue} />
          </div>

      </div>

      {pipSupported && (
        <p className="text-[10px] text-zinc-500">
          画面オフで止まる場合は「小窓」を押してからロックしてください（Android 向け）。
        </p>
      )}

      <div className="mt-2 flex shrink-0 flex-wrap gap-2">
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
            const hasMemo = memoIndices.has(index);
            const hasGrammar = grammarIndices.has(index);
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
                      : "border-transparent bg-white dark:bg-zinc-950"
                }`}
              >
                <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => playCue(index)}
                  className="min-w-0 flex-1 px-3 py-3 text-left active:scale-[0.99]"
                >
                  <div
                    className={`flex items-center gap-2 text-xs ${
                      speaking ? "font-bold text-sky-800 dark:text-sky-200" : "font-semibold text-red-700 dark:text-red-400"
                    }`}
                  >
                    <span className="font-bold">#{cue.index}</span>
                    {speaking && (
                      <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] text-white">
                        再生中
                      </span>
                    )}
                    {hasGrammar && (
                      <span className="rounded bg-amber-100 px-1.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                        文法
                      </span>
                    )}
                    {hasMemo && (
                      <span className="rounded bg-emerald-100 px-1.5 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">
                        メモ
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-1 leading-snug ${
                      speaking
                        ? "text-base font-bold text-zinc-950 dark:text-white"
                        : "text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    {cue.primary}
                  </p>
                  {cue.translation && (
                    <p
                      className={`mt-1 leading-snug ${
                        speaking
                          ? "text-sm font-bold text-sky-950 dark:text-sky-50"
                          : "text-sm font-semibold text-zinc-800 dark:text-zinc-200"
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
                  aria-label="メモ・文法"
                  title="メモ・文法解説"
                  className="px-2 text-xs text-emerald-700 dark:text-emerald-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMemoOpenIndex((prev) => (prev === index ? null : index));
                  }}
                >
                  ✎
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
              </div>
            );
          })}
        </div>
      </div>

      {memoOpenIndex != null && cues[memoOpenIndex] && (
        <CueNoteModal
          open
          cueIndex={memoOpenIndex}
          primary={cues[memoOpenIndex]!.primary}
          translation={cues[memoOpenIndex]!.translation}
          noteDraft={noteDraft}
          grammarDraft={grammarDraft}
          onNoteChange={setNoteDraft}
          onGrammarChange={setGrammarDraft}
          onSave={() => void saveCurrentNote()}
          onClose={() => setMemoOpenIndex(null)}
        />
      )}
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
