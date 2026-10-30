import { getMediaMeta, updateMedia } from "@/lib/db/clientDb";
import { getMetaDb, openMetaDb } from "@/lib/db/metaDb";
import type { TranslationJobRecord } from "@/lib/db/types";
import { fingerprintPrimarySrt } from "@/lib/translation/fingerprintPrimarySrt";
import {
  isTranslationFormatError,
  backoffMs,
  sleep,
} from "@/lib/gemini/retryableError";
import { translateLinesViaApi } from "@/lib/translation/translateBatchClient";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import { serializeSrt } from "@/lib/subtitle/serializeSrt";

const BATCH_SIZE = 10;
const PAUSE_BETWEEN_BATCH_MS = 2200;
const MAX_BATCH_FAILURES = 18;
/** 進捗（行数）が増えない時間 — 再試行の updatedAt では延長しない */
const STALE_PROGRESS_MS = 90_000;
const AUTO_COOLDOWN_MS = 75_000;
const GLOBAL_RESUME_MS = 15_000;

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

function progressTimestamp(job: TranslationJobRecord): number {
  return job.lastProgressAt ?? job.updatedAt;
}

function isProgressStale(job: TranslationJobRecord): boolean {
  if (job.status !== "running") return false;
  if (job.doneCues >= job.totalCues) return false;
  return Date.now() - progressTimestamp(job) >= STALE_PROGRESS_MS;
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
      updatedAt: now,
    };
    await upsertJob(job);
  }

  killActiveLoop(mediaId);
  emit(mediaId, job);
  void runLoop(mediaId, meta.primarySrt);
}

async function runLoop(mediaId: string, primarySrt: string): Promise<void> {
  if (activeLoopToken.has(mediaId)) return;
  const token = (runTokens.get(mediaId) ?? 0) + 1;
  runTokens.set(mediaId, token);
  activeLoopToken.set(mediaId, token);

  try {
    await withScreenWakeLock(async () => {
      while (true) {
        if (loopTokenMismatch(mediaId, token)) return;

        const job = await getMetaDb().translationJobs.get(jobId(mediaId));
        if (!job || job.status !== "running") return;
        if (job.doneCues >= job.totalCues) {
          const doneJob: TranslationJobRecord = {
            ...job,
            status: "done",
            errorMessage: undefined,
            consecutiveFailures: 0,
            updatedAt: Date.now(),
          };
          await upsertJob(doneJob);
          emit(mediaId, doneJob);
          return;
        }

        const start = job.doneCues;
        const size = batchSizeForJob(job);
        const batchEnd = Math.min(start + size, job.totalCues);
        const cues = parseSrt(primarySrt);
        const batchTexts = cues.slice(start, batchEnd).map((c) => c.text);

        const batchAbort = new AbortController();
        batchAbortByMedia.set(mediaId, batchAbort);

        try {
          const translated = await translateLinesViaApi(batchTexts, {
            signal: batchAbort.signal,
          });
          batchAbortByMedia.delete(mediaId);

          if (loopTokenMismatch(mediaId, token)) return;

          const lines = [...job.lines];
          for (let i = 0; i < translated.length; i++) {
            lines[start + i] = translated[i] ?? "";
          }
          const now = Date.now();
          const next: TranslationJobRecord = {
            ...job,
            lines,
            doneCues: batchEnd,
            consecutiveFailures: 0,
            errorMessage: undefined,
            lastProgressAt: now,
            updatedAt: now,
          };
          await upsertJob(next);
          await savePartialTranslation(mediaId, primarySrt, lines);
          emit(mediaId, next);

          if (batchEnd < job.totalCues) {
            await sleep(PAUSE_BETWEEN_BATCH_MS);
          }
        } catch (e) {
          batchAbortByMedia.delete(mediaId);
          if (loopTokenMismatch(mediaId, token)) return;

          const message = e instanceof Error ? e.message : "翻訳に失敗しました";
          if (/aborted|AbortError/i.test(message)) {
            return;
          }

          const failures = (job.consecutiveFailures ?? 0) + 1;
          const formatHint = isTranslationFormatError(message) ? "（JSON形式）" : "";
          const waitMs =
            failures >= MAX_BATCH_FAILURES
              ? AUTO_COOLDOWN_MS
              : backoffMs(Math.min(failures, 8), 3500);

          const waiting: TranslationJobRecord = {
            ...job,
            status: "running",
            consecutiveFailures: failures >= MAX_BATCH_FAILURES ? 0 : failures,
            errorMessage: `自動再試行${formatHint}… ${Math.round(waitMs / 1000)}秒後（${job.doneCues}/${job.totalCues}）`,
            updatedAt: Date.now(),
          };
          await upsertJob(waiting);
          emit(mediaId, waiting);
          await sleep(waitMs);
          continue;
        }
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
  const job = await getTranslationJob(mediaId);
  if (!job || job.status === "done" || job.status === "paused") return;
  if (job.doneCues >= job.totalCues) return;

  const meta = await getMediaMeta(mediaId);
  if (!meta?.primarySrt) return;
  if (job.sourceFingerprint !== fingerprintPrimarySrt(meta.primarySrt)) return;

  const stale = isProgressStale(job);
  const loopAlive = activeLoopToken.has(mediaId);

  if (stale) {
    killActiveLoop(mediaId);
  }

  if (job.status === "error" || stale || !loopAlive) {
    await upsertJob({
      ...job,
      status: "running",
      errorMessage: stale ? "進捗が止まったため再開しています…" : undefined,
      consecutiveFailures: stale ? 0 : job.consecutiveFailures,
      updatedAt: Date.now(),
    });
    const refreshed = await getTranslationJob(mediaId);
    if (refreshed) emit(mediaId, refreshed);
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
