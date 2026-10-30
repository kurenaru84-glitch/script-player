const KEY = "scriptPlayer.lastMediaId";

export function setLastMediaId(mediaId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(KEY, mediaId);
}

export function getLastMediaId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(KEY);
}
