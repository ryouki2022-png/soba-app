// 体重記録の永続化（localStorage）

import type { WeightRecord } from "./types";

const STORAGE_KEY = "weight-records-v1";

/** 0.1kg単位に丸める */
export function roundWeight(w: number): number {
  return Math.round(w * 10) / 10;
}

/** 全記録を日付の昇順で読み込む */
export function loadWeights(): WeightRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return (data as WeightRecord[])
      .filter((r) => r && typeof r.date === "string" && typeof r.weight === "number")
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function saveWeights(records: WeightRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error("体重記録の保存に失敗しました", e);
  }
}

/** 同じ日付があれば上書き、なければ追加して、昇順で返す */
export function upsertWeight(
  records: WeightRecord[],
  entry: WeightRecord,
): WeightRecord[] {
  const others = records.filter((r) => r.date !== entry.date);
  return [...others, entry].sort((a, b) => a.date.localeCompare(b.date));
}
