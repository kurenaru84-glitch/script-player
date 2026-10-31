"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { listSavedWords, type SavedWord } from "@/lib/db/clientDb";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function VocabularyPracticePage() {
  const searchParams = useSearchParams();
  const starred = searchParams.get("starred") === "1";
  const mediaId = searchParams.get("mediaId") ?? undefined;

  const [deck, setDeck] = useState<SavedWord[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSavedWords({ starredOnly: starred, mediaId })
      .then((rows) => setDeck(shuffle(rows)))
      .finally(() => setLoading(false));
  }, [starred, mediaId]);

  const card = deck[index];

  const label = useMemo(() => {
    if (starred && mediaId) return "★ · この作品";
    if (starred) return "★ のみ";
    if (mediaId) return "この作品";
    return "すべて";
  }, [starred, mediaId]);

  if (loading) {
    return <p className="text-sm text-zinc-500">読み込み中…</p>;
  }

  if (deck.length === 0) {
    return (
      <div className="space-y-3">
        <Link href="/vocabulary" className="text-sm text-sky-600">
          ← Words に戻る
        </Link>
        <p className="text-sm text-zinc-500">練習する単語がありません（{label}）。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link href="/vocabulary" className="text-sm text-sky-600">
          ← Words
        </Link>
        <p className="text-xs text-zinc-500">
          {index + 1} / {deck.length} · {label}
        </p>
      </header>

      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-left shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
          {revealed ? "意味" : "語句（タップで表示）"}
        </p>
        <p className="mt-3 text-2xl font-bold leading-snug">
          {revealed ? card!.translation : card!.text}
        </p>
        {revealed && (
          <>
            <p className="mt-4 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {card!.text}
            </p>
            <p className="mt-2 text-sm text-zinc-500">{card!.contextPrimary}</p>
          </>
        )}
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-xl border border-zinc-300 py-2 text-sm dark:border-zinc-600"
          onClick={() => {
            setRevealed(false);
            setIndex((i) => (i > 0 ? i - 1 : deck.length - 1));
          }}
        >
          前へ
        </button>
        <button
          type="button"
          className="flex-1 rounded-xl bg-violet-600 py-2 text-sm font-medium text-white"
          onClick={() => {
            setRevealed(false);
            setIndex((i) => (i + 1 < deck.length ? i + 1 : 0));
          }}
        >
          次へ
        </button>
      </div>
    </div>
  );
}
