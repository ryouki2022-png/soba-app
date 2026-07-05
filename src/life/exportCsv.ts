// 生活記録を表計算ソフトで開ける CSV として書き出す

import type { LifeRecord } from "./types";
import { MEAL_SLOTS } from "./types";

function csvCell(value: string | number | null): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportLifeCsv(records: LifeRecord[]): void {
  const header = [
    "日付",
    "体重(kg)",
    ...MEAL_SLOTS.flatMap((s) => [s.label, `${s.label}外食`]),
    "勉強時間(分)",
    "メモ",
  ];
  const rows = records.map((r) =>
    [
      r.date,
      r.weight,
      ...MEAL_SLOTS.flatMap((s) => [
        r.meals[s.key]?.note ?? "",
        r.meals[s.key]?.outside ? "○" : "",
      ]),
      r.studyMinutes,
      r.note,
    ]
      .map(csvCell)
      .join(","),
  );
  // 先頭の BOM は Excel での文字化け防止
  const content = "﻿" + [header.join(","), ...rows].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  download(`life-records-${stamp}.csv`, content);
}
