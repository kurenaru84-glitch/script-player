export async function translatePhraseViaApi(
  phrase: string,
  opts?: { sourceLanguage?: string; context?: string; signal?: AbortSignal },
): Promise<string> {
  const res = await fetch("/api/translate-phrase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phrase,
      sourceLanguage: opts?.sourceLanguage,
      context: opts?.context,
    }),
    signal: opts?.signal,
  });
  const data = (await res.json()) as { translation?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "翻訳 API エラー");
  if (!data.translation?.trim()) throw new Error("翻訳が空でした");
  return data.translation.trim();
}
