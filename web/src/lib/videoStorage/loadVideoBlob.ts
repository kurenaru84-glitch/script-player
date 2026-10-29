import { getVideoBlob, getDb } from "@/lib/db/clientDb";
import {
  isOpfsAvailable,
  readVideoFromOpfs,
  writeVideoToOpfs,
} from "@/lib/videoStorage/opfs";

let migratingIds = new Set<string>();

/** OPFS 優先 → 旧 IndexedDB Blob → 見つかったら OPFS へ移行 */
export async function loadVideoBlob(mediaId: string): Promise<Blob> {
  if (isOpfsAvailable()) {
    const fromOpfs = await readVideoFromOpfs(mediaId);
    if (fromOpfs) return fromOpfs;
  }

  const fromIdb = await getVideoBlob(mediaId);
  if (!fromIdb || fromIdb.size === 0) {
    throw new Error("動画データが見つかりません。Local Files から入れ直してください。");
  }

  if (isOpfsAvailable() && !migratingIds.has(mediaId)) {
    migratingIds.add(mediaId);
    void writeVideoToOpfs(mediaId, fromIdb)
      .then(() => getDb().videoBlobs.delete(mediaId))
      .finally(() => migratingIds.delete(mediaId));
  }

  return fromIdb;
}

export async function storeVideoBlob(mediaId: string, blob: Blob): Promise<void> {
  if (isOpfsAvailable()) {
    await writeVideoToOpfs(mediaId, blob);
    await getDb().videoBlobs.delete(mediaId);
    return;
  }
  await getDb().videoBlobs.put({ id: mediaId, videoBlob: blob });
}

export async function removeVideoBlob(mediaId: string): Promise<void> {
  const { deleteVideoFromOpfs } = await import("@/lib/videoStorage/opfs");
  await deleteVideoFromOpfs(mediaId);
  await getDb().videoBlobs.delete(mediaId);
}
