// データの書き出し（バックアップ）・読み込み（復元）

import type { SobaRecord } from "../types";

function tempLabel(t: SobaRecord["temperature"]): string {
  return t === "hot" ? "温かい" : "冷たい";
}

/** ブラウザでファイルをダウンロードさせる */
function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 全データを JSON で書き出す（写真も含む完全バックアップ） */
export function exportJson(records: SobaRecord[]): void {
  download(
    `soba-records-${stamp()}.json`,
    JSON.stringify(records, null, 2),
    "application/json",
  );
}

/** CSV の1セルをエスケープする */
function csvCell(value: string | number | null): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 表計算ソフトで開ける CSV を書き出す（写真は除く） */
export function exportCsv(records: SobaRecord[]): void {
  const header = [
    "日付",
    "店名",
    "メニュー",
    "温度",
    "こし",
    "値段",
    "評価",
    "メモ",
    "マップURL",
  ];
  const rows = records.map((r) =>
    [
      r.date,
      r.shopName,
      r.menuName,
      tempLabel(r.temperature),
      r.koshi,
      r.price,
      r.rating,
      r.memo,
      r.mapsUrl,
    ]
      .map(csvCell)
      .join(","),
  );
  // 先頭の BOM は Excel での文字化け防止
  const content = "﻿" + [header.join(","), ...rows].join("\r\n");
  download(`soba-records-${stamp()}.csv`, content, "text/csv");
}

/**
 * JSON ファイルを読み込んで記録の配列に変換する。
 * 形式が不正な場合は例外を投げる。
 */
export function parseImportedJson(text: string): SobaRecord[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error("バックアップの形式が正しくありません");
  }
  // 最低限のフィールドがあるものだけ受け入れる
  return data
    .filter((r) => r && typeof r.id === "string" && typeof r.shopName === "string")
    .map((r) => normalize(r as Partial<SobaRecord>));
}

/** 欠けたフィールドを既定値で補う */
function normalize(r: Partial<SobaRecord>): SobaRecord {
  return {
    id: r.id as string,
    shopName: r.shopName ?? "",
    menuName: r.menuName ?? "",
    mapsUrl: r.mapsUrl ?? "",
    address: r.address ?? "",
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    temperature: r.temperature === "hot" ? "hot" : "cold",
    koshi: typeof r.koshi === "number" ? r.koshi : 3,
    price: typeof r.price === "number" ? r.price : null,
    rating: typeof r.rating === "number" ? r.rating : 3,
    memo: r.memo ?? "",
    photo: r.photo ?? "",
    date: r.date ?? new Date().toISOString().slice(0, 10),
    createdAt: r.createdAt ?? new Date().toISOString(),
  };
}

/**
 * 既存の記録と読み込んだ記録を id で統合する。
 * 同じ id があれば読み込んだ方を優先（＝復元）。
 */
export function mergeRecords(
  current: SobaRecord[],
  imported: SobaRecord[],
): SobaRecord[] {
  const byId = new Map<string, SobaRecord>();
  for (const r of current) byId.set(r.id, r);
  for (const r of imported) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
