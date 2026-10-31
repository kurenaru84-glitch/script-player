export type MediaMeta = {
  id: string;
  title: string;
  primarySrt: string;
  translationSrt: string;
  createdAt: number;
  /** OPFS 保存後の整合性チェック用（バイト） */
  videoByteSize?: number;
  /** 読み込み時に文の途中で切れた字幕を自動結合（既定 true） */
  subtitleAutoMerge?: boolean;
};

export type VocabNote = {
  id: string;
  mediaId: string;
  cueIndex: number;
  primaryLine: string;
  translationLine: string;
  body: string;
  /** AI 文法解説（手動編集可） */
  grammarBody?: string;
  updatedAt: number;
};

/** セリフごとの AI 文法解説ジョブ */
export type GrammarJobRecord = {
  id: string;
  mediaId: string;
  sourceFingerprint: string;
  totalCues: number;
  doneCues: number;
  lines: string[];
  status: "running" | "paused" | "done" | "error";
  errorMessage?: string;
  consecutiveFailures?: number;
  lastProgressAt?: number;
  nextAttemptAt?: number;
  updatedAt: number;
};

export type FavoriteRecord = {
  id: string;
  mediaId: string;
  cueIndex: number;
};

/** Readlang 風：選択した語句＋文脈 */
export type SavedWord = {
  id: string;
  mediaId: string;
  cueIndex: number;
  /** 選択した語句・フレーズ */
  text: string;
  /** 日本語の意味（AI または手入力） */
  translation: string;
  contextPrimary: string;
  contextTranslation: string;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
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
  /** この時刻以降に次バッチを試す（ループ内 sleep しない） */
  nextAttemptAt?: number;
  updatedAt: number;
};
