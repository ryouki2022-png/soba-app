// 日付ユーティリティ（ローカルタイムゾーン基準）
//
// 注意: new Date().toISOString() は UTC を返すため、日本の夜間だと
// 日付が前日になってしまう。ユーザーの体感日付と一致させるため、
// 端末のローカル時刻で YYYY-MM-DD を組み立てる。

export function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return dateStr(new Date());
}

/** n 日前の日付（ローカル基準） */
export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateStr(d);
}
