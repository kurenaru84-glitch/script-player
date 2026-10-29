import { loadVideoBlob } from "@/lib/videoStorage/loadVideoBlob";

const urlByMediaId = new Map<string, string>();
const loadingByMediaId = new Map<string, Promise<string>>();

export function peekVideoObjectUrl(mediaId: string): string | undefined {
  return urlByMediaId.get(mediaId);
}

export async function loadVideoObjectUrl(mediaId: string): Promise<string> {
  const cached = urlByMediaId.get(mediaId);
  if (cached) return cached;

  const inflight = loadingByMediaId.get(mediaId);
  if (inflight) return inflight;

  const task = (async () => {
    const blob = await loadVideoBlob(mediaId);
    const url = URL.createObjectURL(blob);
    urlByMediaId.set(mediaId, url);
    return url;
  })();

  loadingByMediaId.set(mediaId, task);
  try {
    return await task;
  } finally {
    loadingByMediaId.delete(mediaId);
  }
}

export function warmVideoObjectUrl(mediaId: string, blob: Blob): string {
  const prev = urlByMediaId.get(mediaId);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  urlByMediaId.set(mediaId, url);
  return url;
}

export function releaseVideoObjectUrl(mediaId: string): void {
  const url = urlByMediaId.get(mediaId);
  if (url) URL.revokeObjectURL(url);
  urlByMediaId.delete(mediaId);
  loadingByMediaId.delete(mediaId);
}
