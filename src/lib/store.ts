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

function lsGetRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsParse<T>(raw: string | null): T[] | null {
  if (raw == null) return null;
  try {
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
 * 件数の多い方（＝より新しい/完全な方）を採用し、足りない側だけ補う。
 *
 * 安全装置:
 *   - 空配列で既存データを上書きしない（消失防止）
 *   - localStorage が「壊れて読めない」場合は上書きせず温存
 *     （IndexedDB 側が無事ならそれを返す）
 */
export async function loadArray<T>(key: string): Promise<T[]> {
  const lsRaw = lsGetRaw(key);
  const ls = lsParse<T>(lsRaw);
  const lsCorrupt = lsRaw != null && ls === null; // 文字列はあるが parse 不能
  const idb0 = await idbGet<T[]>(key);
  const idb = Array.isArray(idb0) ? idb0 : null;

  let chosen: T[];
  if (ls && idb) {
    chosen = ls.length >= idb.length ? ls : idb;
  } else {
    chosen = ls ?? idb ?? [];
  }

  // 復元・同期は「採用データが空でない」ときだけ。空で上書きして消すことは絶対にしない。
  // 採用データ(chosen)が非空なら、それは無事なデータなので、壊れている側も含めて修復する。
  if (chosen.length > 0) {
    const lsCount = ls ? ls.length : 0;
    if (lsCorrupt || lsCount < chosen.length) lsWrite(key, chosen);
    const idbCount = idb ? idb.length : 0;
    if (idbCount < chosen.length) void idbSet(key, chosen);
  }

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
