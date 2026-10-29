import { getMediaMeta, updateMedia } from "@/lib/db/clientDb";
import { getMetaDb, openMetaDb } from "@/lib/db/metaDb";
import type { TranslationJobRecord } from "@/lib/db/types";
import { fingerprintPrimarySrt } from "@/lib/translation/fingerprintPrimarySrt";
import { isRetryableGeminiError, backoffMs, sleep } from "@/lib/gemini/retryableError";
import { translateLinesViaApi } from "@/lib/translation/translateBatchClient";
import { parseSrt } from "@/lib/subtitle/parseSrt";
import { serializeSrt } from "@/lib/subtitle/serializeSrt";

const BATCH_SIZE = 12;
const PAUSE_BETWEEN_BATCH_MS = 1800;

export type TranslationProgress = {
  done: number;
  total: number;
  status: TranslationJobRecord["status"];
  errorMessage?: string;
  updatedAt?: number;
};

type Listener = (p: TranslationProgress) => void;

const listeners = new Map<string, Set<Listener>>();
const runTokens = new Map<string, number>();
const activeLoops = new Set<string>();

function jobId(mediaId: string): string {
  return mediaId;
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

export async function getTranslationJob(
  mediaId: string,
): Promise<TranslationJobRecord | undefined> {
  await openMetaDb();
  return getMetaDb().translationJobs.get(jobId(mediaId));
}

export async function cancelTranslationJob(mediaId: string): Promise<void> {
  runTokens.set(mediaId, (runTokens.get(mediaId) ?? 0) + 1);
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
      updatedAt: Date.now(),
    };
    await upsertJob(job);
  } else if (job.status === "done") {
    return;
  } else {
    job = { ...job, status: "running", errorMessage: undefined, updatedAt: Date.now() };
    await upsertJob(job);
  }

  emit(mediaId, job);
  void runLoop(mediaId, meta.primarySrt);
}

async function runLoop(mediaId: string, primarySrt: string): Promise<void> {
  if (activeLoops.has(mediaId)) return;
  activeLoops.add(mediaId);
  const token = (runTokens.get(mediaId) ?? 0) + 1;
  runTokens.set(mediaId, token);

  try {
  while (true) {
    if (runTokens.get(mediaId) !== token) return;

    const job = await getMetaDb().translationJobs.get(jobId(mediaId));
    if (!job || job.status !== "running") return;
    if (job.doneCues >= job.totalCues) {
      const doneJob: TranslationJobRecord = {
        ...job,
        status: "done",
        updatedAt: Date.now(),
      };
      await upsertJob(doneJob);
      emit(mediaId, doneJob);
      return;
    }

    const start = job.doneCues;
    const batchEnd = Math.min(start + BATCH_SIZE, job.totalCues);
    const cues = parseSrt(primarySrt);
    const batchTexts = cues.slice(start, batchEnd).map((c) => c.text);

    try {
      const translated = await translateLinesViaApi(batchTexts);
      const lines = [...job.lines];
      for (let i = 0; i < translated.length; i++) {
        lines[start + i] = translated[i] ?? "";
      }
      const next: TranslationJobRecord = {
        ...job,
        lines,
        doneCues: batchEnd,
        updatedAt: Date.now(),
      };
      await upsertJob(next);
      await savePartialTranslation(mediaId, primarySrt, lines);
      emit(mediaId, next);

      if (batchEnd < job.totalCues) {
        await sleep(PAUSE_BETWEEN_BATCH_MS);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "翻訳に失敗しました";
      if (isRetryableGeminiError(message)) {
        emit(mediaId, {
          ...job,
          errorMessage: `混雑のため待機中… (${message.slice(0, 40)})`,
        });
        await sleep(backoffMs(3, 4000));
        continue;
      }
      const failed: TranslationJobRecord = {
        ...job,
        status: "error",
        errorMessage: message,
        updatedAt: Date.now(),
      };
      await upsertJob(failed);
      emit(mediaId, failed);
      return;
    }
  }
  } finally {
    activeLoops.delete(mediaId);
  }
}

const STALE_RUNNING_MS = 90_000;

/** 未完了ジョブを再開（エラー・止まった running・画面復帰時） */
export async function resumeTranslationJobIfNeeded(mediaId: string): Promise<void> {
  const job = await getTranslationJob(mediaId);
  if (!job || job.status === "done" || job.status === "paused") return;
  if (job.doneCues >= job.totalCues) return;

  const meta = await getMediaMeta(mediaId);
  if (!meta?.primarySrt) return;
  if (job.sourceFingerprint !== fingerprintPrimarySrt(meta.primarySrt)) return;

  const staleRunning =
    job.status === "running" &&
    !activeLoops.has(mediaId) &&
    Date.now() - job.updatedAt > STALE_RUNNING_MS;

  if (job.status === "error" || staleRunning) {
    await upsertJob({
      ...job,
      status: "running",
      errorMessage: staleRunning ? undefined : job.errorMessage,
      updatedAt: Date.now(),
    });
    void runLoop(mediaId, meta.primarySrt);
    return;
  }

  if (job.status === "running" && !activeLoops.has(mediaId)) {
    void runLoop(mediaId, meta.primarySrt);
  }
}

let visibilityHookInstalled = false;

/** タブ復帰時に止まった翻訳を再開 */
export function installTranslationVisibilityResume(): void {
  if (visibilityHookInstalled || typeof document === "undefined") return;
  visibilityHookInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void openMetaDb().then(async () => {
      const jobs = await getMetaDb()
        .translationJobs.filter((j) => j.status === "running" || j.status === "error")
        .toArray();
      for (const j of jobs) {
        if (j.doneCues < j.totalCues) void resumeTranslationJobIfNeeded(j.mediaId);
      }
    });
  });
}
