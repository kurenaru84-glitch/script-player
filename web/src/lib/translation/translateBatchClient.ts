import {
  backoffMs,
  isModelUnavailableError,
  isRetryableGeminiError,
  isTranslationFormatError,
  sleep,
} from "@/lib/gemini/retryableError";

const MAX_CLIENT_RETRIES = 8;

export async function translateLinesViaApi(lines: string[]): Promise<string[]> {
  if (lines.length === 0) return [];
  try {
    return await fetchBatchWithRetries(lines);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const shouldSplit =
      lines.length > 1 &&
      (isRetryableGeminiError(msg) ||
        isTranslationFormatError(msg) ||
        /長すぎ|too long|MAX/i.test(msg));
    if (shouldSplit) {
      const mid = Math.ceil(lines.length / 2);
      const left = await translateLinesViaApi(lines.slice(0, mid));
      const right = await translateLinesViaApi(lines.slice(mid));
      return [...left, ...right];
    }
    throw e;
  }
}

const FETCH_TIMEOUT_MS = 120_000;

async function fetchBatchWithRetries(lines: string[]): Promise<string[]> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("/api/translate-srt-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "翻訳 API がタイムアウトしました"
          : e instanceof Error
            ? e.message
            : "ネットワークエラー";
      if (isRetryableGeminiError(msg) && attempt < MAX_CLIENT_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(msg);
    }
    clearTimeout(timeout);
    const rawBody = await res.text();
    let data: { translations?: string[]; error?: string };
    try {
      data = JSON.parse(rawBody) as { translations?: string[]; error?: string };
    } catch {
      const snippet = rawBody.replace(/\s+/g, " ").trim().slice(0, 120);
      const message =
        snippet.length === 0
          ? "翻訳 API が空の応答を返しました"
          : `翻訳 API の応答が JSON ではありません（${snippet}）`;
      if (
        (isRetryableGeminiError(message, res.status) ||
          isTranslationFormatError(message)) &&
        attempt < MAX_CLIENT_RETRIES
      ) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(message);
    }
    if (res.ok) {
      if (!data.translations || data.translations.length !== lines.length) {
        throw new Error("翻訳結果の行数が一致しません");
      }
      return data.translations;
    }
    const message = data.error ?? "翻訳 API エラー";
    if (isModelUnavailableError(message, res.status)) {
      throw new Error(
        `${message} （Redeploy 後も出る場合 Vercel の GEMINI_MODEL を gemini-3.8-flash に）`,
      );
    }
    if (isRetryableGeminiError(message, res.status) && attempt < MAX_CLIENT_RETRIES) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw new Error(message);
  }
}
