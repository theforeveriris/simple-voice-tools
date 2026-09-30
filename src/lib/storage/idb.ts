/**
 * IndexedDB 存储层（零依赖封装）
 * 两个对象仓库：
 *   records — 分析记录（不含音频），keyPath = id
 *   audio   — 录音音频 Blob，keyPath = id（与分析记录同 id 关联）
 * 所有操作返回 Promise；打开失败时全局降级为「不可用」，由上层提示。
 */

const DB_NAME = 'svt';
const DB_VERSION = 1;

export const STORE_RECORDS = 'records';
export const STORE_AUDIO = 'audio';

let dbPromise: Promise<IDBDatabase> | null = null;
let unavailable = false;

function openDb(): Promise<IDBDatabase> {
  if (unavailable) return Promise.reject(new Error('IndexedDB unavailable'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unsupported'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_RECORDS)) {
          db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_AUDIO)) {
          db.createObjectStore(STORE_AUDIO, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    dbPromise.catch(() => {
      unavailable = true;
    });
  }
  return dbPromise;
}

async function withStore<T>(
  name: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    let request: IDBRequest<T> | void;
    try {
      request = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(request ? (request as IDBRequest<T>).result : (undefined as T));
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/* ------------------------------ 记录仓库 ------------------------------ */

export async function idbGetAllRecords<T>(): Promise<T[]> {
  return withStore<T[]>(STORE_RECORDS, 'readonly', (s) => s.getAll());
}

export function idbPutRecord(record: unknown): Promise<void> {
  return withStore(STORE_RECORDS, 'readwrite', (s) => {
    s.put(record);
  });
}

export function idbPutRecords(records: unknown[]): Promise<void> {
  return withStore(STORE_RECORDS, 'readwrite', (s) => {
    for (const r of records) s.put(r);
  });
}

export function idbDeleteRecord(id: string): Promise<void> {
  return withStore(STORE_RECORDS, 'readwrite', (s) => s.delete(id));
}

export function idbClearRecords(): Promise<void> {
  return withStore(STORE_RECORDS, 'readwrite', (s) => s.clear());
}

/* ------------------------------ 音频仓库 ------------------------------ */

export async function idbGetAudio(id: string): Promise<Blob | null> {
  const blob = await withStore<Blob | undefined>(STORE_AUDIO, 'readonly', (s) => s.get(id));
  return blob ?? null;
}

export function idbPutAudio(id: string, blob: Blob): Promise<void> {
  return withStore(STORE_AUDIO, 'readwrite', (s) => {
    s.put({ id, blob });
  });
}

export function idbDeleteAudio(id: string): Promise<void> {
  return withStore(STORE_AUDIO, 'readwrite', (s) => s.delete(id));
}

export function idbClearAudio(): Promise<void> {
  return withStore(STORE_AUDIO, 'readwrite', (s) => s.clear());
}
