import {
  backoffMs,
  isModelUnavailableError,
  isRetryableGeminiError,
  sleep,
} from "@/lib/gemini/retryableError";
import { formatGeminiError, getGeminiApiKey } from "@/lib/gemini/generateContent";
import { geminiModelChain } from "@/lib/gemini/modelChain";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; code?: number };
};

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

/** 429 / high demand 時は待機→再試行。モデル廃止時は次モデルへ */
export async function geminiGenerateTextWithFallback(
  prompt: string,
  opts?: GeminiGenerateOptions,
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const models = geminiModelChain();
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
        if (isModelUnavailableError(err.message, status)) {
          break;
        }
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

  throw (
    lastError ??
    new Error(
      "Gemini 翻訳に失敗しました。Vercel の GEMINI_MODEL を gemini-2.0-flash に設定して Redeploy してください。",
    )
  );
}
