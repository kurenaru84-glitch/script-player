import {
  backoffMs,
  isModelUnavailableError,
  isRetryableGeminiError,
  sleep,
} from "@/lib/gemini/retryableError";
import {
  buildGenerateContentRequest,
  extractGeminiText,
} from "@/lib/gemini/buildGenerateContentRequest";
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
    body: JSON.stringify(buildGenerateContentRequest(model, prompt)),
  });
  const rawBody = await res.text();
  let data: GeminiResponse;
  try {
    data = JSON.parse(rawBody) as GeminiResponse;
  } catch {
    const snippet = rawBody.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(
      snippet.length === 0
        ? "Gemini API が空の応答を返しました"
        : `Gemini API の応答が JSON ではありません（${snippet}）`,
    );
  }
  if (!res.ok) {
    const msg = data.error?.message ?? `Gemini API error (${res.status})`;
    const err = new Error(formatGeminiError(msg, res.status));
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const text = extractGeminiText(data);
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
  const maxAttempts = opts?.maxAttemptsPerModel ?? 3;
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
      "Gemini 翻訳に失敗しました。Vercel の GEMINI_MODEL を gemini-3.8-flash に設定して Redeploy してください。",
    )
  );
}
