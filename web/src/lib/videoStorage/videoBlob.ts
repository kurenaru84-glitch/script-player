export function asPlayableVideoBlob(blob: Blob): Blob {
  const type = blob.type?.trim();
  if (type && type.startsWith("video/")) return blob;
  return blob.slice(0, blob.size, "video/mp4");
}
