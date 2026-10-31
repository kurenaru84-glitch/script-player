import { getMediaMeta, saveNote } from "@/lib/db/clientDb";
import { getMetaDb, openMetaDb } from "@/lib/db/metaDb";
import type { GrammarJobRecord } from "@/lib/db/types";
import { fingerprintPrimarySrt } from "@/lib/translation/fingerprintPrimarySrt";
import { isTranslationFormatError, sleep } from "@/lib/gemini/retryableError";
import { isRateLimitError, translationRetryDelayMs } from "@/lib/gemini/retryDelay";
import { detectSourceLanguage } from "@/lib/translation/detectSourceLanguage";
import { loadBilingualSubtitles } from "@/lib/subtitle/loadBilingualSubtitles";
import { explainGrammarViaApi } from "@/lib/grammar/grammarBatchClient";

const BATCH_SIZE = 5;
const PAUSE_BETWEEN_BATCH_MS = 2800;
const MAX_BATCHES_PER_RUN = 10;
const STALE_PROGRESS_MS = 75_000;
const GLOBAL_RESUME_MS = 10_000;
const SKIP_BATCH_AFTER_FAILURES = 5;

export type GrammarProgress = {
  done: number;
  total: number;
  status: GrammarJobRecord["status"];
  errorMessage?: string;
  updatedAt?: number;
};

type Listener = (p: GrammarProgress) => void;

const listeners = new Map<string, Set<Listener>>();
const runTokens = new Map<string, number>();
const activeLoopToken = new Map<string, number>();
const batchAbortByMedia = new Map<string, AbortController>();

function jobId(mediaId: string): string {
  return mediaId;
}

function emit(mediaId: string, job: GrammarJobRecord) {
  const p: GrammarProgress = {
    done: job.doneCues,
    total: job.totalCues,
    status: job.status,
    errorMessage: job.errorMessage,
    updatedAt: job.updatedAt,
  };
  for (const fn of listeners.get(mediaId) ?? []) fn(p);
}

export function subscribeGrammarProgress(
  mediaId: string,
  listener: Listener,
): () => void {
  if (!listeners.has(mediaId)) listeners.set(mediaId, new Set());
  listeners.get(mediaId)!.add(listener);
  void getGrammarJob(mediaId).then((job) => {
    if (job) emit(mediaId, job);
  });
  return () => listeners.get(mediaId)?.delete(listener);
}

async function upsertJob(job: GrammarJobRecord): Promise<void> {
  await openMetaDb();
  await getMetaDb().grammarJobs.put(job);
}

export async function getGrammarJob(
  mediaId: string,
): Promise<GrammarJobRecord | undefined> {
  await openMetaDb();
  return getMetaDb().grammarJobs.get(jobId(mediaId));
}

function killActiveLoop(mediaId: string) {
  batchAbortByMedia.get(mediaId)?.abort();
  batchAbortByMedia.delete(mediaId);
  activeLoopToken.delete(mediaId);
}

function loopTokenMismatch(mediaId: string, token: number): boolean {
  return activeLoopToken.get(mediaId) !== token;
}

async function persistGrammarLines(
  mediaId: string,
  job: GrammarJobRecord,
): Promise<void> {
  const meta = await getMediaMeta(mediaId);
  if (!meta) return;
  const { cues } = loadBilingualSubtitles(meta);
  for (let i = 0; i < job.doneCues; i++) {
    const text = job.lines[i]?.trim();
    if (!text) continue;
    const cue = cues[i];
    if (!cue) continue;
    await saveNote({
      mediaId,
      cueIndex: i,
      primaryLine: cue.primary,
      translationLine: cue.translation,
      grammarBody: text,
    });
  }
  await upsertJob(job);
}

export async function startGrammarJob(
  mediaId: string,
  opts?: { forceRestart?: boolean },
): Promise<void> {
  const meta = await getMediaMeta(mediaId);
  if (!meta?.primarySrt?.trim()) throw new Error("メイン字幕がありません");
  const { cues } = loadBilingualSubtitles(meta);
  if (cues.length === 0) throw new Error("字幕が空です");

  const fp = fingerprintPrimarySrt(meta.primarySrt);
  await openMetaDb();
  let job = await getMetaDb().grammarJobs.get(jobId(mediaId));
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
      nextAttemptAt: now,
      updatedAt: now,
    };
    await upsertJob(job);
  }

  killActiveLoop(mediaId);
  emit(mediaId, job);
  void runLoop(mediaId);
}

export async function kickGrammarJobNow(mediaId: string): Promise<void> {
  killActiveLoop(mediaId);
  const job = await getGrammarJob(mediaId);
  if (!job || job.status === "done") {
    await startGrammarJob(mediaId);
    return;
  }
  await upsertJob({
    ...job,
    status: "running",
    nextAttemptAt: Date.now(),
    errorMessage: "手動で再開しています…",
    updatedAt: Date.now(),
  });
  void runLoop(mediaId);
}

export async function cancelGrammarJob(mediaId: string): Promise<void> {
  killActiveLoop(mediaId);
  const existing = await getGrammarJob(mediaId);
  if (existing?.status === "running") {
    const paused = { ...existing, status: "paused" as const, updatedAt: Date.now() };
    await upsertJob(paused);
    emit(mediaId, paused);
  }
}

