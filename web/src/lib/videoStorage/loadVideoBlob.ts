import { readLegacyVideoBlob } from "@/lib/db/legacyVideoBlob";
import {
  deleteVideoBlobFromVideoDb,
  getVideoBlobFromVideoDb,
  putVideoBlobToVideoDb,
} from "@/lib/db/videoDb";
import { getMediaMeta } from "@/lib/db/clientDb";
import {
  isOpfsAvailable,
  readVideoFromOpfs,
  writeVideoToOpfs,
} from "@/lib/videoStorage/opfs";
import { asPlayableVideoBlob } from "@/lib/videoStorage/videoBlob";

function sizeMismatch(blob: Blob, expected?: number): boolean {
  return expected != null && expected > 0 && blob.size !== expected;
}

/** MediaDict 同様、一覧では呼ばない。OPFS（Pixel Chrome 等）→ 旧 IDB → 予備 IDB */
export async function loadVideoBlob(mediaId: string): Promise<Blob> {
  const meta = await getMediaMeta(mediaId);
  const expectedSize = meta?.videoByteSize;

  if (isOpfsAvailable()) {
    const fromOpfs = await readVideoFromOpfs(mediaId);
    if (fromOpfs && fromOpfs.size > 0 && !sizeMismatch(fromOpfs, expectedSize)) {
      return fromOpfs;
    }
  }

  const fromLegacy = await readLegacyVideoBlob(mediaId);
  if (fromLegacy && !sizeMismatch(fromLegacy, expectedSize)) {
    const blob = asPlayableVideoBlob(fromLegacy);
    if (isOpfsAvailable()) {
      void writeVideoToOpfs(mediaId, blob);
    }
    return blob;
  }

  const fromVideoDb = await getVideoBlobFromVideoDb(mediaId);
  if (fromVideoDb && fromVideoDb.size > 0 && !sizeMismatch(fromVideoDb, expectedSize)) {
    const blob = asPlayableVideoBlob(fromVideoDb);
    if (isOpfsAvailable()) {
      void writeVideoToOpfs(mediaId, blob);
    }
    return blob;
  }

  if (expectedSize != null && expectedSize > 0) {
    throw new Error(
      "保存された動画ファイルが壊れているか未完成です。プロパティから MP4 を選び直すか、Local Files で再登録してください。",
    );
  }

  throw new Error("動画データが見つかりません。Local Files から入れ直してください。");
}

export async function storeVideoBlob(mediaId: string, blob: Blob): Promise<void> {
  const typed = asPlayableVideoBlob(blob);
  if (isOpfsAvailable()) {
    await writeVideoToOpfs(mediaId, typed);
    return;
  }
  await putVideoBlobToVideoDb(mediaId, typed);
}

export async function removeVideoBlob(mediaId: string): Promise<void> {
  const { deleteVideoFromOpfs } = await import("@/lib/videoStorage/opfs");
  await deleteVideoFromOpfs(mediaId);
  await deleteVideoBlobFromVideoDb(mediaId);
}
