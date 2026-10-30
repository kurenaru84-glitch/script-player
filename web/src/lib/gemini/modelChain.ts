/**
 * Gemini Flash モデル（AI Studio / generativelanguage.googleapis.com）
 * @see https://ai.google.dev/gemini-api/docs/models
 */
const DEPRECATED_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
]);

/** 新規キー向け（2025末〜） */
const DEFAULT_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
] as const;

const DEFAULT_PRIMARY = DEFAULT_CHAIN[0];

export function normalizeGeminiModel(raw: string): string {
  const m = raw.trim();
  if (!m) return DEFAULT_PRIMARY;
  if (DEPRECATED_MODELS.has(m)) return DEFAULT_PRIMARY;
  return m;
}

export function geminiModelChain(): string[] {
  const primary = normalizeGeminiModel(
    process.env.GEMINI_MODEL?.trim() || DEFAULT_PRIMARY,
  );
  const fromEnv = (process.env.GEMINI_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((s) => normalizeGeminiModel(s))
    .filter(Boolean);
  const chain = [primary, ...fromEnv, ...DEFAULT_CHAIN];
  return [...new Set(chain)].filter((m) => !DEPRECATED_MODELS.has(m));
}
