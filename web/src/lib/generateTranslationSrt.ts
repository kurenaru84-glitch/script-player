import { parseSrt } from "@/lib/subtitle/parseSrt";
import { serializeSrt } from "@/lib/subtitle/serializeSrt";

const BATCH_SIZE = 30;

export type GenerateProgress = {
  done: number;
  total: number;
  phase: "translating" | "saving";
};

export async function generateTranslationSrtFromPrimary(
  primarySrt: string,
  onProgress?: (p: GenerateProgress) => void,
): Promise<string> {
  const cues = parseSrt(primarySrt);
  if (cues.length === 0) {
    throw new Error("メイン字幕が空です");
  }

  const translatedTexts: string[] = [];

  for (let i = 0; i < cues.length; i += BATCH_SIZE) {
    const batch = cues.slice(i, i + BATCH_SIZE);
    onProgress?.({
      done: i,
      total: cues.length,
      phase: "translating",
    });

    const res = await fetch("/api/translate-srt-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: batch.map((c) => c.text) }),
    });
    const data = (await res.json()) as {
      translations?: string[];
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "翻訳 API エラー");
    }
    if (!data.translations || data.translations.length !== batch.length) {
      throw new Error("翻訳結果の行数が一致しません");
    }
    translatedTexts.push(...data.translations);
  }

  onProgress?.({ done: cues.length, total: cues.length, phase: "saving" });

  const translationCues = cues.map((cue, index) => ({
    ...cue,
    text: translatedTexts[index] ?? "",
  }));

  return serializeSrt(translationCues);
}
