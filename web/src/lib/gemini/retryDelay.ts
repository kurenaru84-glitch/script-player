import { backoffMs } from "@/lib/gemini/retryableError";

const AUTO_COOLDOWN_MS = 75_000;

export function isRateLimitError(message: string): boolean {
  return /quota|rate limit|429|resource exhausted|high demand|overloaded|too many requests|混雑/i.test(
    message,
  );
}

/** ジョブ再試行までの待ち時間（ms） */
export function translationRetryDelayMs(failures: number, message: string): number {
  if (isRateLimitError(message)) {
    const capped = Math.min(failures, 12);
    return 45_000 + capped * 12_000;
  }
  if (failures >= 18) return AUTO_COOLDOWN_MS;
  return backoffMs(Math.min(failures, 8), 3500);
}
