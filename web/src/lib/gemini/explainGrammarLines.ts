import { geminiGenerateTextWithFallback } from "./generateContentWithFallback";
import { parseTranslationArray } from "./parseTranslationArray";

export type GrammarLineInput = {
  primary: string;
  translation?: string;
};

function buildPrompt(lines: GrammarLineInput[], source: string, strict: boolean): string {
  const payload = lines.map((l) => ({
    line: l.primary,
    translation: l.translation?.trim() || undefined,
  }));
  const strictNote = strict
    ? "\n\n重要: 説明文・Markdown・コードフェンス禁止。先頭は [ 、末尾は ] の JSON 配列だけを1つ返す。"
    : "";
  return `あなたは${source}を学ぶ日本人向けの語学チューターです。
映画・ドラマ字幕の「1セリフ」ごとに、短い文法解説を日本語で書いてください。

ルール:
- 入力と同じ件数・同じ順序（${lines.length} 件）
- 各要素は 2〜5 文程度。重要な構文・助動詞・語順・口語表現に触れる
- 丸写しの全文和訳は不要（translation があれば参考にしてよい）
- タイムコードや番号は出力に含めない
- 出力は JSON 配列のみ（文字列の配列）

入力:
${JSON.stringify(payload)}${strictNote}`;
}

export async function explainGrammarLines(
  lines: GrammarLineInput[],
  opts?: { sourceLanguage?: string },
): Promise<string[]> {
  if (lines.length === 0) return [];
  const source = opts?.sourceLanguage ?? "英語";

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const prompt = buildPrompt(lines, source, attempt > 0);
      const raw = await geminiGenerateTextWithFallback(prompt, {
        maxAttemptsPerModel: attempt > 0 ? 3 : 5,
      });
      return parseTranslationArray(raw, lines.length);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("文法解説の生成に失敗しました");
}
