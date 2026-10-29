import { asPlayableVideoBlob } from "@/lib/videoStorage/videoBlob";

const VIDEOS_DIR = "videos";
const WRITE_CHUNK_BYTES = 4 * 1024 * 1024;

export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    typeof navigator.storage.getDirectory === "function"
  );
}

async function videosDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(VIDEOS_DIR, { create: true });
}

function fileName(mediaId: string): string {
  return `${mediaId}.mp4`;
}

export async function writeVideoToOpfs(mediaId: string, blob: Blob): Promise<void> {
  const typed = asPlayableVideoBlob(blob);
  const dir = await videosDir();
  const handle = await dir.getFileHandle(fileName(mediaId), { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.truncate(0);
    if (typed.size <= WRITE_CHUNK_BYTES) {
      await writable.write(typed);
    } else {
      let offset = 0;
      while (offset < typed.size) {
        const end = Math.min(offset + WRITE_CHUNK_BYTES, typed.size);
        const chunk = typed.slice(offset, end);
        await writable.write({ type: "write", position: offset, data: chunk });
        offset = end;
      }
    }
  } finally {
    await writable.close();
  }

  const file = await handle.getFile();
  if (file.size !== typed.size) {
    await dir.removeEntry(fileName(mediaId)).catch(() => {});
    throw new Error(
      `動画の保存が途中で止まりました（${file.size} / ${typed.size} bytes）。もう一度 Local Files から登録してください。`,
    );
  }
}

export async function readVideoFromOpfs(mediaId: string): Promise<Blob | null> {
  try {
    const dir = await videosDir();
    const handle = await dir.getFileHandle(fileName(mediaId));
    const file = await handle.getFile();
    if (file.size === 0) return null;
    return asPlayableVideoBlob(file);
  } catch {
    return null;
  }
}

export async function deleteVideoFromOpfs(mediaId: string): Promise<void> {
  try {
    const dir = await videosDir();
    await dir.removeEntry(fileName(mediaId));
  } catch {
    /* already gone */
  }
}

export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage.persist?.();
  } catch {
    /* ignore */
  }
}
