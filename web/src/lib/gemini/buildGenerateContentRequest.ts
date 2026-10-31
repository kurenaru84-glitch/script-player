/** Gemini 3 は temperature 非推奨。thinkingConfig は API/キー差で落ちるため送らない */
export function buildGenerateContentRequest(
  _model: string,
  prompt: string,
  opts?: { maxOutputTokens?: number },
): object {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: opts?.maxOutputTokens ?? 8192,
    },
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
