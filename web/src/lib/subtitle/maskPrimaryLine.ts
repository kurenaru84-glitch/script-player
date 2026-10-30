/** ディクテ用：英文をマスク表示 */
export function maskPrimaryLine(primary: string): string {
  const len = Math.min(Math.max(primary.replace(/\s+/g, " ").trim().length, 8), 56);
  return "·".repeat(Math.ceil(len / 2));
}
