import { geminiGenerateTextWithFallback } from "./generateContentWithFallback";
import { grammarGeminiModelChain } from "./modelChain";

export async function translatePhrase(
  phrase: string,
  opts?: { sourceLanguage?: string; context?: string },
): Promise<string> {
  const source = opts?.sourceLanguage ?? "英語";
  const ctx = opts?.context?.trim();
  const prompt = `${source}の語句を、学習者向けに自然な日本語1行で訳してください。Markdown禁止。語句だけを訳し、余計な説明は不要。

語句: ${phrase.trim()}${ctx ? `\n文脈: ${ctx.slice(0, 400)}` : ""}`;

  const raw = await geminiGenerateTextWithFallback(prompt, {
    models: grammarGeminiModelChain(),
    maxAttemptsPerModel: 2,
    maxOutputTokens: 120,
  });
  const line = raw.replace(/^```[\w]*\n?|\n?```$/g, "").trim().split("\n")[0]?.trim();
  if (!line) throw new Error("翻訳が空でした");
  return line;
}
