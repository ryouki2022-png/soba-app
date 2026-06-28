// 記録をお店ごとにまとめる（集計）ユーティリティ

import type { SobaRecord } from "../types";

export interface StoreSummary {
  /** 表示用の店名（最新の記録の表記を採用） */
  name: string;
  /** 照合用に正規化したキー */
  key: string;
  /** マップリンク（最新の、リンクがある記録から） */
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  /** その店の全記録（新しい順） */
  visits: SobaRecord[];
  count: number;
  avgRating: number;
  avgKoshi: number;
  minPrice: number | null;
  maxPrice: number | null;
  hotCount: number;
  coldCount: number;
  /** 最後に訪れた日 */
  lastVisit: string;
}

/** 店名を照合用に正規化する（前後の空白を除去し小文字化） */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** 記録をお店ごとにまとめ、最近行った順に返す */
export function groupByStore(records: SobaRecord[]): StoreSummary[] {
  const map = new Map<string, SobaRecord[]>();
  for (const r of records) {
    const key = normalizeName(r.shopName);
    if (!key) continue;
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }

  const summaries: StoreSummary[] = [];
  for (const [key, group] of map) {
    summaries.push(summarize(key, group));
  }
  return summaries.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
}

/** 指定した店名に一致するお店の集計を返す（なければ null） */
export function findStore(
  records: SobaRecord[],
  name: string,
): StoreSummary | null {
  const key = normalizeName(name);
  if (!key) return null;
  const group = records.filter((r) => normalizeName(r.shopName) === key);
  return group.length ? summarize(key, group) : null;
}

function summarize(key: string, group: SobaRecord[]): StoreSummary {
  // 新しい順に並べる
  const visits = [...group].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
  });
  const latest = visits[0];

  const prices = visits
    .map((v) => v.price)
    .filter((p): p is number => typeof p === "number");

  // マップ情報は最新のリンクありレコードを優先
  const withMap = visits.find((v) => v.mapsUrl);
  const withCoord = visits.find((v) => v.lat !== null && v.lng !== null);

  return {
    name: latest.shopName,
    key,
    mapsUrl: withMap?.mapsUrl ?? "",
    lat: withCoord?.lat ?? null,
    lng: withCoord?.lng ?? null,
    visits,
    count: visits.length,
    avgRating: avg(visits.map((v) => v.rating)),
    avgKoshi: avg(visits.map((v) => v.koshi)),
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    hotCount: visits.filter((v) => v.temperature === "hot").length,
    coldCount: visits.filter((v) => v.temperature === "cold").length,
    lastVisit: latest.date,
  };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
