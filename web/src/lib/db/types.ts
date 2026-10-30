export type MediaMeta = {
  id: string;
  title: string;
  primarySrt: string;
  translationSrt: string;
  createdAt: number;
  /** OPFS 保存後の整合性チェック用（バイト） */
  videoByteSize?: number;
};

export type VocabNote = {
  id: string;
  mediaId: string;
  cueIndex: number;
  primaryLine: string;
  translationLine: string;
  body: string;
  updatedAt: number;
};

export type FavoriteRecord = {
  id: string;
  mediaId: string;
  cueIndex: number;
};

/** AI 翻訳 SRT の途中経過（再開・バックグラウンド用） */
export type TranslationJobRecord = {
  id: string;
  mediaId: string;
  /** primarySrt の簡易指紋（差し替え検知） */
  sourceFingerprint: string;
  totalCues: number;
  /** 翻訳済み行数（0..totalCues） */
  doneCues: number;
  /** 各行の翻訳（未着手は空文字） */
  lines: string[];
  status: "running" | "paused" | "done" | "error";
  errorMessage?: string;
  /** 同じ位置で連続失敗（リトライ上限用） */
  consecutiveFailures?: number;
  /** doneCues が最後に進んだ時刻（再試行だけでは更新しない） */
  lastProgressAt?: number;
  updatedAt: number;
};
