import { readLegacyVideoBlob } from "@/lib/db/legacyVideoBlob";
import {
  deleteVideoBlobFromVideoDb,
  getVideoBlobFromVideoDb,
  putVideoBlobToVideoDb,
} from "@/lib/db/videoDb";
import {
  isOpfsAvailable,
  readVideoFromOpfs,
  writeVideoToOpfs,
} from "@/lib/videoStorage/opfs";

/** MediaDict 同様、一覧では呼ばない。OPFS（Pixel Chrome 等）→ 旧 IDB → 予備 IDB */
export async function loadVideoBlob(mediaId: string): Promise<Blob> {
  if (isOpfsAvailable()) {
    const fromOpfs = await readVideoFromOpfs(mediaId);
    if (fromOpfs && fromOpfs.size > 0) return fromOpfs;
  }

  const fromLegacy = await readLegacyVideoBlob(mediaId);
  if (fromLegacy) {
    if (isOpfsAvailable()) {
      void writeVideoToOpfs(mediaId, fromLegacy);
    }
    return fromLegacy;
  }

  const fromVideoDb = await getVideoBlobFromVideoDb(mediaId);
  if (fromVideoDb && fromVideoDb.size > 0) {
    if (isOpfsAvailable()) {
      void writeVideoToOpfs(mediaId, fromVideoDb);
    }
    return fromVideoDb;
  }

  throw new Error("動画データが見つかりません。Local Files から入れ直してください。");
}

export async function storeVideoBlob(mediaId: string, blob: Blob): Promise<void> {
  if (isOpfsAvailable()) {
    await writeVideoToOpfs(mediaId, blob);
    return;
  }
  await putVideoBlobToVideoDb(mediaId, blob);
}

export async function removeVideoBlob(mediaId: string): Promise<void> {
  const { deleteVideoFromOpfs } = await import("@/lib/videoStorage/opfs");
  await deleteVideoFromOpfs(mediaId);
  await deleteVideoBlobFromVideoDb(mediaId);
}
