// localStorage を使った記録の永続化（プロトタイプ用の簡易バックエンド）

import type { SobaRecord } from "./types";

const STORAGE_KEY = "soba-records-v1";

/** 全記録を読み込む（新しい順） */
export function loadRecords(): SobaRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map(migrate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/**
 * 旧バージョンのレコードを現行スキーマへ移行する。
 * 旧: menuName（単一文字列）→ 新: menuItems（配列）＋ toppings（配列）
 */
export function migrate(r: Record<string, unknown>): SobaRecord {
  const legacyMenu = typeof r.menuName === "string" ? r.menuName.trim() : "";
  const menuItems = Array.isArray(r.menuItems)
    ? (r.menuItems as string[])
    : legacyMenu
      ? [legacyMenu]
      : [];
  const toppings = Array.isArray(r.toppings) ? (r.toppings as string[]) : [];
  // menuName は残さない（移行後は menuItems を使う）
  const { menuName: _omit, ...rest } = r as Record<string, unknown> & {
    menuName?: string;
  };
  void _omit;
  return { ...(rest as unknown as SobaRecord), menuItems, toppings };
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
