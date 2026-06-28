// 生活記録の永続化（localStorage）。旧「体重記録」からの自動移行つき。

import type { LifeRecord, MealSlot, Meal } from "./types";
import { emptyMeals } from "./types";

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
function fromLegacyWeight(): LifeRecord[] {
  try {
    const raw = localStorage.getItem(LEGACY_WEIGHT_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((r) => r && typeof r.date === "string")
      .map((r) => ({
        date: String(r.date),
        weight: typeof r.weight === "number" ? r.weight : null,
        meals: emptyMeals(),
        studyMinutes: 0,
        note: typeof r.note === "string" ? r.note : "",
        createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

/** 全記録を日付の昇順で読み込む（旧データは初回に取り込む） */
export function loadLife(): LifeRecord[] {
  let current: LifeRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        current = data.filter((r) => r && typeof r.date === "string").map(normalize);
      }
    }
  } catch {
    current = [];
  }

  // 旧体重データのうち、生活記録に無い日付を取り込む
  const legacy = fromLegacyWeight();
  if (legacy.length > 0) {
    const have = new Set(current.map((r) => r.date));
    const merged = [...current];
    for (const l of legacy) {
      if (!have.has(l.date)) merged.push(l);
    }
    if (merged.length !== current.length) {
      current = merged;
      saveLife(current); // 取り込み結果を保存
    }
  }

  return current.sort((a, b) => a.date.localeCompare(b.date));
}

export function saveLife(records: LifeRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error("生活記録の保存に失敗しました", e);
  }
}

/** 同じ日付があれば上書き、なければ追加して昇順で返す */
export function upsertLife(
  records: LifeRecord[],
  entry: LifeRecord,
): LifeRecord[] {
  const others = records.filter((r) => r.date !== entry.date);
  return [...others, entry].sort((a, b) => a.date.localeCompare(b.date));
}
