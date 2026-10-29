"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { InstallHint } from "@/components/InstallHint";
import { MobileAccessHint } from "@/components/MobileAccessHint";
import { deleteMedia, listMedia, type MediaRecord } from "@/lib/db/clientDb";

export default function MyListPage() {
  const [items, setItems] = useState<MediaRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">My List</h1>
        <p className="mt-1 text-sm text-zinc-500">
          端末（IndexedDB）に保存した動画。サーバーにはアップロードしません。
        </p>
      </header>

      <InstallHint />
      <MobileAccessHint />

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
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <Link
                href={`/player/${item.id}`}
                className="min-w-0 flex-1"
              >
                <p className="truncate font-medium">{item.title}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </Link>
              <button
                type="button"
                className="shrink-0 text-xs text-red-600"
                onClick={async () => {
                  if (!confirm(`「${item.title}」を削除しますか？`)) return;
                  await deleteMedia(item.id);
                  await refresh();
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
