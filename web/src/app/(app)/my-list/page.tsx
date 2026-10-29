"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { InstallHint } from "@/components/InstallHint";
import { MobileAccessHint } from "@/components/MobileAccessHint";
import { formatStorageError } from "@/lib/db/errors";
import {
  deleteMedia,
  listMedia,
  updateMedia,
  type MediaRecord,
} from "@/lib/db/clientDb";

export default function MyListPage() {
  const [items, setItems] = useState<MediaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listMedia());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startRename = (item: MediaRecord) => {
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

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">My List</h1>
        <p className="mt-1 text-sm text-zinc-500">
          端末（IndexedDB）に保存した動画。名前・字幕はいつでも変更できます。
        </p>
      </header>

      <InstallHint />
      <MobileAccessHint />
      {error && <p className="text-sm text-red-600">{error}</p>}

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
    </div>
  );
}
