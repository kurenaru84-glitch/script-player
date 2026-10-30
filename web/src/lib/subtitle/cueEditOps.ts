import type { SubtitleCue } from "@/lib/subtitle/types";

export function reindexCues(cues: SubtitleCue[]): SubtitleCue[] {
  return cues.map((c, i) => ({ ...c, index: i + 1 }));
}

/** カーソル位置で1キューを2つに分割（Enter） */
export function splitCueAt(
  cues: SubtitleCue[],
  index: number,
  charOffset: number,
): SubtitleCue[] | null {
  const cue = cues[index];
  if (!cue) return null;
  const raw = cue.text;
  const pos = Math.max(0, Math.min(charOffset, raw.length));
  const t1 = raw.slice(0, pos).trim();
  const t2 = raw.slice(pos).trim();
  if (!t1 || !t2) return null;

  const ratio = pos / Math.max(raw.length, 1);
  const mid = Math.round(
    cue.startMs + (cue.endMs - cue.startMs) * Math.min(0.92, Math.max(0.08, ratio)),
  );
  const first: SubtitleCue = {
    ...cue,
    text: t1,
    endMs: Math.max(cue.startMs + 200, mid),
  };
  const second: SubtitleCue = {
    index: cue.index + 1,
    startMs: first.endMs,
    endMs: cue.endMs,
    text: t2,
  };
  const next = [...cues.slice(0, index), first, second, ...cues.slice(index + 1)];
  return reindexCues(next);
}

/** 行頭 Backspace で前のキューと結合 */
export function mergeCueWithPrevious(cues: SubtitleCue[], index: number): SubtitleCue[] | null {
  if (index <= 0 || index >= cues.length) return null;
  const prev = cues[index - 1]!;
  const cur = cues[index]!;
  const merged: SubtitleCue = {
    ...prev,
    endMs: cur.endMs,
    text: `${prev.text.trim()} ${cur.text.trim()}`.replace(/\s+/g, " ").trim(),
  };
  const next = [...cues.slice(0, index - 1), merged, ...cues.slice(index + 1)];
  return reindexCues(next);
}
