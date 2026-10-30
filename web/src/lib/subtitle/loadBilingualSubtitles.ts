import { alignBilingual } from "@/lib/subtitle/alignBilingual";
import type { MediaMeta } from "@/lib/db/types";
import { refineSubtitlePair } from "@/lib/subtitle/refineSubtitles";
import type { BilingualCue } from "@/lib/subtitle/types";

export function loadBilingualSubtitles(meta: MediaMeta): {
  cues: BilingualCue[];
  mergedCount: number;
} {
  const autoMerge = meta.subtitleAutoMerge !== false;
  const refined = refineSubtitlePair(meta.primarySrt, meta.translationSrt ?? "", {
    enabled: autoMerge,
  });
  const cues = alignBilingual(refined.primaryCues, refined.translationCues);
  return { cues, mergedCount: refined.mergedCount };
}
