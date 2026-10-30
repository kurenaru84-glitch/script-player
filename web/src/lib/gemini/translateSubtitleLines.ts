import { geminiGenerateTextWithFallback } from "./generateContentWithFallback";
import { parseTranslationArray } from "./parseTranslationArray";

function buildPrompt(
  lines: string[],
  source: string,
  target: string,
  strict: boolean,
): string {
  const strictNote = strict
    ? "\n\n重要: 説明文・Markdown・コードフェンス禁止。先頭は [ 、末尾は ] の JSON 配列だけを1つ返す。"
    : "";
  return `あなたは語学学習者向け字幕の翻訳者です。
${source}の字幕行を${target}に翻訳してください。

ルール:
- 入力と同じ件数・同じ順序で返す（${lines.length} 件）
- 各行は自然な${target}（学習用、口語すぎない）
- タイムコードや番号は出力に含めない
- 出力は JSON 配列のみ（文字列の配列）。例: ["訳1","訳2"]

入力:
${JSON.stringify(lines)}${strictNote}`;
}

export async function translateSubtitleLines(
  lines: string[],
  opts?: { sourceLanguage?: string; targetLanguage?: string },
): Promise<string[]> {
  if (lines.length === 0) return [];
  const source = opts?.sourceLanguage ?? "英語";
  const target = opts?.targetLanguage ?? "日本語";

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const prompt = buildPrompt(lines, source, target, attempt > 0);
      const raw = await geminiGenerateTextWithFallback(prompt, {
        maxAttemptsPerModel: attempt > 0 ? 3 : 5,
      });
      return parseTranslationArray(raw, lines.length);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("翻訳に失敗しました");
}
