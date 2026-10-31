import Dexie, { type EntityTable } from "dexie";
import type {
  FavoriteRecord,
  GrammarJobRecord,
  MediaMeta,
  TranslationJobRecord,
  VocabNote,
} from "@/lib/db/types";

/** 字幕・メモのみ。動画 Blob は載せない → My List は即開く */
class ScriptPlayerMetaDb extends Dexie {
  mediaMeta!: EntityTable<MediaMeta, "id">;
  notes!: EntityTable<VocabNote, "id">;
  favorites!: EntityTable<FavoriteRecord, "id">;
  translationJobs!: EntityTable<TranslationJobRecord, "id">;
  grammarJobs!: EntityTable<GrammarJobRecord, "id">;

  constructor() {
    super("scriptPlayerMeta");
    this.version(1).stores({
      mediaMeta: "id, createdAt, title",
      notes: "id, mediaId, updatedAt",
      favorites: "id, mediaId, cueIndex",
    });
    this.version(2).stores({
      mediaMeta: "id, createdAt, title",
      notes: "id, mediaId, updatedAt",
      favorites: "id, mediaId, cueIndex",
      translationJobs: "id, mediaId, status, updatedAt",
    });
    this.version(3).stores({
      mediaMeta: "id, createdAt, title",
      notes: "id, mediaId, updatedAt",
      favorites: "id, mediaId, cueIndex",
      translationJobs: "id, mediaId, status, updatedAt",
      grammarJobs: "id, mediaId, status, updatedAt",
    });
  }
}

let metaDb: ScriptPlayerMetaDb | undefined;

export function getMetaDb(): ScriptPlayerMetaDb {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!metaDb) metaDb = new ScriptPlayerMetaDb();
  return metaDb;
}

export async function openMetaDb(): Promise<ScriptPlayerMetaDb> {
  const d = getMetaDb();
  await d.open();
  return d;
}
