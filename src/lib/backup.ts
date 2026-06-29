// アプリ全体（そば＋生活記録）のバックアップ・復元

import { loadArray, saveArray } from "./store";

const SOBA_KEY = "soba-records-v1";
const LIFE_KEY = "life-records-v1";

interface SobaLike {
  id?: string;
}
interface LifeLike {
  date?: string;
}

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
  const soba = await loadArray<SobaLike>(SOBA_KEY);
  const life = await loadArray<LifeLike>(LIFE_KEY);
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
 * バックアップJSONを読み込み、既存データと統合（マージ）する。
 * そばは id、生活は date をキーに重複を防ぐ。既存データは消さない。
 */
export async function importAllData(text: string): Promise<ImportResult> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("バックアップ形式が不正です");
  }

  const incomingSoba: SobaLike[] = Array.isArray(parsed.soba) ? parsed.soba : [];
  const incomingLife: LifeLike[] = Array.isArray(parsed.life) ? parsed.life : [];

  // そば: id でマージ
  const curSoba = await loadArray<SobaLike>(SOBA_KEY);
  const sobaById = new Map<string, SobaLike>();
  for (const r of curSoba) if (r && r.id) sobaById.set(r.id, r);
  let sobaAdded = 0;
  for (const r of incomingSoba) {
    if (r && r.id && !sobaById.has(r.id)) {
      sobaById.set(r.id, r);
      sobaAdded++;
    }
  }
  const mergedSoba = [...sobaById.values()];

  // 生活: date でマージ（既存を優先して残す）
  const curLife = await loadArray<LifeLike>(LIFE_KEY);
  const lifeByDate = new Map<string, LifeLike>();
  for (const r of curLife) if (r && r.date) lifeByDate.set(r.date, r);
  let lifeAdded = 0;
  for (const r of incomingLife) {
    if (r && r.date && !lifeByDate.has(r.date)) {
      lifeByDate.set(r.date, r);
      lifeAdded++;
    }
  }
  const mergedLife = [...lifeByDate.values()];

  await saveArray(SOBA_KEY, mergedSoba);
  await saveArray(LIFE_KEY, mergedLife);

  return {
    sobaAdded,
    lifeAdded,
    total: { soba: mergedSoba.length, life: mergedLife.length },
  };
}
