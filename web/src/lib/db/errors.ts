export function formatStorageError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return "ストレージ容量が足りません。短い動画で試すか、ブラウザのサイトデータを整理してください。";
    }
    return error.message || error.name;
  }
  if (error instanceof Error) return error.message;
  return "保存に失敗しました";
}
