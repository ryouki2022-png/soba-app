// 生活記録（体重・食事・勉強時間）の型定義

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_SLOTS: { key: MealSlot; label: string; icon: string }[] = [
  { key: "breakfast", label: "朝", icon: "🌅" },
  { key: "lunch", label: "昼", icon: "🍱" },
  { key: "dinner", label: "夜", icon: "🌙" },
  { key: "snack", label: "おやつ", icon: "🍡" },
];

export interface Meal {
  /** 食べたもの（任意） */
  note: string;
  /** 外食したか */
  outside: boolean;
}

export interface LifeRecord {
  /** 記録日（YYYY-MM-DD）。1日1件 */
  date: string;
  /** 体重（kg, 0.1単位）。未入力は null */
  weight: number | null;
  /** 朝昼夜おやつの記録 */
  meals: Record<MealSlot, Meal>;
  /** 勉強時間（分） */
  studyMinutes: number;
  /** メモ */
  note: string;
  /** 作成・更新日時（ISO） */
  createdAt: string;
}

export function emptyMeals(): Record<MealSlot, Meal> {
  return {
    breakfast: { note: "", outside: false },
    lunch: { note: "", outside: false },
    dinner: { note: "", outside: false },
    snack: { note: "", outside: false },
  };
}

/** その日の外食回数 */
export function outsideCount(r: LifeRecord): number {
  return MEAL_SLOTS.reduce(
    (n, s) => n + (r.meals[s.key]?.outside ? 1 : 0),
    0,
  );
}
