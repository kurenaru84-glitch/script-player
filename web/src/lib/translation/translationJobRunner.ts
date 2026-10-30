import { getMediaMeta, updateMedia } from "@/lib/db/clientDb";
import { getMetaDb, openMetaDb } from "@/lib/db/metaDb";
import type { TranslationJobRecord } from "@/lib/db/types";
import { fingerprintPrimarySrt } from "@/lib/translation/fingerprintPrimarySrt";
import { isTranslationFormatError } from "@/lib/gemini/retryableError";
import { isRateLimitError, translationRetryDelayMs } from "@/lib/gemini/retryDelay";
import { detectSourceLanguage } from "@/lib/translation/detectSourceLanguage";
import { translateLinesViaApi } from "@/lib/translation/translateBatchClient";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import { serializeSrt } from "@/lib/subtitle/serializeSrt";

const BATCH_SIZE = 8;
const PAUSE_BETWEEN_BATCH_MS = 4000;
/** 進捗（行数）が増えない時間 — 再試行の updatedAt では延長しない */
const STALE_PROGRESS_MS = 75_000;
const GLOBAL_RESUME_MS = 8_000;
/** 同一位置でこれ以上失敗したらプレースホルダを入れて先へ進む */
const SKIP_BATCH_AFTER_FAILURES = 5;

export type TranslationProgress = {
  done: number;
  total: number;
  status: TranslationJobRecord["status"];
  errorMessage?: string;
  updatedAt?: number;
};

export type TranslationProgressSnapshot = TranslationProgress & {
  mediaId: string;
};

type Listener = (p: TranslationProgress) => void;
type GlobalListener = (snapshots: TranslationProgressSnapshot[]) => void;

const listeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<GlobalListener>();
const lastProgressByMedia = new Map<string, TranslationProgressSnapshot>();
const runTokens = new Map<string, number>();
/** 実行中ループの token（finally で他ループの登録を消さない） */
const activeLoopToken = new Map<string, number>();
const batchAbortByMedia = new Map<string, AbortController>();

function jobId(mediaId: string): string {
  return mediaId;
}

/** 行数が増えないまま、かつジョブ自体も更新されていないときだけ true */
function isProgressStale(mediaId: string, job: TranslationJobRecord): boolean {
  if (job.status !== "running") return false;
  if (job.doneCues >= job.totalCues) return false;
  if (activeLoopToken.has(mediaId)) return false;
  if (job.nextAttemptAt != null && Date.now() < job.nextAttemptAt) return false;

  const lastLineProgress = job.lastProgressAt ?? job.updatedAt;
  if (Date.now() - lastLineProgress < STALE_PROGRESS_MS) return false;

  const idleMs = Date.now() - job.updatedAt;
  if (job.nextAttemptAt != null && Date.now() >= job.nextAttemptAt) {
    return idleMs > 45_000;
  }
  return idleMs > 180_000;
}

