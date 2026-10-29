import Dexie, { type EntityTable } from "dexie";

/** 字幕・タイトルなど（動画 Blob は含まない → 高速） */
export type MediaMeta = {
  id: string;
  title: string;
  primarySrt: string;
  translationSrt: string;
  createdAt: number;
};

/** @deprecated 互換用。list では Blob を載せない */
export type MediaRecord = MediaMeta & {
  videoBlob?: Blob;
};

export type VocabNote = {
  id: string;
  mediaId: string;
  cueIndex: number;
  primaryLine: string;
  translationLine: string;
  body: string;
  updatedAt: number;
};

export type FavoriteRecord = {
  id: string;
  mediaId: string;
  cueIndex: number;
};

type LegacyMediaRow = MediaMeta & { videoBlob?: Blob };

type VideoBlobRow = {
  id: string;
  videoBlob: Blob;
};

class ScriptPlayerDb extends Dexie {
  media!: EntityTable<LegacyMediaRow, "id">;
  mediaMeta!: EntityTable<MediaMeta, "id">;
  videoBlobs!: EntityTable<VideoBlobRow, "id">;
  notes!: EntityTable<VocabNote, "id">;
  favorites!: EntityTable<FavoriteRecord, "id">;

  constructor() {
    super("scriptPlayerWeb");
    this.version(1).stores({
      media: "id, createdAt, title",
      notes: "id, mediaId, updatedAt",
    });
    this.version(2).stores({
      media: "id, createdAt, title",
      notes: "id, mediaId, updatedAt",
      favorites: "id, mediaId, cueIndex",
    });
    this.version(3)
      .stores({
        mediaMeta: "id, createdAt, title",
        videoBlobs: "id",
        notes: "id, mediaId, updatedAt",
        favorites: "id, mediaId, cueIndex",
        media: null,
      })
      .upgrade(async (tx) => {
        const legacyTable = tx.table<LegacyMediaRow>("media");
        const legacyCount = await legacyTable.count();
        if (legacyCount === 0) return;

        const metaTable = tx.table("mediaMeta");
        const migratedIds = new Set(await metaTable.toCollection().primaryKeys());

        await legacyTable.each(async (row) => {
          if (migratedIds.has(row.id)) return;
          const { videoBlob, ...meta } = row;
          await metaTable.put(meta);
          if (videoBlob) {
            await tx.table("videoBlobs").put({ id: row.id, videoBlob });
          }
        });
      });
    this.version(4)
      .stores({
        mediaMeta: "id, createdAt, title",
        videoBlobs: "id",
        notes: "id, mediaId, updatedAt",
        favorites: "id, mediaId, cueIndex",
      })
      .upgrade(async (tx) => {
        const metaTable = tx.table("mediaMeta");
        const blobIds = await tx.table("videoBlobs").toCollection().primaryKeys();
        for (const id of blobIds) {
          const meta = await metaTable.get(id);
          if (meta) continue;
          await metaTable.put({
            id,
            title: `復元 ${String(id).slice(0, 8)}`,
            primarySrt: "",
            translationSrt: "",
            createdAt: Date.now(),
          });
        }
      });
  }
}

let db: ScriptPlayerDb | undefined;

export function getDb(): ScriptPlayerDb {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!db) db = new ScriptPlayerDb();
  return db;
}

/** 初回オープン（マイグレーション含む）を待つ */
export async function openScriptPlayerDb(): Promise<ScriptPlayerDb> {
  const d = getDb();
  await d.open();
  return d;
}

export type MediaListItem = Pick<MediaMeta, "id" | "title" | "createdAt">;

export async function listMediaListItems(): Promise<MediaListItem[]> {
  const d = await openScriptPlayerDb();
  const rows = await d.mediaMeta.orderBy("createdAt").reverse().toArray();
  return rows.map(({ id, title, createdAt }) => ({ id, title, createdAt }));
}

export async function getStorageDiagnostics(): Promise<{
  mediaMetaCount: number;
  videoBlobCount: number;
}> {
  const d = await openScriptPlayerDb();
  const [mediaMetaCount, videoBlobCount] = await Promise.all([
    d.mediaMeta.count(),
    d.videoBlobs.count(),
  ]);
  return { mediaMetaCount, videoBlobCount };
}

export function noteId(mediaId: string, cueIndex: number): string {
  return `${mediaId}_${cueIndex}`;
}

export function favoriteId(mediaId: string, cueIndex: number): string {
  return noteId(mediaId, cueIndex);
}

/** My List 用 — 動画 Blob は読まない */
export async function listMedia(): Promise<MediaMeta[]> {
  const d = await openScriptPlayerDb();
  return d.mediaMeta.orderBy("createdAt").reverse().toArray();
}

export async function getMediaMeta(id: string): Promise<MediaMeta | undefined> {
  return getDb().mediaMeta.get(id);
}

export async function getVideoBlob(id: string): Promise<Blob | undefined> {
  const row = await getDb().videoBlobs.get(id);
  return row?.videoBlob;
}

/** 互換: メタ + Blob（重いのでプレイヤー以外では使わない） */
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
  const existing = await getDb().mediaMeta.get(id);
  await getDb().mediaMeta.put({
    id,
    title: input.title,
    primarySrt: input.primarySrt,
    translationSrt: input.translationSrt,
    createdAt: existing?.createdAt ?? Date.now(),
  });
  return id;
}

/** 字幕・タイトルのみ更新（動画 Blob を再書き込みしない） */
export async function updateMedia(
  id: string,
  patch: Partial<Pick<MediaMeta, "title" | "primarySrt" | "translationSrt">>,
): Promise<void> {
  const existing = await getMediaMeta(id);
  if (!existing) throw new Error("メディアが見つかりません");
  await getDb().mediaMeta.put({ ...existing, ...patch });
}

export async function deleteMedia(id: string): Promise<void> {
  const database = getDb();
  const { removeVideoBlob } = await import("@/lib/videoStorage/loadVideoBlob");
  await removeVideoBlob(id);
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
  const trimmed = input.body.trim();
  const id = noteId(input.mediaId, input.cueIndex);
  if (!trimmed) {
    await getDb().notes.delete(id);
    return;
  }
  await getDb().notes.put({
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
  return getDb().notes.get(noteId(mediaId, cueIndex));
}

export async function listNotes(): Promise<VocabNote[]> {
  return getDb().notes.orderBy("updatedAt").reverse().toArray();
}

export async function noteCueIndices(mediaId: string): Promise<Set<number>> {
  const rows = await getDb().notes.where("mediaId").equals(mediaId).toArray();
  return new Set(rows.map((r) => r.cueIndex));
}

export async function favoriteCueIndices(mediaId: string): Promise<Set<number>> {
  const rows = await getDb().favorites.where("mediaId").equals(mediaId).toArray();
  return new Set(rows.map((r) => r.cueIndex));
}

export async function toggleFavorite(
  mediaId: string,
  cueIndex: number,
): Promise<Set<number>> {
  const id = favoriteId(mediaId, cueIndex);
  const table = getDb().favorites;
  const existing = await table.get(id);
  if (existing) {
    await table.delete(id);
  } else {
    await table.put({ id, mediaId, cueIndex });
  }
  return favoriteCueIndices(mediaId);
}
