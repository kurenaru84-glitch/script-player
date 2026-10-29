import Dexie from "dexie";
import { openMetaDb } from "@/lib/db/metaDb";
import type { FavoriteRecord, MediaMeta, VocabNote } from "@/lib/db/types";

const LEGACY_DB = "scriptPlayerWeb";
const MIGRATED_KEY = "scriptPlayerMetaMigratedFromLegacy";

function openLegacyDb(timeoutMs: number): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    const req = indexedDB.open(LEGACY_DB);
    req.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    req.onblocked = () => {
      /* 他タブが掴んでいる */
    };
    req.onupgradeneeded = () => {
      req.transaction?.abort();
      window.clearTimeout(timer);
      finish(null);
    };
    req.onsuccess = () => {
      window.clearTimeout(timer);
      finish(req.result);
    };
  });
}

async function copyStore<T>(
  legacy: IDBDatabase,
  storeName: string,
  put: (row: T) => Promise<unknown>,
): Promise<number> {
  if (!legacy.objectStoreNames.contains(storeName)) return 0;
  return new Promise((resolve, reject) => {
    const tx = legacy.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.openCursor();
    let n = 0;
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(n);
        return;
      }
      void put(cursor.value as T)
        .then(() => {
          n += 1;
          cursor.continue();
        })
        .catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
}

/** 旧 scriptPlayerWeb からメタだけ引き越し（動画 Blob は触らない） */
export async function migrateLegacyMetaIfNeeded(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATED_KEY) === "1") return;

  const meta = await openMetaDb();
  const legacy = await openLegacyDb(6_000);
  if (!legacy) {
    localStorage.setItem(MIGRATED_KEY, "1");
    return;
  }

  try {
    await copyStore<MediaMeta>(legacy, "mediaMeta", (row) => meta.mediaMeta.put(row));
    await copyStore<VocabNote>(legacy, "notes", (row) => meta.notes.put(row));
    await copyStore<FavoriteRecord>(legacy, "favorites", (row) =>
      meta.favorites.put(row),
    );
  } finally {
    legacy.close();
  }
  localStorage.setItem(MIGRATED_KEY, "1");
}

export async function wipeAllScriptPlayerStorage(): Promise<void> {
  await Dexie.delete("scriptPlayerMeta");
  await Dexie.delete("scriptPlayerVideo");
  await Dexie.delete("scriptPlayerWeb");
  localStorage.removeItem(MIGRATED_KEY);
  if (typeof navigator !== "undefined" && "storage" in navigator) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("videos", { recursive: true });
    } catch {
      /* no opfs */
    }
  }
}
