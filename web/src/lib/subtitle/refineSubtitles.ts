import { parseSrt } from "@/lib/subtitle/parseSrt";
import { serializeSrt } from "@/lib/subtitle/serializeSrt";
import type { SubtitleCue } from "@/lib/subtitle/types";

export type SubtitleLanguage = "de" | "en" | "ja" | "other";

const SENTENCE_END_RE = /[.!?…]["'»」)]*\s*$/u;
const WEAK_END_RE = /[,;:–—-]\s*$/;

export function detectSubtitleLanguage(cues: SubtitleCue[]): SubtitleLanguage {
  const sample = cues
    .slice(0, 80)
    .map((c) => c.text)
    .join("\n")
    .slice(0, 6000);
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(sample)) return "ja";
  const de =
    (sample.match(/[äöüßÄÖÜ]/g)?.length ?? 0) +
    (sample.match(/\b(ich|und|nicht|das|die|der|dass)\b/gi)?.length ?? 0);
  const en =
    (sample.match(/\b(the|you|what|don't|I'm|it's)\b/gi)?.length ?? 0) +
    (sample.match(/\b(and|but|that|which)\b/gi)?.length ?? 0);
  if (de >= 4 && de >= en) return "de";
  if (en >= 3) return "en";
  return "other";
}

function endsWithSentenceBoundary(text: string): boolean {
  return SENTENCE_END_RE.test(text.trim());
}

/** 次のキューと結合すべきか（英語・ドイツ語向け） */
export function shouldMergeSubtitlePair(
  currentText: string,
  nextText: string,
  lang: SubtitleLanguage,
): boolean {
  const cur = currentText.trim();
  const next = nextText.trim();
  if (!cur) return true;
  if (!next) return true;
  if (endsWithSentenceBoundary(cur)) return false;

  if (lang === "ja") {
    if (/[。!?！？…]["'」)]*\s*$/u.test(cur)) return false;
    return false;
  }

  if (lang === "de" || lang === "en" || lang === "other") {
    if (WEAK_END_RE.test(cur)) return true;
    if (/^[a-zäöüß]/.test(next)) return true;
    if (/^(dass|und|oder|aber|that|which|who|and|but|because|weil|wenn|if)\b/i.test(next)) {
      return true;
    }
    return !endsWithSentenceBoundary(cur);
  }

  return false;
}

export function computeMergeRanges(
  cues: SubtitleCue[],
  lang: SubtitleLanguage,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  while (i < cues.length) {
    let j = i;
    while (
      j + 1 < cues.length &&
      shouldMergeSubtitlePair(cues[j]!.text, cues[j + 1]!.text, lang)
    ) {
      j += 1;
    }
    ranges.push([i, j]);
    i = j + 1;
  }
  return ranges;
}

function joinCueTexts(parts: SubtitleCue[]): string {
  return parts
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mergeCueRange(
  cues: SubtitleCue[],
  start: number,
  end: number,
  index: number,
): SubtitleCue {
  const slice = cues.slice(start, end + 1);
  const first = slice[0]!;
  const last = slice[slice.length - 1]!;
  return {
    index,
    startMs: first.startMs,
    endMs: last.endMs,
    text: joinCueTexts(slice),
  };
}

export function applyMergeRanges(
  cues: SubtitleCue[],
  ranges: Array<[number, number]>,
): SubtitleCue[] {
  return ranges.map(([a, b], i) => mergeCueRange(cues, a, b, i + 1));
}

export function mergeBrokenCues(
  cues: SubtitleCue[],
  lang?: SubtitleLanguage,
): { cues: SubtitleCue[]; mergedCount: number; language: SubtitleLanguage } {
  if (cues.length === 0) {
    return { cues: [], mergedCount: 0, language: "other" };
  }
  const language = lang ?? detectSubtitleLanguage(cues);
  const ranges = computeMergeRanges(cues, language);
  const merged = applyMergeRanges(cues, ranges);
  return {
    cues: merged,
    mergedCount: cues.length - merged.length,
    language,
  };
}

/** 翻訳側を同じ index 範囲で結合。行数が違うときは時間帯で寄せる */
export function mergeTranslationToPrimaryRanges(
  primaryRanges: Array<[number, number]>,
  primaryBefore: SubtitleCue[],
  translation: SubtitleCue[],
): SubtitleCue[] {
  if (translation.length === primaryBefore.length) {
    return applyMergeRanges(translation, primaryRanges);
  }
  return primaryRanges.map(([a, b], i) => {
    const pSlice = primaryBefore.slice(a, b + 1);
    const startMs = pSlice[0]!.startMs;
    const endMs = pSlice[pSlice.length - 1]!.endMs;
    const parts = translation.filter(
      (t) => t.startMs >= startMs - 80 && t.startMs <= endMs + 120,
    );
    return {
      index: i + 1,
      startMs,
      endMs,
      text: joinCueTexts(parts.length > 0 ? parts : [pSlice[0]!]),
    };
  });
}

export type RefinePairResult = {
  primaryCues: SubtitleCue[];
  translationCues: SubtitleCue[];
  primarySrt: string;
  translationSrt: string;
  mergedCount: number;
  language: SubtitleLanguage;
};

export function refineSubtitlePair(
  primaryRaw: string,
  translationRaw: string,
  opts?: { language?: SubtitleLanguage; enabled?: boolean },
): RefinePairResult {
  const primaryBefore = parseSrt(primaryRaw);
  const translationBefore = parseSrt(translationRaw);
  const enabled = opts?.enabled !== false;

  if (!enabled || primaryBefore.length === 0) {
    return {
      primaryCues: primaryBefore,
      translationCues: translationBefore,
      primarySrt: primaryRaw.trim(),
      translationSrt: translationRaw.trim(),
      mergedCount: 0,
      language: opts?.language ?? detectSubtitleLanguage(primaryBefore),
    };
  }

  const language = opts?.language ?? detectSubtitleLanguage(primaryBefore);
  const ranges = computeMergeRanges(primaryBefore, language);
  const primaryCues = applyMergeRanges(primaryBefore, ranges);
  const translationCues =
    translationBefore.length > 0
      ? mergeTranslationToPrimaryRanges(ranges, primaryBefore, translationBefore)
      : [];

  return {
    primaryCues,
    translationCues,
    primarySrt: serializeSrt(primaryCues),
    translationSrt: serializeSrt(translationCues),
    mergedCount: primaryBefore.length - primaryCues.length,
    language,
  };
}

/** 手動: index の行を次と結合 */
export function mergeCueWithNext(cues: SubtitleCue[], index: number): SubtitleCue[] {
  if (index < 0 || index >= cues.length - 1) return cues;
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < cues.length; i++) {
    if (i === index) {
      ranges.push([i, i + 1]);
      i += 1;
    } else {
      ranges.push([i, i]);
    }
  }
  return applyMergeRanges(cues, ranges);
}
