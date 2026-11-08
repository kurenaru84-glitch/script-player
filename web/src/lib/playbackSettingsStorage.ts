import type { PlaybackSettings } from "@/components/PlayerPlaybackSettings";

const KEY = "script-player-playback-v1";

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  speed: 1.0,
  lineRepeatCount: 0,
  skipLineGaps: true,
};

export function loadPlaybackSettings(): PlaybackSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PLAYBACK };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PLAYBACK };
    const parsed = JSON.parse(raw) as Partial<PlaybackSettings>;
    return {
      speed: parsed.speed ?? DEFAULT_PLAYBACK.speed,
      lineRepeatCount: parsed.lineRepeatCount ?? DEFAULT_PLAYBACK.lineRepeatCount,
      skipLineGaps: parsed.skipLineGaps ?? true,
    };
  } catch {
    return { ...DEFAULT_PLAYBACK };
  }
}

export function savePlaybackSettings(value: PlaybackSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}
