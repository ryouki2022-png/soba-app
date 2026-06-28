// 体重記録の型定義

export interface WeightRecord {
  /** 記録日（YYYY-MM-DD）。1日1件 */
  date: string;
  /** 体重（kg, 0.1単位） */
  weight: number;
  /** メモ（任意） */
  note: string;
  /** 作成・更新日時（ISO） */
  createdAt: string;
}
