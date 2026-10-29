const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY が未設定です。Vercel の Environment Variables に追加してください。",
    );
  }
  return key;
}

export async function geminiGenerateText(prompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  const url = `${API_BASE}/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    }),
  });
  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Gemini API error (${res.status})`);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("空の応答でした");
  return text.trim();
}

export function parseJsonArray(raw: string): string[] {
  const trimmed = raw.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim();
  const payload = jsonBlock ?? trimmed;
  const parsed = JSON.parse(payload) as unknown;
  if (!Array.isArray(parsed)) throw new Error("JSON 配列ではありません");
  return parsed.map((item) => String(item ?? "").trim());
}
