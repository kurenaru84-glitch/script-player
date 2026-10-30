import { parseJsonArray } from "@/lib/gemini/generateContent";

/** Gemini が前後に説明文を付けても JSON 配列を抜き出す */
export function parseTranslationArray(raw: string, expectedLength?: number): string[] {
  const trimmed = raw.trim();
  const errors: string[] = [];

  const candidates: string[] = [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) candidates.push(fenced);
  candidates.push(trimmed);

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const payload of [...new Set(candidates)]) {
    try {
      const arr = parseJsonArray(payload);
      if (expectedLength != null && arr.length !== expectedLength) {
        errors.push(`length ${arr.length} !== ${expectedLength}`);
        continue;
      }
      return arr;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  throw new Error(
    `翻訳 JSON の解析に失敗しました（${errors[0] ?? "unknown"}）`,
  );
}