async function runLoop(mediaId: string): Promise<void> {
  if (activeLoopToken.has(mediaId)) return;
  const job = await getGrammarJob(mediaId);
  if (!job || job.status !== "running" || job.doneCues >= job.totalCues) return;
  if (job.nextAttemptAt != null && Date.now() < job.nextAttemptAt) return;

  const token = (runTokens.get(mediaId) ?? 0) + 1;
  runTokens.set(mediaId, token);
  activeLoopToken.set(mediaId, token);

  const meta = await getMediaMeta(mediaId);
  if (!meta) return;
  const { cues } = loadBilingualSubtitles(meta);
  const sourceLanguage = detectSourceLanguage(cues.slice(0, 60).map((c) => c.primary));

  try {
    let batches = 0;
    while (batches < MAX_BATCHES_PER_RUN) {
      if (loopTokenMismatch(mediaId, token)) return;
      const current = await getGrammarJob(mediaId);
      if (!current || current.status !== "running") return;
      if (current.doneCues >= current.totalCues) {
        const doneJob: GrammarJobRecord = {
          ...current,
          status: "done",
          errorMessage: undefined,
          updatedAt: Date.now(),
        };
        await persistGrammarLines(mediaId, doneJob);
        emit(mediaId, doneJob);
        return;
      }

      const start = current.doneCues;
      const end = Math.min(start + BATCH_SIZE, current.totalCues);
      const batchLines = cues.slice(start, end).map((c) => ({
        primary: c.primary,
        translation: c.translation,
      }));

      const batchAbort = new AbortController();
      batchAbortByMedia.set(mediaId, batchAbort);
      batches += 1;

      try {
        const explained = await explainGrammarViaApi(batchLines, {
          signal: batchAbort.signal,
          sourceLanguage,
        });
        batchAbortByMedia.delete(mediaId);
        if (loopTokenMismatch(mediaId, token)) return;

        const lines = [...current.lines];
        for (let i = 0; i < explained.length; i++) {
          lines[start + i] = explained[i] ?? "";
        }
        const now = Date.now();
        const next: GrammarJobRecord = {
          ...current,
          lines,
          doneCues: end,
          consecutiveFailures: 0,
          errorMessage: undefined,
          lastProgressAt: now,
          updatedAt: now,
        };
        await persistGrammarLines(mediaId, next);
        emit(mediaId, next);

        if (end >= current.totalCues) return;
        if (document.visibilityState === "hidden" || batches >= MAX_BATCHES_PER_RUN) {
          await upsertJob({ ...next, nextAttemptAt: Date.now() });
          return;
        }
        await sleep(PAUSE_BETWEEN_BATCH_MS);
      } catch (e) {
        batchAbortByMedia.delete(mediaId);
        if (loopTokenMismatch(mediaId, token)) return;
        const message = e instanceof Error ? e.message : "文法解説に失敗しました";
        if (/aborted|中断/i.test(message)) return;

        const latest = (await getGrammarJob(mediaId)) ?? current;
        const failures = (latest.consecutiveFailures ?? 0) + 1;

        if (failures >= SKIP_BATCH_AFTER_FAILURES) {
          const lines = [...latest.lines];
          for (let i = 0; i < batchLines.length; i++) {
            const idx = start + i;
            if (!lines[idx]?.trim()) {
              lines[idx] = "［要修正］文法解説を生成できませんでした";
            }
          }
          const skipped: GrammarJobRecord = {
            ...latest,
            lines,
            doneCues: end,
            consecutiveFailures: 0,
            errorMessage: `行${start + 1}付近をスキップ（${end}/${latest.totalCues}）`,
            updatedAt: Date.now(),
          };
          await persistGrammarLines(mediaId, skipped);
          emit(mediaId, skipped);
          return;
        }

        const waitMs = translationRetryDelayMs(failures, message);
        const waiting: GrammarJobRecord = {
          ...latest,
          status: "running",
          consecutiveFailures: failures,
          nextAttemptAt: Date.now() + waitMs,
          errorMessage: `再試行 · ${Math.max(1, Math.round(waitMs / 1000))}秒後（${latest.doneCues}/${latest.totalCues}）${isRateLimitError(message) ? " · API混雑" : ""}${isTranslationFormatError(message) ? " · JSON形式" : ""}`,
          updatedAt: Date.now(),
        };
        await upsertJob(waiting);
        emit(mediaId, waiting);
        return;
      }
    }
  } finally {
    if (activeLoopToken.get(mediaId) === token) activeLoopToken.delete(mediaId);
    batchAbortByMedia.delete(mediaId);
  }
}

export async function resumeGrammarJobIfNeeded(mediaId: string): Promise<void> {
  const job = await getGrammarJob(mediaId);
  if (!job || job.status === "done" || job.status === "paused") return;
  if (job.doneCues >= job.totalCues) return;
  if (activeLoopToken.has(mediaId)) return;
  const waitOver = job.nextAttemptAt == null || Date.now() >= job.nextAttemptAt;
  const stale =
    job.status === "running" &&
    Date.now() - (job.lastProgressAt ?? job.updatedAt) > STALE_PROGRESS_MS;
  if (waitOver || stale) void runLoop(mediaId);
}

let hooksInstalled = false;

export function installGrammarGlobalResume(): void {
  if (hooksInstalled || typeof document === "undefined") return;
  hooksInstalled = true;
  const tick = async () => {
    await openMetaDb();
    const jobs = await getMetaDb()
      .grammarJobs.filter((j) => j.status === "running")
      .toArray();
    for (const j of jobs) {
      if (j.doneCues < j.totalCues) await resumeGrammarJobIfNeeded(j.mediaId);
    }
  };
  void tick();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void tick();
  });
  window.addEventListener("focus", () => void tick());
  setInterval(() => void tick(), GLOBAL_RESUME_MS);
}
