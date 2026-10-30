/** Vercel / AI Studio で使える Flash 系（2025末時点） */
const DEPRECATED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
]);

const DEFAULT_CHAIN = [
  "gemini-2.0-flash",
  "gemini-3.5-flash",
  "gemini-1.5-flash",
] as const;

export function normalizeGeminiModel(raw: string): string {
  const m = raw.trim();
  if (DEPRECATED_MODELS.has(m)) return "gemini-2.0-flash";
  return m;
}

export function geminiModelChain(): string[] {
  const primary = normalizeGeminiModel(
    process.env.GEMINI_MODEL?.trim() || DEFAULT_CHAIN[0],
  );
  const fromEnv = (process.env.GEMINI_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((s) => normalizeGeminiModel(s))
    .filter(Boolean);
  const chain = [primary, ...fromEnv, ...DEFAULT_CHAIN];
  return [...new Set(chain)].filter((m) => !DEPRECATED_MODELS.has(m));
}
