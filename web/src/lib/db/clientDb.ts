import { getMetaDb, openMetaDb } from "@/lib/db/metaDb";
import { migrateLegacyMetaIfNeeded } from "@/lib/db/legacyMigrate";

export type { FavoriteRecord, MediaMeta, VocabNote } from "@/lib/db/types";
import type { MediaMeta, VocabNote } from "@/lib/db/types";

export type MediaRecord = MediaMeta & {
  videoBlob?: Blob;
};

export { openMetaDb, openMetaDb as openScriptPlayerDb } from "@/lib/db/metaDb";
export { wipeAllScriptPlayerStorage } from "@/lib/db/legacyMigrate";

/** My List / プレイヤー共通 — 旧 DB のマイグレーションはタイムアウト付きでメタのみ */
export async function prepareLocalAppStorage(): Promise<void> {
  await migrateLegacyMetaIfNeeded();
  await openMetaDb();
}

export type MediaListItem = Pick<MediaMeta, "id" | "title" | "createdAt">;

export async function listMediaListItems(): Promise<MediaListItem[]> {
  await prepareLocalAppStorage();
  const rows = await getMetaDb()
    .mediaMeta.orderBy("createdAt")
    .reverse()
    .toArray();
  return rows.map(({ id, title, createdAt }) => ({ id, title, createdAt }));
}

export async function getStorageDiagnostics(): Promise<{
  mediaMetaCount: number;
}> {
  await prepareLocalAppStorage();
  return { mediaMetaCount: await getMetaDb().mediaMeta.count() };
}

export function noteId(mediaId: string, cueIndex: number): string {
  return `${mediaId}_${cueIndex}`;
}

export function favoriteId(mediaId: string, cueIndex: number): string {
  return noteId(mediaId, cueIndex);
}

export async function listMedia(): Promise<MediaMeta[]> {
  await prepareLocalAppStorage();
  return getMetaDb().mediaMeta.orderBy("createdAt").reverse().toArray();
}

export async function getMediaMeta(id: string): Promise<MediaMeta | undefined> {
  await openMetaDb();
  return getMetaDb().mediaMeta.get(id);
}

/** @deprecated プレイヤーは loadVideoBlob を使う */
export async function getVideoBlob(id: string): Promise<Blob | undefined> {
  const { loadVideoBlob } = await import("@/lib/videoStorage/loadVideoBlob");
  try {
    return await loadVideoBlob(id);
  } catch {
    return undefined;
  }
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  const meta = await getMediaMeta(id);
  if (!meta) return undefined;
  const videoBlob = await getVideoBlob(id);
  return { ...meta, videoBlob };
}

export async function saveMedia(
  input: Omit<MediaMeta, "id" | "createdAt"> & {
    id?: string;
    videoBlob: Blob;
  },
): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  const { storeVideoBlob } = await import("@/lib/videoStorage/loadVideoBlob");
  await storeVideoBlob(id, input.videoBlob);
  await openMetaDb();
  const existing = await getMetaDb().mediaMeta.get(id);
  await getMetaDb().mediaMeta.put({
    id,
    title: input.title,
    primarySrt: input.primarySrt,
    translationSrt: input.translationSrt,
    createdAt: existing?.createdAt ?? Date.now(),
    videoByteSize: input.videoBlob.size,
  });
  return id;
}

export async function updateMedia(
  id: string,
  patch: Partial<
    Pick<
      MediaMeta,
      "title" | "primarySrt" | "translationSrt" | "videoByteSize" | "subtitleAutoMerge"
    >
  >,
): Promise<void> {
  const existing = await getMediaMeta(id);
  if (!existing) throw new Error("メディアが見つかりません");
  await getMetaDb().mediaMeta.put({ ...existing, ...patch });
}

export async function deleteMedia(id: string): Promise<void> {
  const { removeVideoBlob } = await import("@/lib/videoStorage/loadVideoBlob");
  await removeVideoBlob(id);
  const database = getMetaDb();
  await database.mediaMeta.delete(id);
  await database.notes.where("mediaId").equals(id).delete();
  await database.favorites.where("mediaId").equals(id).delete();
}

export async function saveNote(input: {
  mediaId: string;
  cueIndex: number;
  primaryLine: string;
  translationLine: string;
  body: string;
}): Promise<void> {
  await openMetaDb();
  const trimmed = input.body.trim();
  const id = noteId(input.mediaId, input.cueIndex);
  if (!trimmed) {
    await getMetaDb().notes.delete(id);
    return;
  }
  await getMetaDb().notes.put({
    id,
    mediaId: input.mediaId,
    cueIndex: input.cueIndex,
    primaryLine: input.primaryLine,
    translationLine: input.translationLine,
    body: trimmed,
    updatedAt: Date.now(),
  });
}

export async function getNote(
  mediaId: string,
  cueIndex: number,
): Promise<VocabNote | undefined> {
  await openMetaDb();
  return getMetaDb().notes.get(noteId(mediaId, cueIndex));
}

export async function listNotes(): Promise<VocabNote[]> {
  await prepareLocalAppStorage();
  return getMetaDb().notes.orderBy("updatedAt").reverse().toArray();
}

export async function noteCueIndices(mediaId: string): Promise<Set<number>> {
  await openMetaDb();
  const rows = await getMetaDb().notes.where("mediaId").equals(mediaId).toArray();
  return new Set(rows.map((r) => r.cueIndex));
}

export async function favoriteCueIndices(mediaId: string): Promise<Set<number>> {
  await openMetaDb();
  const rows = await getMetaDb().favorites.where("mediaId").equals(mediaId).toArray();
  return new Set(rows.map((r) => r.cueIndex));
}

export async function toggleFavorite(
  mediaId: string,
  cueIndex: number,
): Promise<Set<number>> {
  await openMetaDb();
  const id = favoriteId(mediaId, cueIndex);
  const table = getMetaDb().favorites;
  const existing = await table.get(id);
  if (existing) {
    await table.delete(id);
  } else {
    await table.put({ id, mediaId, cueIndex });
  }
  return favoriteCueIndices(mediaId);
}
