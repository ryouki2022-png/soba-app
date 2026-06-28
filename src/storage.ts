// localStorage を使った記録の永続化（プロトタイプ用の簡易バックエンド）

import type { SobaRecord } from "./types";

const STORAGE_KEY = "soba-records-v1";

/** 全記録を読み込む（新しい順） */
export function loadRecords(): SobaRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as SobaRecord[];
    if (!Array.isArray(data)) return [];
    return data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** 全記録を保存する */
export function saveRecords(records: SobaRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error("記録の保存に失敗しました", e);
  }
}

/** 一意なIDを生成する */
export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
