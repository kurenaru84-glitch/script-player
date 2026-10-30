import { geminiModelChain, normalizeGeminiModel } from "@/lib/gemini/modelChain";

const MODEL = normalizeGeminiModel(
  process.env.GEMINI_MODEL?.trim() || geminiModelChain()[0] || "gemini-3.8-flash",
);
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

function sanitizeApiKey(raw: string | undefined): string {
  if (!raw) return "";
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

export function getGeminiApiKey(): string {
  const key = sanitizeApiKey(process.env.GEMINI_API_KEY);
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY が未設定です。Vercel → Settings → Environment Variables に Key=GEMINI_API_KEY、Value=AI Studio のキー を入れ、Redeploy してください。",
    );
  }
  if (key === "GEMINI_API_KEY" || key.includes("your_api_key")) {
    throw new Error(
      "GEMINI_API_KEY の Value にキー本体（AIza…）を入れてください。名前の GEMINI_API_KEY を Value に入れないでください。",
    );
  }
  return key;
}

export function formatGeminiError(message: string, status: number): string {
  if (/API key not valid/i.test(message)) {
    return [
      "Gemini API キーが無効です。",
      "① AI Studio (aistudio.google.com/apikey) で作成したキーか確認",
      "② Vercel の Value に余計な空白・引用符がないか",
      "③ キー制限で「HTTP リファラー」のみにしているとサーバーから使えません（制限なし推奨）",
      "④ 追加後に Production を Redeploy したか",
    ].join(" ");
  }
  if (status === 404 || /not found/i.test(message)) {
    return `${message} （GEMINI_MODEL=${MODEL} が無効です。Vercel で gemini-3.8-flash に変更して Redeploy）`;
  }
  return message;
}

export async function geminiGenerateText(prompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  const url = `${API_BASE}/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
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
    const msg = data.error?.message ?? `Gemini API error (${res.status})`;
    throw new Error(formatGeminiError(msg, res.status));
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
