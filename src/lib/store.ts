// 頑丈な永続化レイヤー
//
// モバイル（特に iOS / ホーム画面アプリ）では localStorage が
// OS によって削除されることがある。そこで:
//   - IndexedDB を耐久性の高いミラーとして併用
//   - 読み込み時に localStorage と IndexedDB を突き合わせ、
//     データの多い方を採用して両方を同期（＝自動復元）
//   - navigator.storage.persist() で消去されにくくするよう依頼
// これにより、片方が消えても、もう片方から自動で復旧できる。

const DB_NAME = "kirokunote";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 非対応"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, val: unknown): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB が使えない環境では無視 */
  }
}

/** 保存領域を消されにくくするようブラウザに依頼する */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch {
    /* 失敗しても致命的ではない */
  }
}

function lsParse<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    return null;
  }
}

function lsWrite(key: string, data: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * 配列データを読み込む。localStorage と IndexedDB を突き合わせ、
 * 件数の多い方（＝より新しい/完全な方）を採用し、両方を同期する。
 * これにより、片方が消えても自動復元される。
 */
export async function loadArray<T>(key: string): Promise<T[]> {
  const ls = lsParse<T>(key);
  const idb = await idbGet<T[]>(key);
  const idbArr = Array.isArray(idb) ? idb : null;

  let chosen: T[];
  if (ls && idbArr) {
    // 通常は同じ。書き込みに失敗した側が少なくなるので、多い方を採用。
    chosen = ls.length >= idbArr.length ? ls : idbArr;
  } else {
    chosen = ls ?? idbArr ?? [];
  }

  // 両方を採用データに揃える（＝消えていた側を復元）
  lsWrite(key, chosen);
  void idbSet(key, chosen);
  return chosen;
}

/** 配列データを保存する（localStorage と IndexedDB の両方へ） */
export async function saveArray<T>(key: string, data: T[]): Promise<void> {
  const ok = lsWrite(key, data);
  await idbSet(key, data);
  if (!ok) {
    console.warn(
      `localStorage への保存に失敗（容量超過など）。IndexedDB には保存しました: ${key}`,
    );
  }
}
