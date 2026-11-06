/**
 * 모의 영상 저장소. 실제 서비스에서는 S3 호환 객체 스토리지가 이 역할을 한다.
 * 브라우저 IndexedDB에 파일을 보관하고, 재생할 때 blob URL을 만든다.
 */
export interface VideoStore {
  put(videoId: string, file: Blob): Promise<void>;
  /** 재생 주소. 파일이 없으면 null */
  getPlaybackUrl(videoId: string): Promise<string | null>;
  clear(): Promise<void>;
}

const DB_NAME = "yconic-admin-mock";
const STORE = "videos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB를 열 수 없습니다."));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 작업에 실패했습니다."));
  });
}

export function createIndexedDbVideoStore(): VideoStore {
  const urlCache = new Map<string, string>();
  return {
    async put(videoId, file) {
      const db = await openDb();
      await tx(db, "readwrite", (s) => s.put(file, videoId));
      db.close();
    },
    async getPlaybackUrl(videoId) {
      const cached = urlCache.get(videoId);
      if (cached) return cached;
      const db = await openDb();
      const blob = await tx<Blob | undefined>(db, "readonly", (s) => s.get(videoId) as IDBRequest<Blob | undefined>);
      db.close();
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urlCache.set(videoId, url);
      return url;
    },
    async clear() {
      for (const url of urlCache.values()) URL.revokeObjectURL(url);
      urlCache.clear();
      const db = await openDb();
      await tx(db, "readwrite", (s) => s.clear());
      db.close();
    },
  };
}

export function createMemoryVideoStore(): VideoStore {
  const files = new Map<string, Blob>();
  return {
    async put(videoId, file) {
      files.set(videoId, file);
    },
    async getPlaybackUrl(videoId) {
      return files.has(videoId) ? `memory://video/${videoId}` : null;
    },
    async clear() {
      files.clear();
    },
  };
}
