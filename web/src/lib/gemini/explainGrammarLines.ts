import { geminiGenerateTextWithFallback } from "./generateContentWithFallback";
import { grammarGeminiModelChain } from "./modelChain";
import { parseTranslationArray } from "./parseTranslationArray";

export type GrammarLineInput = {
  primary: string;
  translation?: string;
};

function buildBatchPrompt(
  lines: GrammarLineInput[],
  source: string,
  strict: boolean,
): string {
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
- 各要素は 2〜4 文。構文・助動詞・語順・口語に触れる
- 丸写しの全文和訳は不要
- 出力は JSON 配列のみ（文字列の配列）

入力:
${JSON.stringify(payload)}${strictNote}`;
}

function buildSingleLinePrompt(line: GrammarLineInput, source: string): string {
  const tr = line.translation?.trim();
  return `${source}字幕の1行について、日本語で学習メモを書いてください。Markdown・JSON禁止。和訳の繰り返しは不要。

構成（見出しはそのまま使う）:
【文法】2〜4文。構文・語順・口語表現に触れる。
【語彙 B1+】この行に含まれる CEFR B1 以上（中級以上）の語・熟語だけ。各1行「語形 — 簡潔な日本語説明」。A1/A2 の基本語（the, have, go, und, ich など）は書かない。該当語がなければ「（特になし）」のみ。

${source}: ${line.primary.trim()}${tr ? `\n参考訳: ${tr}` : ""}`;
}

/** 1セリフ向け：プレーンテキスト・軽量モデル・短い max tokens */
export async function explainOneGrammarLine(
  line: GrammarLineInput,
  opts?: { sourceLanguage?: string },
): Promise<string> {
  const source = opts?.sourceLanguage ?? "英語";
  const prompt = buildSingleLinePrompt(line, source);
  const raw = await geminiGenerateTextWithFallback(prompt, {
    models: grammarGeminiModelChain(),
    maxAttemptsPerModel: 2,
    maxOutputTokens: 900,
  });
  const text = raw.replace(/^```[\w]*\n?|\n?```$/g, "").trim();
  if (!text) throw new Error("空の解説が返りました");
  return text;
}

export async function explainGrammarLines(
  lines: GrammarLineInput[],
  opts?: { sourceLanguage?: string },
): Promise<string[]> {
  if (lines.length === 0) return [];
  if (lines.length === 1) {
    return [await explainOneGrammarLine(lines[0]!, opts)];
  }

  const source = opts?.sourceLanguage ?? "英語";
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const prompt = buildBatchPrompt(lines, source, attempt > 0);
      const raw = await geminiGenerateTextWithFallback(prompt, {
        models: grammarGeminiModelChain(),
        maxAttemptsPerModel: attempt > 0 ? 2 : 3,
        maxOutputTokens: 4096,
      });
      return parseTranslationArray(raw, lines.length);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("文法解説の生成に失敗しました");
}
