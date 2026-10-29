"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { InstallHint } from "@/components/InstallHint";
import { MobileAccessHint } from "@/components/MobileAccessHint";
import { formatStorageError } from "@/lib/db/errors";
import {
  deleteMedia,
  getStorageDiagnostics,
  listMediaListItems,
  prepareLocalAppStorage,
  updateMedia,
  wipeAllScriptPlayerStorage,
  type MediaListItem,
} from "@/lib/db/clientDb";
import { releaseVideoObjectUrl } from "@/lib/videoObjectUrlCache";

export default function MyListPage() {
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatusLine("一覧データを開いています…");
    try {
      await prepareLocalAppStorage();
      setStatusLine(null);
      setItems(await listMediaListItems());
      const { mediaMetaCount } = await getStorageDiagnostics(); // meta already open
      if (mediaMetaCount === 0) {
        setStatusLine(
          "登録はまだありません。動画は端末のファイルを参照する方式に近づけており、一覧は軽量 DB だけ読みます。",
        );
      }
    } catch (e) {
      setError(formatStorageError(e));
      setItems([]);
    } finally {
      setLoading(false);
      setStatusLine(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startRename = (item: MediaListItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setError(null);
  };

  const saveRename = async (id: string) => {
    try {
      await updateMedia(id, { title: editTitle.trim() || "無題" });
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(formatStorageError(e));
    }
  };

  const resetStorage = async () => {
    if (
      !confirm(
        "この端末の Script Player データ（一覧・動画・メモ）をすべて消します。旧形式で止まっている場合の最終手段です。続行しますか？",
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      for (const item of items) releaseVideoObjectUrl(item.id);
      await wipeAllScriptPlayerStorage();
      setItems([]);
      setError(null);
      setStatusLine("リセットしました。Local Files から入れ直してください。");
    } catch (e) {
      setError(formatStorageError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">My List</h1>
        <p className="mt-1 text-sm text-zinc-500">
          字幕・タイトルの一覧（軽量）。動画本体は別ストレージ（OPFS）で、MediaDict
          の「外部ファイル接続」に近い考え方です。
        </p>
      </header>

      <InstallHint />
      <MobileAccessHint />
      {statusLine && loading && (
        <p className="text-sm text-zinc-500">{statusLine}</p>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p>{error}</p>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() => void refresh()}
          >
            再読み込み
          </button>
        </div>
      )}
      {statusLine && !loading && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{statusLine}</p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-600">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            まだメディアがありません
          </p>
          <Link
            href="/local"
            className="mt-3 inline-block text-sky-600 underline"
          >
            Local Files で追加
          </Link>
          <p className="mt-4 text-xs text-zinc-500">
            ずっと読み込み中だった場合は、下の「ストレージをリセット」を試してください。
          </p>
          <button
            type="button"
            className="mt-2 text-xs text-red-600 underline"
            onClick={() => void resetStorage()}
          >
            ストレージをリセット
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {editingId === item.id ? (
                <div className="space-y-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs text-white"
                      onClick={() => void saveRename(item.id)}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className="text-xs text-zinc-500"
                      onClick={() => setEditingId(null)}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <Link href={`/player/${item.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <button
                      type="button"
                      className="text-sky-600"
                      onClick={() => startRename(item)}
                    >
                      名前変更
                    </button>
                    <Link href={`/media/${item.id}`} className="text-sky-600">
                      プロパティ
                    </Link>
                    <button
                      type="button"
                      className="text-red-600"
                      onClick={async () => {
                        if (!confirm(`「${item.title}」を削除しますか？`)) return;
                        releaseVideoObjectUrl(item.id);
                        await deleteMedia(item.id);
                        await refresh();
                      }}
                    >
                      削除
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && (
        <button
          type="button"
          className="text-xs text-zinc-500 underline"
          onClick={() => void resetStorage()}
        >
          ストレージをリセット（詰まったとき）
        </button>
      )}
    </div>
  );
}
