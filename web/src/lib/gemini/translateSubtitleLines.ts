import { geminiGenerateText, parseJsonArray } from "./generateContent";

export async function translateSubtitleLines(
  lines: string[],
  opts?: { sourceLanguage?: string; targetLanguage?: string },
): Promise<string[]> {
  if (lines.length === 0) return [];
  const source = opts?.sourceLanguage ?? "英語";
  const target = opts?.targetLanguage ?? "日本語";

  const numbered = lines.map((text, i) => ({ n: i + 1, text }));
  const prompt = `あなたは語学学習者向け字幕の翻訳者です。
${source}の字幕行を${target}に翻訳してください。

ルール:
- 入力と同じ件数・同じ順序で返す
- 各行は自然な${target}（学習用、口語すぎない）
- タイムコードや番号は出力に含めない
- 出力は JSON 配列のみ（文字列の配列）。Markdown 禁止

入力:
${JSON.stringify(numbered.map((x) => x.text))}`;

  const raw = await geminiGenerateText(prompt);
  const translated = parseJsonArray(raw);
  if (translated.length !== lines.length) {
    throw new Error(
      `翻訳行数が一致しません（入力 ${lines.length} / 出力 ${translated.length}）`,
    );
  }
  return translated;
}
