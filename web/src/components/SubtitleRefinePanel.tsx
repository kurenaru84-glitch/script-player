"use client";

import { useCallback, useEffect, useState } from "react";
import { getMediaMeta, updateMedia } from "@/lib/db/clientDb";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import {
  mergeBrokenCues,
  mergeCueWithNext,
  refineSubtitlePair,
  type SubtitleLanguage,
} from "@/lib/subtitle/refineSubtitles";
import { serializeSrt } from "@/lib/subtitle/serializeSrt";

type Props = {
  mediaId: string;
  onSaved?: () => void;
};

export function SubtitleRefinePanel({ mediaId, onSaved }: Props) {
  const [autoMerge, setAutoMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMerged, setPreviewMerged] = useState<number | null>(null);
  const [lang, setLang] = useState<SubtitleLanguage>("other");
  const [manualIndex, setManualIndex] = useState(0);
  const [splitPos, setSplitPos] = useState("");

  const loadSettings = useCallback(async () => {
    const meta = await getMediaMeta(mediaId);
    if (!meta) return;
    setAutoMerge(meta.subtitleAutoMerge !== false);
    const p = parseSrt(meta.primarySrt);
    const { mergedCount, language } = mergeBrokenCues(p, undefined);
    setPreviewMerged(mergedCount);
    setLang(language);
  }, [mediaId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveAutoFlag = async (next: boolean) => {
    setAutoMerge(next);
    await updateMedia(mediaId, { subtitleAutoMerge: next });
    const meta = await getMediaMeta(mediaId);
    if (meta) {
      const { mergedCount } = mergeBrokenCues(parseSrt(meta.primarySrt));
      setPreviewMerged(mergedCount);
    }
  };

  const applyAutoSave = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const meta = await getMediaMeta(mediaId);
      if (!meta) throw new Error("メディアが見つかりません");
      const refined = refineSubtitlePair(meta.primarySrt, meta.translationSrt ?? "", {
        enabled: true,
      });
      await updateMedia(mediaId, {
        primarySrt: refined.primarySrt,
        translationSrt: refined.translationSrt,
        subtitleAutoMerge: true,
      });
      setMessage(`自動結合を保存しました（${refined.mergedCount} 箇所を統合）`);
      setPreviewMerged(0);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const manualMergeNext = async () => {
    setBusy(true);
    setError(null);
    try {
      const meta = await getMediaMeta(mediaId);
      if (!meta) throw new Error("メディアが見つかりません");
      const p = parseSrt(meta.primarySrt);
      const t = parseSrt(meta.translationSrt ?? "");
      if (manualIndex >= p.length - 1) return;
      const p2 = mergeCueWithNext(p, manualIndex);
      const t2 = t.length === p.length ? mergeCueWithNext(t, manualIndex) : t;
      await updateMedia(mediaId, {
        primarySrt: serializeSrt(p2),
        translationSrt: serializeSrt(t2),
      });
      setMessage(`#${manualIndex + 1} と #${manualIndex + 2} を結合しました`);
      setManualIndex((i) => Math.min(i, p2.length - 2));
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "結合に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const manualSplit = async () => {
    setBusy(true);
    setError(null);
    try {
      const meta = await getMediaMeta(mediaId);
      if (!meta) throw new Error("メディアが見つかりません");
      const p = parseSrt(meta.primarySrt);
      const cue = p[manualIndex];
      if (!cue) return;
      const pos = Number.parseInt(splitPos, 10);
      if (!Number.isFinite(pos) || pos <= 0 || pos >= cue.text.length) {
        throw new Error("分割位置は 1 〜 文字数-1 の整数で指定してください");
      }
      const t1 = cue.text.slice(0, pos).trim();
      const t2 = cue.text.slice(pos).trim();
      if (!t1 || !t2) throw new Error("分割結果が空になります");
      const ratio = pos / cue.text.length;
      const mid = Math.round(cue.startMs + (cue.endMs - cue.startMs) * ratio);
      const first = { ...cue, text: t1, endMs: Math.max(cue.startMs + 200, mid) };
      const second = {
        index: cue.index + 1,
        startMs: first.endMs,
        endMs: cue.endMs,
        text: t2,
      };
      const next = [...p.slice(0, manualIndex), first, second, ...p.slice(manualIndex + 1)];
      const reindexed = next.map((c, i) => ({ ...c, index: i + 1 }));
      await updateMedia(mediaId, { primarySrt: serializeSrt(reindexed) });
      setMessage(`#${manualIndex + 1} を分割しました（翻訳 SRT は手動調整が必要な場合があります）`);
      setSplitPos("");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "分割に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
      <h2 className="text-sm font-semibold">字幕の自動補正・手動編集</h2>
      <p className="text-xs text-zinc-500">
        英語・ドイツ語は <strong>ピリオド等まで</strong>
        来るまで次の行と結合します（例: 「Ich glaube」+「dass…」）。日本語は句点まで結合しません。
        {previewMerged != null && previewMerged > 0 && (
          <span className="mt-1 block text-amber-700 dark:text-amber-300">
            現在のメイン字幕: あと {previewMerged} 箇所結合できます（{lang}）
          </span>
        )}
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={autoMerge}
          disabled={busy}
          onChange={(e) => void saveAutoFlag(e.target.checked)}
        />
        読み込み時に自動結合（保存済み SRT は変えず、表示だけ補正）
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void applyAutoSave()}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          自動結合をファイルに保存
        </button>
      </div>

      <hr className="border-zinc-200 dark:border-zinc-700" />

      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">手動修正</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          行 #
          <input
            type="number"
            min={1}
            value={manualIndex + 1}
            onChange={(e) =>
              setManualIndex(Math.max(0, Number.parseInt(e.target.value, 10) - 1 || 0))
            }
            className="ml-1 w-16 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void manualMergeNext()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
        >
          次の行と結合
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          分割位置（文字数）
          <input
            value={splitPos}
            onChange={(e) => setSplitPos(e.target.value)}
            placeholder="例: 12"
            className="ml-1 w-20 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void manualSplit()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
        >
          この行を分割
        </button>
      </div>

      {message && <p className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
