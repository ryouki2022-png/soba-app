// 頑丈な永続化レイヤー
//
// モバイル（特に iOS / ホーム画面アプリ）では localStorage が
// OS によって削除されることがある。そこで:
//   - IndexedDB を耐久性の高いミラーとして併用
//   - 読み込み時に localStorage と IndexedDB を突き合わせ、
//     データの多い方を採用して両方を同期（＝自動復元）
//   - navigator.storage.persist() で消去されにくくするよう依頼
//   - 記録データは日次スナップショットを IndexedDB に残す（操作ミスからの復元用）
// ただし localStorage も IndexedDB も同じブラウザ領域なので、OS が領域ごと
// 消すと両方消える。その根本対策は GitHub 同期（lib/sync.ts）が担う。

import { todayStr } from "./date";

const DB_NAME = "kirokunote";
const STORE = "kv";

/** 日次スナップショットを残す対象（記録データ本体のみ） */
const SNAPSHOT_KEYS = new Set(["soba-records-v1", "life-records-v1"]);
const SNAPSHOT_KEEP = 10; // キーごとに保持する日数ぶん
const SNAP_PREFIX = "snap:";

// データ変更の通知先（同期レイヤーが登録する）
let changeListener: ((key: string) => void) | null = null;

/** 配列データが保存されたときに呼ばれるリスナーを登録する（1つだけ） */
export function setDataChangeListener(fn: ((key: string) => void) | null): void {
  changeListener = fn;
}

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

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* 無視 */
  }
}

async function idbKeys(): Promise<string[]> {
  try {
    const db = await getDB();
    return await new Promise<string[]>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () =>
        resolve((req.result ?? []).filter((k): k is string => typeof k === "string"));
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
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
  if (SNAPSHOT_KEYS.has(key) && data.length > 0) {
    void writeSnapshot(key, data);
  }
  changeListener?.(key);
}

/* ===== オブジェクト（設定など）の保存 ===== */

/** オブジェクトを読み込む（localStorage 優先、無ければ IndexedDB） */
export async function loadObject<T>(key: string): Promise<T | null> {
  const raw = lsGetRaw(key);
  if (raw != null) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object") return v as T;
    } catch {
      /* 壊れていたら IndexedDB へフォールバック */
    }
  }
  const idb = await idbGet<T>(key);
  if (idb && typeof idb === "object") {
    // localStorage 側が消えていたら復元しておく
    if (raw == null) lsWrite(key, idb);
    return idb;
  }
  return null;
}

/** オブジェクトを保存する（null で削除） */
export async function saveObject(key: string, val: unknown | null): Promise<void> {
  if (val == null) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 無視 */
    }
    await idbDelete(key);
    return;
  }
  lsWrite(key, val);
  await idbSet(key, val);
}

/* ===== 日次スナップショット（操作ミス・不具合からの復元用） ===== */

export interface SnapshotInfo {
  /** 元データのキー（soba-records-v1 など） */
  storageKey: string;
  /** スナップショットの日付（YYYY-MM-DD） */
  date: string;
  /** 件数 */
  count: number;
}

async function writeSnapshot(key: string, data: unknown[]): Promise<void> {
  const snapKey = `${SNAP_PREFIX}${key}:${todayStr()}`;
  await idbSet(snapKey, data);
  // 古いスナップショットを間引く
  const prefix = `${SNAP_PREFIX}${key}:`;
  const keys = (await idbKeys()).filter((k) => k.startsWith(prefix)).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - SNAPSHOT_KEEP))) {
    await idbDelete(k);
  }
}

/** 保存されているスナップショットの一覧（新しい順） */
export async function listSnapshots(): Promise<SnapshotInfo[]> {
  const keys = (await idbKeys()).filter((k) => k.startsWith(SNAP_PREFIX));
  const out: SnapshotInfo[] = [];
  for (const k of keys) {
    const rest = k.slice(SNAP_PREFIX.length);
    const i = rest.lastIndexOf(":");
    if (i === -1) continue;
    const data = await idbGet<unknown[]>(k);
    out.push({
      storageKey: rest.slice(0, i),
      date: rest.slice(i + 1),
      count: Array.isArray(data) ? data.length : 0,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** スナップショットの中身を読む */
export async function readSnapshot(
  storageKey: string,
  date: string,
): Promise<unknown[] | null> {
  const data = await idbGet<unknown[]>(`${SNAP_PREFIX}${storageKey}:${date}`);
  return Array.isArray(data) ? data : null;
}

/* ===== 保存状態の診断（データ救出画面用） ===== */

export interface StorageReport {
  /** ブラウザが「保存領域を消さない」と約束しているか */
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  /** キーごとの localStorage / IndexedDB の件数 */
  keys: { key: string; ls: number | null; idb: number | null }[];
}

export async function storageReport(keys: string[]): Promise<StorageReport> {
  let persisted: boolean | null = null;
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      usage = est.usage ?? null;
      quota = est.quota ?? null;
    }
  } catch {
    /* 診断できない環境では null のまま */
  }
  const rows: StorageReport["keys"] = [];
  for (const key of keys) {
    const ls = lsParse<unknown>(lsGetRaw(key));
    const idb = await idbGet<unknown[]>(key);
    rows.push({
      key,
      ls: ls ? ls.length : null,
      idb: Array.isArray(idb) ? idb.length : null,
    });
  }
  return { persisted, usage, quota, keys: rows };
}
