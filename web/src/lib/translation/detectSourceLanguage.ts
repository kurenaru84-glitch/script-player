/** メイン字幕の言語ラベル（Gemini プロンプト用） */
export function detectSourceLanguage(sampleLines: string[]): string {
  const sample = sampleLines.join("\n").slice(0, 8000);
  if (!sample.trim()) return "英語";

  const de =
    (sample.match(/[äöüßÄÖÜ]/g)?.length ?? 0) +
    (sample.match(/\b(ich|und|nicht|das|die|der|ist|sie|ein|eine)\b/gi)?.length ?? 0);
  const en =
    (sample.match(/\b(the|you|what|don't|I'm|it's|are|was)\b/gi)?.length ?? 0) +
    (sample.match(/\b(I|we|they|have|been)\b/g)?.length ?? 0);

  if (de >= 4 && de >= en) return "ドイツ語";
  if (en >= 2) return "英語";
  return "原文";
}
