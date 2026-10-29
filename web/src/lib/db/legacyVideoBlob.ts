const LEGACY_DB = "scriptPlayerWeb";

/** Dexie を使わず 1 件だけ読む（プレイヤー専用・My List では呼ばない） */
export function readLegacyVideoBlob(mediaId: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 90_000);
    const req = indexedDB.open(LEGACY_DB);
    req.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    req.onupgradeneeded = () => {
      req.transaction?.abort();
      window.clearTimeout(timer);
      resolve(null);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("videoBlobs")) {
        db.close();
        window.clearTimeout(timer);
        resolve(null);
        return;
      }
      const tx = db.transaction("videoBlobs", "readonly");
      const getReq = tx.objectStore("videoBlobs").get(mediaId);
      getReq.onsuccess = () => {
        window.clearTimeout(timer);
        const blob = (getReq.result as { videoBlob?: Blob } | undefined)?.videoBlob;
        db.close();
        resolve(blob && blob.size > 0 ? blob : null);
      };
      getReq.onerror = () => {
        window.clearTimeout(timer);
        db.close();
        resolve(null);
      };
    };
  });
}
