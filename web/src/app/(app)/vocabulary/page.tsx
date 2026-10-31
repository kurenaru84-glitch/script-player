"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteSavedWord,
  listMediaListItems,
  listNotes,
  listSavedWords,
  updateSavedWord,
  type SavedWord,
  type VocabNote,
} from "@/lib/db/clientDb";
import { translatePhraseViaApi } from "@/lib/readlang/translatePhraseClient";

type Tab = "words" | "lineNotes";

export default function VocabularyPage() {
  const [tab, setTab] = useState<Tab>("words");
  const [words, setWords] = useState<SavedWord[]>([]);
  const [notes, setNotes] = useState<VocabNote[]>([]);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<string>("all");
  const [translatingId, setTranslatingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [w, n, media] = await Promise.all([
      listSavedWords(),
      listNotes(),
      listMediaListItems(),
    ]);
    setWords(w);
    setNotes(n);
    setTitles(new Map(media.map((m) => [m.id, m.title])));
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const mediaOptions = useMemo(() => {
    const ids = [...new Set(words.map((w) => w.mediaId))];
    return ids.map((id) => ({ id, title: titles.get(id) ?? "（不明）", count: words.filter((w) => w.mediaId === id).length }));
  }, [words, titles]);

  const filteredWords = useMemo(() => {
    let rows = words;
    if (starredOnly) rows = rows.filter((w) => w.starred);
    if (mediaFilter !== "all") rows = rows.filter((w) => w.mediaId === mediaFilter);
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (w) =>
        w.text.toLowerCase().includes(q) ||
        w.translation.toLowerCase().includes(q) ||
        w.contextPrimary.toLowerCase().includes(q),
    );
  }, [words, starredOnly, mediaFilter, query]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Words</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Readlang 風：選択した語句・文脈つき。★ で重要語、練習はフラッシュカードへ。
        </p>
      </header>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("words")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            tab === "words" ? "bg-sky-600 text-white" : "bg-zinc-200 dark:bg-zinc-800"
          }`}
        >
          単語リスト
        </button>
        <button
          type="button"
          onClick={() => setTab("lineNotes")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            tab === "lineNotes" ? "bg-sky-600 text-white" : "bg-zinc-200 dark:bg-zinc-800"
          }`}
        >
          セリフメモ
        </button>
      </div>

      {tab === "words" && (
        <>
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="語句・訳・文脈で検索"
              className="min-w-[12rem] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <Link
              href={`/vocabulary/practice?${starredOnly ? "starred=1&" : ""}${mediaFilter !== "all" ? `mediaId=${mediaFilter}` : ""}`}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white"
            >
              フラッシュカード
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={starredOnly}
                onChange={(e) => setStarredOnly(e.target.checked)}
              />
              ★ のみ
            </label>
            <select
              value={mediaFilter}
              onChange={(e) => setMediaFilter(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="all">すべての作品</option>
              {mediaOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({m.count})
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">読み込み中…</p>
          ) : filteredWords.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-600">
              単語はまだありません。プレイヤーで字幕の語句を選択してください。
            </p>
          ) : (
            <ul className="space-y-3">
              {filteredWords.map((word) => (
                <li
                  key={word.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">{word.text}</p>
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                        value={word.translation}
                        placeholder="意味（空でも保存可 → あとで入力）"
                        onChange={(e) =>
                          setWords((prev) =>
                            prev.map((w) =>
                              w.id === word.id ? { ...w, translation: e.target.value } : w,
                            ),
                          )
                        }
                        onBlur={() =>
                          void updateSavedWord(word.id, {
                            translation: word.translation,
                          }).then(reload)
                        }
                      />
                      {!word.translation.trim() && (
                        <button
                          type="button"
                          disabled={translatingId === word.id}
                          className="mt-1 text-xs font-medium text-sky-600 disabled:opacity-50"
                          onClick={() => {
                            setTranslatingId(word.id);
                            void translatePhraseViaApi(word.text, {
                              context: `${word.contextPrimary}\n${word.contextTranslation}`,
                            })
                              .then((tr) =>
                                updateSavedWord(word.id, { translation: tr }).then(reload),
                              )
                              .finally(() => setTranslatingId(null));
                          }}
                        >
                          {translatingId === word.id ? "AI翻訳中…" : "AI で翻訳"}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-xl leading-none"
                      aria-label="お気に入り"
                      onClick={() =>
                        void updateSavedWord(word.id, { starred: !word.starred }).then(reload)
                      }
                    >
                      {word.starred ? "★" : "☆"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {titles.get(word.mediaId) ?? "作品"} · 行 {word.cueIndex + 1}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {word.contextPrimary}
                  </p>
                  {word.contextTranslation && (
                    <p className="text-sm text-zinc-500">{word.contextTranslation}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link
                      href={`/player/${word.mediaId}?cue=${word.cueIndex}`}
                      className="text-sky-600"
                    >
                      プレイヤーで開く
                    </Link>
                    <button
                      type="button"
                      className="text-red-600"
                      onClick={() => void deleteSavedWord(word.id).then(reload)}
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "lineNotes" && (
        <>
          {loading ? (
            <p className="text-sm text-zinc-500">読み込み中…</p>
          ) : notes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-600">
              セリフメモはまだありません。
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
                  {note.grammarBody && (
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-amber-50/80 p-2 text-sm leading-relaxed text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                      {note.grammarBody}
                    </p>
                  )}
                  {note.body && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                      {note.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
