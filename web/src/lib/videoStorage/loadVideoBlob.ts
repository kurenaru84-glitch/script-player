import { getVideoBlob, getDb } from "@/lib/db/clientDb";
import {
  preferOpfsForVideoStorage,
  readVideoFromOpfs,
  writeVideoToOpfs,
} from "@/lib/videoStorage/opfs";

let migratingIds = new Set<string>();

/** IndexedDB を正。OPFS は Android/Chrome 等でのみ試す（IDB は削除しない） */
export async function loadVideoBlob(mediaId: string): Promise<Blob> {
  const fromIdb = await getVideoBlob(mediaId);
  if (fromIdb && fromIdb.size > 0) {
    if (preferOpfsForVideoStorage() && !migratingIds.has(mediaId)) {
      migratingIds.add(mediaId);
      void writeVideoToOpfs(mediaId, fromIdb).finally(() =>
        migratingIds.delete(mediaId),
      );
    }
    return fromIdb;
  }

  if (preferOpfsForVideoStorage()) {
    const fromOpfs = await readVideoFromOpfs(mediaId);
    if (fromOpfs && fromOpfs.size > 0) {
      await getDb().videoBlobs.put({ id: mediaId, videoBlob: fromOpfs });
      return fromOpfs;
    }
  } else {
    const fromOpfs = await readVideoFromOpfs(mediaId);
    if (fromOpfs && fromOpfs.size > 0) {
      try {
        await getDb().videoBlobs.put({ id: mediaId, videoBlob: fromOpfs });
      } catch {
        /* クォータ不足時も OPFS から再生は試す */
      }
      return fromOpfs;
    }
  }

  throw new Error("動画データが見つかりません。Local Files から入れ直してください。");
}

export async function storeVideoBlob(mediaId: string, blob: Blob): Promise<void> {
  await getDb().videoBlobs.put({ id: mediaId, videoBlob: blob });
  if (preferOpfsForVideoStorage()) {
    try {
      await writeVideoToOpfs(mediaId, blob);
    } catch {
      /* IDB に保存済みなので続行 */
    }
  }
}

export async function removeVideoBlob(mediaId: string): Promise<void> {
  const { deleteVideoFromOpfs } = await import("@/lib/videoStorage/opfs");
  await deleteVideoFromOpfs(mediaId);
  await getDb().videoBlobs.delete(mediaId);
}
