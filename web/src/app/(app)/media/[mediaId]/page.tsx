"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GenerateTranslationSrtButton } from "@/components/GenerateTranslationSrtButton";
import { SubtitleRefinePanel } from "@/components/SubtitleRefinePanel";
import {
  UNIFIED_FILE_INPUT_ACCEPT,
  srtPickError,
  videoPickError,
} from "@/lib/filePick";
import { refineSubtitlePair } from "@/lib/subtitle/refineSubtitles";
import { formatStorageError } from "@/lib/db/errors";
import { getMediaMeta, updateMedia } from "@/lib/db/clientDb";
import { storeVideoBlob } from "@/lib/videoStorage/loadVideoBlob";
import {
  releaseVideoObjectUrl,
  warmVideoObjectUrl,
} from "@/lib/videoObjectUrlCache";

export default function MediaPropertiesPage() {
  const params = useParams<{ mediaId: string }>();
  const mediaId = params.mediaId;
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!mediaId) return;
    const meta = await getMediaMeta(mediaId);
    if (!meta) {
      setError("メディアが見つかりません");
      return;
    }
    setTitle(meta.title);
  }, [mediaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveTitle = async () => {
    if (!mediaId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateMedia(mediaId, { title: title.trim() || "無題" });
      setMessage("タイトルを保存しました");
    } catch (e) {
      setError(formatStorageError(e));
    } finally {
      setBusy(false);
    }
  };

  const replaceSrt = async (kind: "primary" | "translation", file: File | null) => {
    if (!mediaId || !file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const meta = await getMediaMeta(mediaId);
      if (kind === "primary") {
        const refined = refineSubtitlePair(text, meta?.translationSrt ?? "", {
          enabled: meta?.subtitleAutoMerge !== false,
        });
        await updateMedia(mediaId, {
          primarySrt: refined.primarySrt,
          translationSrt: refined.translationSrt,
        });
        setMessage(
          refined.mergedCount > 0
            ? `メイン字幕を差し替え、${refined.mergedCount} 箇所を自動結合しました`
            : "メイン字幕を差し替えました",
        );
      } else {
        const refined = refineSubtitlePair(meta?.primarySrt ?? text, text, {
          enabled: meta?.subtitleAutoMerge !== false,
        });
        await updateMedia(mediaId, {
          primarySrt: refined.primarySrt,
          translationSrt: refined.translationSrt,
        });
        setMessage("翻訳字幕を差し替えました");
      }
      router.push(`/player/${mediaId}`);
    } catch (e) {
      setError(formatStorageError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!mediaId) {
    return <p className="text-red-600">ID がありません</p>;
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">プロパティ</h1>
        <div className="flex items-center gap-2">
          <GenerateTranslationSrtButton
            mediaId={mediaId}
            variant="compact"
            onComplete={() => router.push(`/player/${mediaId}`)}
          />
          <Link href="/my-list" className="text-sm text-sky-600">
            My List
          </Link>
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">表示名</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => void saveTitle()}
        className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        タイトル保存
      </button>

      <GenerateTranslationSrtButton
        mediaId={mediaId}
        variant="panel"
        onComplete={() => router.push(`/player/${mediaId}`)}
      />

      <SubtitleRefinePanel mediaId={mediaId} />

      <hr className="border-zinc-200 dark:border-zinc-700" />

      <p className="text-sm font-medium">字幕ファイルの差し替え</p>
      <p className="text-xs text-zinc-500">
        動画ファイルは変更できません。SRT を選ぶと保存後プレイヤーを開きます。
      </p>

      <MediaFilePick
        label="メイン字幕 SRT"
        kind="srt"
        disabled={busy}
        onPickError={setPickError}
        onPick={(f) => void replaceSrt("primary", f)}
      />
      <MediaFilePick
        label="翻訳字幕 SRT"
        kind="srt"
        disabled={busy}
        onPickError={setPickError}
        onPick={(f) => void replaceSrt("translation", f)}
      />

      <MediaFilePick
        label="動画 MP4 の差し替え（読み込みが遅いとき）"
        kind="video"
        disabled={busy}
        onPickError={setPickError}
        onPick={async (f) => {
          if (!mediaId) return;
          setBusy(true);
          setError(null);
          try {
            releaseVideoObjectUrl(mediaId);
            await storeVideoBlob(mediaId, f);
            await updateMedia(mediaId, { videoByteSize: f.size });
            warmVideoObjectUrl(mediaId, f);
            setMessage("動画を差し替えました");
            router.push(`/player/${mediaId}`);
          } catch (e) {
            setError(formatStorageError(e));
          } finally {
            setBusy(false);
          }
        }}
      />

      {pickError && <p className="text-sm text-amber-700">{pickError}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Link
        href={`/player/${mediaId}`}
        className="inline-block text-sm text-sky-600 underline"
      >
        プレイヤーに戻る
      </Link>
    </div>
  );
}

function MediaFilePick({
  label,
  kind,
  disabled,
  onPick,
  onPickError,
}: {
  label: string;
  kind: "video" | "srt";
  disabled: boolean;
  onPick: (file: File) => void;
  onPickError: (msg: string | null) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="file"
        accept={UNIFIED_FILE_INPUT_ACCEPT}
        disabled={disabled}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 dark:file:bg-zinc-800"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const err = kind === "video" ? videoPickError(f) : srtPickError(f);
          if (err) {
            onPickError(err);
            return;
          }
          onPickError(null);
          onPick(f);
        }}
      />
    </label>
  );
}
