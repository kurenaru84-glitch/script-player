import type { BilingualCue, SubtitleCue } from "./types";

const MAX_GAP_MS = 1200;

/** Port of Android `BilingualAligner.kt` */
export function alignBilingual(
  primary: SubtitleCue[],
  translation: SubtitleCue[],
): BilingualCue[] {
  if (primary.length === 0 && translation.length === 0) return [];
  if (primary.length === 0) {
    return translation.map((cue) => ({
      index: cue.index,
      startMs: cue.startMs,
      endMs: cue.endMs,
      primary: "",
      translation: cue.text,
    }));
  }
  if (translation.length === 0) {
    return primary.map((cue) => ({
      index: cue.index,
      startMs: cue.startMs,
      endMs: cue.endMs,
      primary: cue.text,
      translation: "",
    }));
  }

  return primary.map((cue, idx) => {
    let best: SubtitleCue | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const t of translation) {
      const gap = Math.abs(t.startMs - cue.startMs);
      if (gap < bestGap) {
        bestGap = gap;
        best = t;
      }
    }
    const translationText =
      best && bestGap <= MAX_GAP_MS ? best.text : "";

    return {
      index: cue.index > 0 ? cue.index : idx + 1,
      startMs: cue.startMs,
      endMs: cue.endMs,
      primary: cue.text,
      translation: translationText,
    };
  });
}
