/** 字幕1行 → ディクテ用トークン */
export function primaryToDictationWords(primary: string): string[] {
  const cleaned = primary
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[♪♫]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned.split(" ").filter(Boolean);
}

export function normalizeDictationAnswer(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:'"]/g, "");
}

export type DictationToken = { id: number; word: string };

export function buildShuffledTokens(words: string[], seed: number): DictationToken[] {
  const tokens = words.map((word, i) => ({ id: i, word }));
  const rng = mulberry32(seed);
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tokens[i], tokens[j]] = [tokens[j]!, tokens[i]!];
  }
  return tokens;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
