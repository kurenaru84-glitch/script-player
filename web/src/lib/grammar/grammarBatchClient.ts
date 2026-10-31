import {
  backoffMs,
  isRetryableGeminiError,
  isTranslationFormatError,
  sleep,
} from "@/lib/gemini/retryableError";

const MAX_CLIENT_RETRIES = 2;
const FETCH_TIMEOUT_MS = 28_000;

export type GrammarBatchLine = { primary: string; translation?: string };

export async function explainGrammarViaApi(
  lines: GrammarBatchLine[],
  opts?: { signal?: AbortSignal; sourceLanguage?: string },
): Promise<string[]> {
  if (lines.length === 0) return [];
  if (lines.length === 1) {
    const text = await fetchSingleLine(lines[0]!, opts?.signal, opts?.sourceLanguage);
    return [text];
  }
  try {
    return await fetchBatchWithRetries(lines, opts?.signal, opts?.sourceLanguage);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const shouldSplit =
      lines.length > 1 &&
      (isRetryableGeminiError(msg) ||
        isTranslationFormatError(msg) ||
        /長すぎ|too long|MAX/i.test(msg));
    if (shouldSplit) {
      const mid = Math.ceil(lines.length / 2);
      const left = await explainGrammarViaApi(lines.slice(0, mid), opts);
      const right = await explainGrammarViaApi(lines.slice(mid), opts);
      return [...left, ...right];
    }
    throw e;
  }
}

async function fetchSingleLine(
  line: GrammarBatchLine,
  outerSignal?: AbortSignal,
  sourceLanguage?: string,
): Promise<string> {
  let attempt = 0;
  while (true) {
    if (outerSignal?.aborted) throw new Error("文法解説が中断されました");
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      if (outerSignal) {
        outerSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }
      const res = await fetch("/api/explain-grammar-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary: line.primary,
          translation: line.translation,
          sourceLanguage,
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      const data = (await res.json()) as { explanation?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "文法解説 API エラー");
      if (!data.explanation?.trim()) throw new Error("空の解説が返りました");
      return data.explanation.trim();
    } catch (e) {
      attempt += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt > MAX_CLIENT_RETRIES || !isRetryableGeminiError(msg)) throw e;
      await sleep(backoffMs(attempt));
    }
  }
}

async function fetchBatchWithRetries(
  lines: GrammarBatchLine[],
  outerSignal?: AbortSignal,
  sourceLanguage?: string,
): Promise<string[]> {
  let attempt = 0;
  while (true) {
    if (outerSignal?.aborted) throw new Error("文法解説が中断されました");
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      if (outerSignal) {
        outerSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }
      const res = await fetch("/api/explain-grammar-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, sourceLanguage }),
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      const data = (await res.json()) as {
        explanations?: string[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "文法解説 API エラー");
      }
      if (!Array.isArray(data.explanations)) {
        throw new Error("文法解説の形式が不正です");
      }
      return data.explanations;
    } catch (e) {
      attempt += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt > MAX_CLIENT_RETRIES || !isRetryableGeminiError(msg)) throw e;
      await sleep(backoffMs(attempt));
    }
  }
}
