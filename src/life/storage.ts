// 生活記録の永続化。耐久性の高い二重保存レイヤー（store.ts）を利用する。
// 旧「体重記録」からの自動移行つき。

import type { LifeRecord, MealSlot, Meal } from "./types";
import { emptyMeals } from "./types";
import { loadArray, saveArray } from "../lib/store";

const STORAGE_KEY = "life-records-v1";
const LEGACY_WEIGHT_KEY = "weight-records-v1";

export function roundWeight(w: number): number {
  return Math.round(w * 10) / 10;
}

function normalizeMeals(m: unknown): Record<MealSlot, Meal> {
  const base = emptyMeals();
  if (m && typeof m === "object") {
    for (const k of Object.keys(base) as MealSlot[]) {
      const v = (m as Record<string, unknown>)[k];
      if (v && typeof v === "object") {
        base[k] = {
          note: typeof (v as Meal).note === "string" ? (v as Meal).note : "",
          outside: Boolean((v as Meal).outside),
        };
      }
    }
  }
  return base;
}

function normalize(r: Record<string, unknown>): LifeRecord {
  return {
    date: String(r.date),
    weight:
      typeof r.weight === "number"
        ? r.weight
        : r.weight == null
          ? null
          : Number(r.weight) || null,
    meals: normalizeMeals(r.meals),
    studyMinutes: typeof r.studyMinutes === "number" ? r.studyMinutes : 0,
    note: typeof r.note === "string" ? r.note : "",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
  };
}

/** 旧「体重記録」を生活記録の形へ変換する */
async function fromLegacyWeight(): Promise<LifeRecord[]> {
  const data = await loadArray<Record<string, unknown>>(LEGACY_WEIGHT_KEY);
  return data
    .filter((r) => r && typeof r.date === "string")
    .map((r) => ({
      date: String(r.date),
      weight: typeof r.weight === "number" ? r.weight : null,
      meals: emptyMeals(),
      studyMinutes: 0,
      note: typeof r.note === "string" ? r.note : "",
      createdAt:
        typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    }));
}

/** 全記録を日付の昇順で読み込む（旧データは初回に取り込む） */
export async function loadLife(): Promise<LifeRecord[]> {
  const raw = await loadArray<Record<string, unknown>>(STORAGE_KEY);
  let current: LifeRecord[] = [];
  for (const r of raw) {
    if (r && typeof r === "object" && typeof r.date === "string") {
      try {
        current.push(normalize(r));
      } catch {
        // 壊れた1件はスキップ
      }
    }
  }

  // 旧体重データのうち、生活記録に無い日付を取り込む
  const legacy = await fromLegacyWeight();
  if (legacy.length > 0) {
    const have = new Set(current.map((r) => r.date));
    const merged = [...current];
    for (const l of legacy) {
      if (!have.has(l.date)) merged.push(l);
    }
    if (merged.length !== current.length) {
      current = merged;
      await saveLife(current); // 取り込み結果を保存
    }
  }

  return current.sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveLife(records: LifeRecord[]): Promise<void> {
  await saveArray(STORAGE_KEY, records);
}

/** 同じ日付があれば上書き、なければ追加して昇順で返す */
export function upsertLife(
  records: LifeRecord[],
  entry: LifeRecord,
): LifeRecord[] {
  const others = records.filter((r) => r.date !== entry.date);
  return [...others, entry].sort((a, b) => a.date.localeCompare(b.date));
}
