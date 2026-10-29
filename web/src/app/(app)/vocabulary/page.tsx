"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listNotes, type VocabNote } from "@/lib/db/clientDb";

export default function VocabularyPage() {
  const [notes, setNotes] = useState<VocabNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listNotes()
      .then(setNotes)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Vocabulary</h1>
        <p className="mt-1 text-sm text-zinc-500">
          プレイヤーで保存したセリフメモの一覧です。
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      ) : notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-600">
          メモはまだありません。プレイヤーで行を選び「メモ保存」してください。
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <Link
                href={`/player/${note.mediaId}?cue=${note.cueIndex}`}
                className="text-xs text-sky-600"
              >
                プレイヤーで開く（行 {note.cueIndex + 1}）
              </Link>
              <p className="mt-2 text-sm font-medium">{note.primaryLine}</p>
              {note.translationLine && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {note.translationLine}
                </p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {note.body}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {new Date(note.updatedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
