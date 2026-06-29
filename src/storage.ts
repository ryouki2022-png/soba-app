// 記録の永続化。耐久性の高い二重保存レイヤー（store.ts）を利用する。

import type { SobaRecord } from "./types";
import { loadArray, saveArray } from "./lib/store";

const STORAGE_KEY = "soba-records-v1";

/** 全記録を読み込む（新しい順）。1件壊れていても他は失わない。 */
export async function loadRecords(): Promise<SobaRecord[]> {
  const data = await loadArray<Record<string, unknown>>(STORAGE_KEY);
  const out: SobaRecord[] = [];
  for (const r of data) {
    try {
      if (r && typeof r === "object") out.push(migrate(r));
    } catch {
      // 壊れた1件はスキップ（全体は失わない）
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

/** 全記録を保存する（localStorage と IndexedDB の両方へ） */
export async function saveRecords(records: SobaRecord[]): Promise<void> {
  await saveArray(STORAGE_KEY, records);
}

/** 一意なIDを生成する */
export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
