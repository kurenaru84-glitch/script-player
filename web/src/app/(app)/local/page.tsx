"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MobileAccessHint } from "@/components/MobileAccessHint";
import { formatStorageError } from "@/lib/db/errors";
import { saveMedia } from "@/lib/db/clientDb";
import { refineSubtitlePair } from "@/lib/subtitle/refineSubtitles";
import { requestPersistentStorage } from "@/lib/videoStorage/opfs";
import {
  UNIFIED_FILE_INPUT_ACCEPT,
  videoPickError,
  srtPickError,
} from "@/lib/filePick";
import { warmVideoObjectUrl } from "@/lib/videoObjectUrlCache";

export default function LocalFilesPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [translationFile, setTranslationFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!videoFile) {
      setError("動画ファイル（MP4）を選んでください");
      return;
    }
    if (!primaryFile) {
      setError("メイン字幕（例: 英語 SRT）を選んでください");
      return;
    }
    setBusy(true);
    try {
      await requestPersistentStorage();
      const [primarySrt, translationSrt] = await Promise.all([
        primaryFile.text(),
        translationFile ? translationFile.text() : Promise.resolve(""),
      ]);
      const refined = refineSubtitlePair(primarySrt, translationSrt, { enabled: true });
      const id = await saveMedia({
        title: title.trim() || videoFile.name.replace(/\.[^.]+$/, ""),
        videoBlob: videoFile,
        primarySrt: refined.primarySrt,
        translationSrt: refined.translationSrt,
      });
      warmVideoObjectUrl(id, videoFile);
      router.push(`/player/${id}`);
    } catch (e) {
      setError(formatStorageError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Local Files</h1>
        <p className="mt-1 text-sm text-zinc-500">
          動画・字幕とも「ファイル」アプリ（Android なら Files by Google
          など）から選べます。種類は選んだあと拡張子で判定します。
        </p>
      </header>

      <MobileAccessHint />

      <label className="block space-y-1 text-sm">
        <span className="font-medium">表示名（任意）</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          placeholder="例: S01E01"
        />
      </label>

      <FilePick
        label="動画 (MP4)"
        kind="video"
        file={videoFile}
        onPick={setVideoFile}
        onPickError={setPickError}
      />
      <FilePick
        label="メイン字幕 SRT（学習言語）"
        kind="srt"
        file={primaryFile}
        onPick={setPrimaryFile}
        onPickError={setPickError}
      />
      <FilePick
        label="サブ字幕 SRT（翻訳・任意）"
        kind="srt"
        file={translationFile}
        onPick={setTranslationFile}
        onPickError={setPickError}
      />

      {pickError && <p className="text-sm text-amber-700">{pickError}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void onSubmit()}
        className="w-full rounded-xl bg-sky-600 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "保存中…（100MB 級は 1〜2 分かかることがあります）" : "保存してプレイヤーを開く"}
      </button>
    </div>
  );
}

function FilePick({
  label,
  kind,
  file,
  onPick,
  onPickError,
}: {
  label: string;
  kind: "video" | "srt";
  file: File | null;
  onPick: (f: File | null) => void;
  onPickError: (msg: string | null) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="file"
        accept={UNIFIED_FILE_INPUT_ACCEPT}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 dark:file:bg-zinc-800"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (!f) {
            onPick(null);
            return;
          }
          const err = kind === "video" ? videoPickError(f) : srtPickError(f);
          if (err) {
            onPickError(err);
            return;
          }
          onPickError(null);
          onPick(f);
        }}
      />
      {file && (
        <p className="text-xs text-zinc-500">
          {file.name}（{(file.size / 1024 / 1024).toFixed(1)} MB）
        </p>
      )}
    </label>
  );
}
