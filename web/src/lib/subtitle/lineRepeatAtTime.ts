import type { BilingualCue } from "@/lib/subtitle/types";

/** この時刻で指定インデックスの字幕が終わった／終わりかけか */
export function shouldHandleLineRepeatEnd(opts: {
  cues: BilingualCue[];
  repeatIdx: number;
  timeMs: number;
  activeIdx: number | null;
  endToleranceMs: number;
}): { cue: BilingualCue; repeatIdx: number } | null {
  const { cues, repeatIdx, timeMs, activeIdx, endToleranceMs } = opts;
  const cue = cues[repeatIdx];
  if (!cue) return null;

  const nearEnd = timeMs >= cue.endMs - endToleranceMs;
  if (!nearEnd) return null;

  if (activeIdx === repeatIdx) return { cue, repeatIdx };
  if (activeIdx === repeatIdx + 1) return null;
  if (activeIdx != null && activeIdx !== repeatIdx) return null;

  if (timeMs <= cue.endMs + endToleranceMs * 2) {
    return { cue, repeatIdx };
  }
  return null;
}