function shortError(message: string, max = 72): string {
  const one = message.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

function emitGlobal() {
  const list = [...lastProgressByMedia.values()].filter(
    (s) => s.status !== "done" && s.status !== "paused",
  );
  for (const fn of globalListeners) fn(list);
}

function emit(mediaId: string, job: TranslationJobRecord) {
  const p: TranslationProgress = {
    done: job.doneCues,
    total: job.totalCues,
    status: job.status,
    errorMessage: job.errorMessage,
    updatedAt: job.updatedAt,
  };
  for (const fn of listeners.get(mediaId) ?? []) fn(p);
  if (job.status === "done" || job.status === "paused") {
    lastProgressByMedia.delete(mediaId);
  } else {
    lastProgressByMedia.set(mediaId, { ...p, mediaId });
  }
  emitGlobal();
}

export function subscribeAllTranslationProgress(
  listener: GlobalListener,
): () => void {
  globalListeners.add(listener);
  listener([...lastProgressByMedia.values()].filter((s) => s.status !== "done"));
  void openMetaDb().then(async () => {
    const jobs = await getMetaDb().translationJobs.toArray();
    for (const j of jobs) {
      if (j.status === "done" || j.status === "paused") continue;
      lastProgressByMedia.set(j.mediaId, {
        mediaId: j.mediaId,
        done: j.doneCues,
        total: j.totalCues,
        status: j.status,
        errorMessage: j.errorMessage,
        updatedAt: j.updatedAt,
      });
    }
    emitGlobal();
  });
  return () => globalListeners.delete(listener);
}

export function subscribeTranslationProgress(
  mediaId: string,
  listener: Listener,
): () => void {
  if (!listeners.has(mediaId)) listeners.set(mediaId, new Set());
  listeners.get(mediaId)!.add(listener);
  void openMetaDb().then(async () => {
    const job = await getMetaDb().translationJobs.get(jobId(mediaId));
    if (job) emit(mediaId, job);
  });
  return () => listeners.get(mediaId)?.delete(listener);
}

async function savePartialTranslation(
  mediaId: string,
  primarySrt: string,
  lines: string[],
): Promise<void> {
  const cues = parseSrt(primarySrt);
  const merged = cues.map((cue, i) => ({
    ...cue,
    text: lines[i]?.trim() ?? "",
  }));
  await updateMedia(mediaId, { translationSrt: serializeSrt(merged) });
}

async function persistJobProgress(
  mediaId: string,
  primarySrt: string,
  next: TranslationJobRecord,
): Promise<void> {
  await upsertJob(next);
  try {
    await savePartialTranslation(mediaId, primarySrt, next.lines);
  } catch {
    /* IndexedDB 保存失敗でもジョブ進捗は保持 */
  }
  emit(mediaId, next);
}

async function upsertJob(job: TranslationJobRecord): Promise<void> {
  await openMetaDb();
  await getMetaDb().translationJobs.put(job);
}

function killActiveLoop(mediaId: string): void {
  runTokens.set(mediaId, (runTokens.get(mediaId) ?? 0) + 1);
  batchAbortByMedia.get(mediaId)?.abort();
  batchAbortByMedia.delete(mediaId);
  activeLoopToken.delete(mediaId);
}

function loopTokenMismatch(mediaId: string, token: number): boolean {
  return runTokens.get(mediaId) !== token;
}

function batchSizeForJob(job: TranslationJobRecord): number {
  const f = job.consecutiveFailures ?? 0;
  if (f >= 6) return 1;
  if (f >= 3) return 3;
  return BATCH_SIZE;
}

async function withScreenWakeLock<T>(fn: () => Promise<T>): Promise<T> {
  type WakeLockSentinel = { release: () => Promise<void> };
  type WakeLock = { request: (type: "screen") => Promise<WakeLockSentinel> };
  const nav = navigator as Navigator & { wakeLock?: WakeLock };
  let lock: WakeLockSentinel | undefined;
  try {
    lock = await nav.wakeLock?.request("screen");
  } catch {
    /* 拒否・非対応 */
  }
  try {
    return await fn();
  } finally {
    await lock?.release().catch(() => undefined);
  }
}

export async function getTranslationJob(
  mediaId: string,
): Promise<TranslationJobRecord | undefined> {
  await openMetaDb();
  return getMetaDb().translationJobs.get(jobId(mediaId));
}

/** 待機中・停止中ジョブを即座に 1 バッチ試す */
export async function kickTranslationJobNow(mediaId: string): Promise<void> {
  killActiveLoop(mediaId);
  const meta = await getMediaMeta(mediaId);
  if (!meta?.primarySrt?.trim()) {
    throw new Error("メイン字幕がありません");
  }
  let job = await getTranslationJob(mediaId);
  const fp = fingerprintPrimarySrt(meta.primarySrt);
  const cues = parseSrt(meta.primarySrt);
  if (cues.length === 0) throw new Error("メイン字幕が空です");

  if (!job || job.status === "done" || job.doneCues >= job.totalCues) {
    await startTranslationJob(mediaId);
    return;
  }
  if (job.totalCues !== cues.length) {
    throw new Error(
      "字幕の行数が変わりました。AI訳を長押し相当のやり直しが必要です（メディア画面から字幕を確認）",
    );
  }
  if (job.sourceFingerprint !== fp) {
    job = { ...job, sourceFingerprint: fp };
  }
  await upsertJob({
    ...job,
    status: "running",
    nextAttemptAt: Date.now(),
    errorMessage: "手動で再開しています…",
    updatedAt: Date.now(),
  });
  const kicked = await getTranslationJob(mediaId);
  if (kicked) emit(mediaId, kicked);
  void runLoop(mediaId, meta.primarySrt);
}

export async function cancelTranslationJob(mediaId: string): Promise<void> {
  killActiveLoop(mediaId);
  await openMetaDb();
  const existing = await getMetaDb().translationJobs.get(jobId(mediaId));
  if (existing && existing.status === "running") {
    await upsertJob({ ...existing, status: "paused", updatedAt: Date.now() });
    emit(mediaId, { ...existing, status: "paused" });
  }
}

export async function startTranslationJob(
  mediaId: string,
  opts?: { forceRestart?: boolean },
): Promise<void> {
  const meta = await getMediaMeta(mediaId);
  if (!meta?.primarySrt?.trim()) {
    throw new Error("メイン字幕がありません");
  }
  const fp = fingerprintPrimarySrt(meta.primarySrt);
  const cues = parseSrt(meta.primarySrt);
  if (cues.length === 0) throw new Error("メイン字幕が空です");

  await openMetaDb();
  let job = await getMetaDb().translationJobs.get(jobId(mediaId));
  const now = Date.now();

  const fingerprintOnlyChange =
    job &&
    job.sourceFingerprint !== fp &&
    job.totalCues === cues.length &&
    !opts?.forceRestart;

  if (fingerprintOnlyChange && job) {
    const repaired: TranslationJobRecord = {
      ...job,
      sourceFingerprint: fp,
      status: "running",
      errorMessage: undefined,
      nextAttemptAt: Date.now(),
      updatedAt: now,
    };
    job = repaired;
    await upsertJob(repaired);
    killActiveLoop(mediaId);
    emit(mediaId, repaired);
    void runLoop(mediaId, meta.primarySrt);
    return;
  }

  if (
    opts?.forceRestart ||
    !job ||
    job.sourceFingerprint !== fp ||
    job.totalCues !== cues.length
  ) {
    job = {
      id: jobId(mediaId),
      mediaId,
      sourceFingerprint: fp,
      totalCues: cues.length,
      doneCues: 0,
      lines: cues.map(() => ""),
      status: "running",
      consecutiveFailures: 0,
      lastProgressAt: now,
      nextAttemptAt: undefined,
      updatedAt: now,
    };
    await upsertJob(job);
  } else if (job.status === "done") {
    return;
  } else {
    job = {
      ...job,
      status: "running",
      errorMessage: undefined,
      consecutiveFailures: 0,
      lastProgressAt: job.lastProgressAt ?? now,
      nextAttemptAt: Date.now(),
      updatedAt: now,
    };
    await upsertJob(job);
  }

  killActiveLoop(mediaId);
  emit(mediaId, job);
  void runLoop(mediaId, meta.primarySrt);
}

function scheduleJobAttempt(
  job: TranslationJobRecord,
  patch: Partial<TranslationJobRecord> & { delayMs: number; errorMessage: string },
): TranslationJobRecord {
  const now = Date.now();
  return {
    ...job,
    ...patch,
    status: "running",
    nextAttemptAt: now + patch.delayMs,
    errorMessage: patch.errorMessage,
    updatedAt: now,
  };
}

/** 1 回の run で最大 1 バッチ（待機は IndexedDB の nextAttemptAt + 定期 tick） */
async function runLoop(mediaId: string, primarySrt: string): Promise<void> {
  if (activeLoopToken.has(mediaId)) return;

  const job = await getMetaDb().translationJobs.get(jobId(mediaId));
  if (!job || job.status !== "running") return;
  if (job.doneCues >= job.totalCues) return;
  if (job.nextAttemptAt != null && Date.now() < job.nextAttemptAt) return;

  const token = (runTokens.get(mediaId) ?? 0) + 1;
  runTokens.set(mediaId, token);
  activeLoopToken.set(mediaId, token);

  const sourceLanguage = detectSourceLanguage(
    parseSrt(primarySrt)
      .slice(0, 60)
      .map((c) => c.text),
  );

  try {
    await withScreenWakeLock(async () => {
      if (loopTokenMismatch(mediaId, token)) return;

      const current = await getMetaDb().translationJobs.get(jobId(mediaId));
      if (!current || current.status !== "running") return;
      if (current.doneCues >= current.totalCues) {
        const doneJob: TranslationJobRecord = {
          ...current,
          status: "done",
          errorMessage: undefined,
          consecutiveFailures: 0,
          nextAttemptAt: undefined,
          updatedAt: Date.now(),
        };
        await upsertJob(doneJob);
        emit(mediaId, doneJob);
        return;
      }

      const start = current.doneCues;
      const size = batchSizeForJob(current);
      const batchEnd = Math.min(start + size, current.totalCues);
      const cues = parseSrt(primarySrt);
      const batchTexts = cues.slice(start, batchEnd).map((c) => c.text);

      const batchAbort = new AbortController();
      batchAbortByMedia.set(mediaId, batchAbort);

      try {
        const translated = await translateLinesViaApi(batchTexts, {
          signal: batchAbort.signal,
          sourceLanguage,
        });
        batchAbortByMedia.delete(mediaId);

        if (loopTokenMismatch(mediaId, token)) return;

        const lines = [...current.lines];
        for (let i = 0; i < translated.length; i++) {
          lines[start + i] = translated[i] ?? "";
        }
        const now = Date.now();
        const hasMore = batchEnd < current.totalCues;
        const next: TranslationJobRecord = {
          ...current,
          lines,
          doneCues: batchEnd,
          consecutiveFailures: 0,
          errorMessage: undefined,
          lastProgressAt: now,
          nextAttemptAt: hasMore ? now + PAUSE_BETWEEN_BATCH_MS : undefined,
          updatedAt: now,
        };
        await persistJobProgress(mediaId, primarySrt, next);
      } catch (e) {
        batchAbortByMedia.delete(mediaId);
        if (loopTokenMismatch(mediaId, token)) return;

        const message = e instanceof Error ? e.message : "翻訳に失敗しました";
        if (/aborted|AbortError|中断されました/i.test(message)) return;

        const latest =
          (await getMetaDb().translationJobs.get(jobId(mediaId))) ?? current;
        if (latest.doneCues > current.doneCues) return;

        const failures = (latest.consecutiveFailures ?? 0) + 1;

        if (failures >= SKIP_BATCH_AFTER_FAILURES) {
          const lines = [...latest.lines];
          for (let i = 0; i < batchTexts.length; i++) {
            const idx = start + i;
            if (!lines[idx]?.trim()) {
              lines[idx] = `［要修正］${batchTexts[i] ?? ""}`;
            }
          }
          const now = Date.now();
          const hasMore = batchEnd < latest.totalCues;
          const skipped: TranslationJobRecord = {
            ...latest,
            lines,
            doneCues: batchEnd,
            consecutiveFailures: 0,
            errorMessage: `行${start + 1}付近をスキップして続行（${batchEnd}/${latest.totalCues}）`,
            lastProgressAt: now,
            nextAttemptAt: hasMore ? now + PAUSE_BETWEEN_BATCH_MS : undefined,
            updatedAt: now,
          };
          await persistJobProgress(mediaId, primarySrt, skipped);
          return;
        }

        const formatHint = isTranslationFormatError(message) ? "（JSON形式）" : "";
        const rateHint = isRateLimitError(message) ? " · API混雑" : "";
        const waitMs = translationRetryDelayMs(failures, message);
        const waiting = scheduleJobAttempt(latest, {
          consecutiveFailures: failures,
          delayMs: waitMs,
          errorMessage: `再試行${formatHint}${rateHint} · ${Math.max(1, Math.round(waitMs / 1000))}秒後（${latest.doneCues}/${latest.totalCues}） — ${shortError(message)}`,
        });
        await upsertJob(waiting);
        emit(mediaId, waiting);
      }
    });
  } finally {
    if (activeLoopToken.get(mediaId) === token) {
      activeLoopToken.delete(mediaId);
    }
    batchAbortByMedia.delete(mediaId);
  }
}

/** 未完了ジョブを再開 */
export async function resumeTranslationJobIfNeeded(mediaId: string): Promise<void> {
  let job = await getTranslationJob(mediaId);
  if (!job || job.status === "done" || job.status === "paused") return;
  if (job.doneCues >= job.totalCues) return;

  const meta = await getMediaMeta(mediaId);
  if (!meta?.primarySrt) return;
  const fp = fingerprintPrimarySrt(meta.primarySrt);
  if (job.sourceFingerprint !== fp) {
    if (job.totalCues !== parseSrt(meta.primarySrt).length) return;
    await upsertJob({ ...job, sourceFingerprint: fp, updatedAt: Date.now() });
    job = (await getTranslationJob(mediaId)) ?? job;
  }

  const loopAlive = activeLoopToken.has(mediaId);
  if (loopAlive) return;

  const waitOver = job.nextAttemptAt == null || Date.now() >= job.nextAttemptAt;
  const stale = isProgressStale(mediaId, job);

  if (stale) {
    await upsertJob({
      ...job,
      status: "running",
      nextAttemptAt: Date.now(),
      errorMessage: "長時間動かないため再スケジュール…",
      updatedAt: Date.now(),
    });
    const refreshed = await getTranslationJob(mediaId);
    if (refreshed) emit(mediaId, refreshed);
    void runLoop(mediaId, meta.primarySrt);
    return;
  }

  if ((job.status === "error" || waitOver) && waitOver) {
    void runLoop(mediaId, meta.primarySrt);
  }
}

let globalHooksInstalled = false;

export async function resumeAllIncompleteTranslationJobs(): Promise<void> {
  await openMetaDb();
  const jobs = await getMetaDb()
    .translationJobs.filter((j) => j.status === "running" || j.status === "error")
    .toArray();
  for (const j of jobs) {
    if (j.doneCues < j.totalCues) await resumeTranslationJobIfNeeded(j.mediaId);
  }
}

/** アプリ全体: タブ復帰・定期で止まった翻訳を再開 */
export function installTranslationGlobalResume(): void {
  if (globalHooksInstalled || typeof document === "undefined") return;
  globalHooksInstalled = true;

  const tick = () => void resumeAllIncompleteTranslationJobs();

  void tick();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
  window.addEventListener("focus", tick);
  window.addEventListener("pageshow", tick);

  setInterval(tick, GLOBAL_RESUME_MS);
}

/** @deprecated use installTranslationGlobalResume */
export function installTranslationVisibilityResume(): void {
  installTranslationGlobalResume();
}
