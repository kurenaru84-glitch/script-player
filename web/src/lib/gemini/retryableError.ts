/** 別モデルへ即スキップ（同一モデルではリトライしない） */
export function isModelUnavailableError(message: string, status?: number): boolean {
  if (status === 404 || status === 400) {
    if (/model|not found|no longer available|not supported|invalid/i.test(message)) {
      return true;
    }
  }
  return /no longer available|not found|is not supported|invalid model|was not found|deprecated/i.test(
    message,
  );
}

/** API 応答の形式崩れ（JSON 以外） */
export function isTranslationFormatError(message: string): boolean {
  return /not valid JSON|Unexpected token|JSON 配列|翻訳 JSON|行数が一致|空の応答|JSON ではありません|parse/i.test(
    message,
  );
}

export function isRetryableGeminiError(message: string, status?: number): boolean {
  if (isModelUnavailableError(message, status)) return false;
  if (
    status === 429 ||
    status === 503 ||
    status === 502 ||
    status === 500 ||
    status === 504
  ) {
    return true;
  }
  if (isTranslationFormatError(message)) return true;
  return /high demand|resource exhausted|overloaded|quota|rate limit|try again|temporarily unavailable|deadline exceeded|タイムアウト|network|failed to fetch|503|429|504|load failed/i.test(
    message,
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function backoffMs(attempt: number, baseMs = 2500): number {
  const capped = Math.min(attempt, 8);
  const jitter = Math.floor(Math.random() * 400);
  return baseMs * capped + jitter;
}
