export function isRetryableGeminiError(message: string, status?: number): boolean {
  if (status === 429 || status === 503 || status === 502 || status === 500) return true;
  return /high demand|resource exhausted|overloaded|quota|rate limit|try again|temporarily unavailable|deadline exceeded|503|429/i.test(
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
