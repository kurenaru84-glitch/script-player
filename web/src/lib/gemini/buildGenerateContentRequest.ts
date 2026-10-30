/** Gemini 3.x は temperature 非対応。3.8 は thinkingLevel が必要 */
export function buildGenerateContentRequest(model: string, prompt: string): object {
  const isGemini3 = /^gemini-3/i.test(model);
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: 8192,
  };
  if (isGemini3) {
    generationConfig.thinkingConfig = { thinkingLevel: "low" };
  } else {
    generationConfig.temperature = 0.2;
  }
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  };
}

type Part = { text?: string; thought?: boolean };
type GenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Part[] } }>;
};

export function extractGeminiText(data: GenerateContentResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const visible = parts.filter((p) => p.thought !== true);
  const text = visible.map((p) => p.text ?? "").join("").trim();
  if (text) return text;
  return parts.map((p) => p.text ?? "").join("").trim();
}
