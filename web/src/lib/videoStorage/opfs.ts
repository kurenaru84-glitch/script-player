const VIDEOS_DIR = "videos";

export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    typeof navigator.storage.getDirectory === "function"
  );
}

/** iOS / Safari では OPFS の大容量書き込みが不安定なため IndexedDB を正とする */
export function preferOpfsForVideoStorage(): boolean {
  if (!isOpfsAvailable()) return false;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg/i.test(ua)) return false;
  return true;
}

async function videosDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(VIDEOS_DIR, { create: true });
}

function fileName(mediaId: string): string {
  return `${mediaId}.mp4`;
}

export async function writeVideoToOpfs(mediaId: string, blob: Blob): Promise<void> {
  const dir = await videosDir();
  const handle = await dir.getFileHandle(fileName(mediaId), { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function readVideoFromOpfs(mediaId: string): Promise<Blob | null> {
  try {
    const dir = await videosDir();
    const handle = await dir.getFileHandle(fileName(mediaId));
    const file = await handle.getFile();
    if (file.size === 0) return null;
    return file;
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
