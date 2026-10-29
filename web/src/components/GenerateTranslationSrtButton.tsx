"use client";

import { useState } from "react";
import { getMediaMeta, updateMedia } from "@/lib/db/clientDb";
import { generateTranslationSrtFromPrimary } from "@/lib/generateTranslationSrt";

type Props = {
  mediaId: string;
  onComplete?: () => void;
  className?: string;
};

export function GenerateTranslationSrtButton({
  mediaId,
  onComplete,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (
      !confirm(
        "メイン字幕から日本語の翻訳 SRT を AI で作成します。行数が多いと数分かかります。続行しますか？",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setProgress("準備中…");
    try {
      const meta = await getMediaMeta(mediaId);
      if (!meta?.primarySrt?.trim()) {
        throw new Error("メイン字幕がありません");
      }
      const translationSrt = await generateTranslationSrtFromPrimary(
        meta.primarySrt,
        (p) => {
          setProgress(`翻訳中… ${p.done}/${p.total} 行`);
        },
      );
      await updateMedia(mediaId, { translationSrt });
      setProgress("保存しました");
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "翻訳に失敗しました");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "翻訳 SRT 作成中…" : "メイン字幕から翻訳 SRT を AI 作成"}
      </button>
      {progress && <p className="mt-2 text-xs text-zinc-500">{progress}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
        Vercel に GEMINI_API_KEY が必要です。タイムコードはメイン字幕と同じです。
      </p>
    </div>
  );
}
