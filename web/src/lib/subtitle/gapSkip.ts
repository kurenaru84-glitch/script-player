import type { BilingualCue } from "@/lib/subtitle/types";

const END_PAD_MS = 90;
const GAP_PAD_MS = 40;

/** 再生位置が字幕の空白なら、飛ばす先のキュー index（なければ null） */
export function cueIndexToSkipTo(
  cues: BilingualCue[],
  timeMs: number,
  activeIdx: number | null,
): number | null {
  if (cues.length === 0) return null;

  if (activeIdx != null) {
    const cue = cues[activeIdx];
    if (!cue) return null;
    if (timeMs < cue.endMs - END_PAD_MS) return null;
    const next = activeIdx + 1;
    if (next >= cues.length) return null;
    const nextCue = cues[next]!;
    if (timeMs < nextCue.startMs - GAP_PAD_MS) return next;
    return null;
  }

  const first = cues[0]!;
  if (timeMs < first.startMs - GAP_PAD_MS) return 0;

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    if (timeMs >= c.startMs && timeMs < c.endMs - END_PAD_MS) return null;
    if (c.startMs > timeMs + GAP_PAD_MS) return i;
    const next = cues[i + 1];
    if (next && timeMs > c.endMs + GAP_PAD_MS && timeMs < next.startMs - GAP_PAD_MS) {
      return i + 1;
    }
  }

  return null;
}
