import Dexie, { type EntityTable } from "dexie";

export type MediaRecord = {
  id: string;
  title: string;
  videoBlob: Blob;
  primarySrt: string;
  translationSrt: string;
  createdAt: number;
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

class ScriptPlayerDb extends Dexie {
  media!: EntityTable<MediaRecord, "id">;
  notes!: EntityTable<VocabNote, "id">;

  constructor() {
    super("scriptPlayerWeb");
    this.version(1).stores({
      media: "id, createdAt, title",
      notes: "id, mediaId, updatedAt",
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

export function noteId(mediaId: string, cueIndex: number): string {
  return `${mediaId}_${cueIndex}`;
}

export async function listMedia(): Promise<MediaRecord[]> {
  return getDb().media.orderBy("createdAt").reverse().toArray();
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  return getDb().media.get(id);
}

export async function saveMedia(input: Omit<MediaRecord, "id" | "createdAt"> & { id?: string }): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  await getDb().media.put({
    id,
    title: input.title,
    videoBlob: input.videoBlob,
    primarySrt: input.primarySrt,
    translationSrt: input.translationSrt,
    createdAt: Date.now(),
  });
  return id;
}

export async function deleteMedia(id: string): Promise<void> {
  const database = getDb();
  await database.media.delete(id);
  await database.notes.where("mediaId").equals(id).delete();
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
