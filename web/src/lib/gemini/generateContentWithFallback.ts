import {
  backoffMs,
  isRetryableGeminiError,
  sleep,
} from "@/lib/gemini/retryableError";
import { formatGeminiError, getGeminiApiKey } from "@/lib/gemini/generateContent";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; code?: number };
};

function defaultModels(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const fallbacks = (process.env.GEMINI_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [primary, ...fallbacks];
  if (!chain.includes("gemini-3.5-flash")) chain.push("gemini-3.5-flash");
  if (!chain.includes("gemini-2.5-flash")) chain.push("gemini-2.5-flash");
  if (!chain.includes("gemini-2.0-flash")) chain.push("gemini-2.0-flash");
  return [...new Set(chain)];
}

async function generateOnce(model: string, prompt: string, apiKey: string): Promise<string> {
  const url = `${API_BASE}/${model}:generateContent`;
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
    const err = new Error(formatGeminiError(msg, res.status));
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("空の応答でした");
  return text.trim();
}

export type GeminiGenerateOptions = {
  maxAttemptsPerModel?: number;
};

/** 429 / high demand 時は待機→同一モデル再試行→次モデルへフォールバック */
export async function geminiGenerateTextWithFallback(
  prompt: string,
  opts?: GeminiGenerateOptions,
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const models = defaultModels();
  const maxAttempts = opts?.maxAttemptsPerModel ?? 5;
  let lastError: Error | undefined;

  for (const model of models) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await generateOnce(model, prompt, apiKey);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lastError = err;
        const status = (err as Error & { status?: number }).status;
        if (!isRetryableGeminiError(err.message, status)) {
          throw err;
        }
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
    }
  }

  throw lastError ?? new Error("Gemini 翻訳に失敗しました");
}
