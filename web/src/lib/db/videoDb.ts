import Dexie, { type EntityTable } from "dexie";

type VideoBlobRow = {
  id: string;
  videoBlob: Blob;
};

/** OPFS 非対応ブラウザ用。My List では開かない */
class ScriptPlayerVideoDb extends Dexie {
  videoBlobs!: EntityTable<VideoBlobRow, "id">;

  constructor() {
    super("scriptPlayerVideo");
    this.version(1).stores({ videoBlobs: "id" });
  }
}

let videoDb: ScriptPlayerVideoDb | undefined;

export function getVideoDb(): ScriptPlayerVideoDb {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!videoDb) videoDb = new ScriptPlayerVideoDb();
  return videoDb;
}

export async function getVideoBlobFromVideoDb(
  mediaId: string,
): Promise<Blob | undefined> {
  const d = getVideoDb();
  await d.open();
  const row = await d.videoBlobs.get(mediaId);
  return row?.videoBlob;
}

export async function putVideoBlobToVideoDb(
  mediaId: string,
  blob: Blob,
): Promise<void> {
  const d = getVideoDb();
  await d.open();
  await d.videoBlobs.put({ id: mediaId, videoBlob: blob });
}

export async function deleteVideoBlobFromVideoDb(mediaId: string): Promise<void> {
  const d = getVideoDb();
  await d.open();
  await d.videoBlobs.delete(mediaId);
}
