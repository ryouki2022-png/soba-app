// アプリ全体（そば＋生活記録）のバックアップ・復元

import { loadArray, saveArray } from "./store";
import {
  SOBA_KEY,
  LIFE_KEY,
  clearTombstones,
  type RawRecord,
} from "./merge";

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** そば・生活の全データを1つのJSONとして書き出す */
export async function exportAllData(): Promise<void> {
  const soba = await loadArray<RawRecord>(SOBA_KEY);
  const life = await loadArray<RawRecord>(LIFE_KEY);
  const payload = {
    app: "kirokunote",
    version: 1,
    exportedAt: new Date().toISOString(),
    soba,
    life,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  download(`kirokunote-backup-${stamp}.json`, JSON.stringify(payload, null, 2));
}

export interface ImportResult {
  sobaAdded: number;
  lifeAdded: number;
  total: { soba: number; life: number };
}

/**
 * バックアップやスナップショットのデータを既存データと統合（マージ）する。
 * そばは id、生活は date をキーに重複を防ぐ。既存データは消さない。
 *
 * 復元で追加した記録は「今復元した」ことが分かるようタイムスタンプを更新し、
 * 過去の削除記録（トゥームストーン）も取り消す。こうしないと、GitHub同期が
 * 「削除済みの古い記録」と誤解して、復元した記録をまた消してしまう。
 */
export async function restoreDataSets(incoming: {
  soba?: RawRecord[];
  life?: RawRecord[];
}): Promise<ImportResult> {
  const now = new Date().toISOString();
  const incomingSoba = incoming.soba ?? [];
  const incomingLife = incoming.life ?? [];

  // そば: id でマージ
  const curSoba = await loadArray<RawRecord>(SOBA_KEY);
  const sobaById = new Map<string, RawRecord>();
  for (const r of curSoba) {
    if (r && typeof r.id === "string") sobaById.set(r.id, r);
  }
  let sobaAdded = 0;
  const addedSobaIds: string[] = [];
  for (const r of incomingSoba) {
    if (r && typeof r.id === "string" && !sobaById.has(r.id)) {
      sobaById.set(r.id, { ...r, updatedAt: now });
      addedSobaIds.push(r.id);
      sobaAdded++;
    }
  }
  const mergedSoba = [...sobaById.values()];

  // 生活: date でマージ（既存を優先して残す）
  const curLife = await loadArray<RawRecord>(LIFE_KEY);
  const lifeByDate = new Map<string, RawRecord>();
  for (const r of curLife) {
    if (r && typeof r.date === "string") lifeByDate.set(r.date, r);
  }
  let lifeAdded = 0;
  const addedLifeDates: string[] = [];
  for (const r of incomingLife) {
    if (r && typeof r.date === "string" && !lifeByDate.has(r.date)) {
      lifeByDate.set(r.date, { ...r, createdAt: now });
      addedLifeDates.push(r.date);
      lifeAdded++;
    }
  }
  const mergedLife = [...lifeByDate.values()];

  await clearTombstones(addedSobaIds, addedLifeDates);
  await saveArray(SOBA_KEY, mergedSoba);
  await saveArray(LIFE_KEY, mergedLife);

  return {
    sobaAdded,
    lifeAdded,
    total: { soba: mergedSoba.length, life: mergedLife.length },
  };
}

/** バックアップJSON（文字列）を読み込み、既存データと統合する */
export async function importAllData(text: string): Promise<ImportResult> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("バックアップ形式が不正です");
  }
  return restoreDataSets({
    soba: Array.isArray(parsed.soba) ? parsed.soba : [],
    life: Array.isArray(parsed.life) ? parsed.life : [],
  });
}
