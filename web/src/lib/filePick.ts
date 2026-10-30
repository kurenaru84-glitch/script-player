/**
 * Android で「Files by Google」等の汎用ファイル UI を開く。
 * video/* や image/* を付けるとギャラリー系に寄るため、すべて * / * に統一する。
 */
export const UNIFIED_FILE_INPUT_ACCEPT = "*/*";

export function isVideoFile(file: File): boolean {
  if (/\.(mp4|m4v|webm|mkv)$/i.test(file.name)) return true;
  if (file.type.startsWith("video/")) return true;
  return false;
}

export function isSrtFile(file: File): boolean {
  if (/\.srt$/i.test(file.name)) return true;
  if (file.type === "text/plain" || file.type === "application/x-subrip") return true;
  return false;
}

export function videoPickError(file: File): string | null {
  return isVideoFile(file)
    ? null
    : `動画ファイル（MP4 など）を選んでください: ${file.name}`;
}

export function srtPickError(file: File): string | null {
  return isSrtFile(file) ? null : `SRT ファイル（.srt）を選んでください: ${file.name}`;
}
