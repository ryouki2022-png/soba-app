// そば・生活データのマージと「削除の記録（トゥームストーン）」
//
// 複数の保存先（この端末・GitHub・バックアップファイル）を統合するとき、
// 単純な足し合わせだと「削除したはずの記録が復活する」問題が起きる。
// そこで削除時に {キー, 削除日時} を残し、マージ時は
// 「記録の更新日時 > 削除日時」の場合だけ記録を生かす。

import { loadArray, saveArray } from "./store";

export const SOBA_KEY = "soba-records-v1";
export const LIFE_KEY = "life-records-v1";
export const SOBA_DELETED_KEY = "soba-deleted-v1";
export const LIFE_DELETED_KEY = "life-deleted-v1";

/** 汎用の記録（スキーマ差異を吸収するため unknown ベースで扱う） */
export type RawRecord = Record<string, unknown>;

/** 削除の記録: キー（そば=id / 生活=date）→ 削除日時(ISO) */
export type TombstoneMap = Record<string, string>;

export interface DataSet {
  soba: RawRecord[];
  life: RawRecord[];
  deleted: { soba: TombstoneMap; life: TombstoneMap };
}

interface TombstoneEntry {
  key: string;
  at: string;
}

/** そばの記録の「最終更新日時」。編集で updatedAt が付く。 */
export function sobaStamp(r: RawRecord): string {
  const u = typeof r.updatedAt === "string" ? r.updatedAt : "";
  const c = typeof r.createdAt === "string" ? r.createdAt : "";
  return u > c ? u : c;
}

/** 生活記録の「最終更新日時」。保存のたびに createdAt が更新される。 */
export function lifeStamp(r: RawRecord): string {
  return typeof r.createdAt === "string" ? r.createdAt : "";
}

function toMap(entries: TombstoneEntry[]): TombstoneMap {
  const map: TombstoneMap = {};
  for (const e of entries) {
    if (e && typeof e.key === "string" && typeof e.at === "string") {
      if (!map[e.key] || map[e.key] < e.at) map[e.key] = e.at;
    }
  }
  return map;
}

function toEntries(map: TombstoneMap): TombstoneEntry[] {
  return Object.entries(map).map(([key, at]) => ({ key, at }));
}

/** ローカル（この端末）の全データを DataSet として読み込む */
export async function loadLocalDataSet(): Promise<DataSet> {
  const [soba, life, sobaDel, lifeDel] = await Promise.all([
    loadArray<RawRecord>(SOBA_KEY),
    loadArray<RawRecord>(LIFE_KEY),
    loadArray<TombstoneEntry>(SOBA_DELETED_KEY),
    loadArray<TombstoneEntry>(LIFE_DELETED_KEY),
  ]);
  return {
    soba,
    life,
    deleted: { soba: toMap(sobaDel), life: toMap(lifeDel) },
  };
}

/** DataSet をローカルへ保存する */
export async function applyDataSet(ds: DataSet): Promise<void> {
  await saveArray(SOBA_KEY, ds.soba);
  await saveArray(LIFE_KEY, ds.life);
  await saveArray(SOBA_DELETED_KEY, toEntries(ds.deleted.soba));
  await saveArray(LIFE_DELETED_KEY, toEntries(ds.deleted.life));
}

/** そばの記録の削除を記録する */
export async function recordSobaDeletion(id: string): Promise<void> {
  const cur = await loadArray<TombstoneEntry>(SOBA_DELETED_KEY);
  await saveArray(SOBA_DELETED_KEY, [
    ...cur,
    { key: id, at: new Date().toISOString() },
  ]);
}

/** 生活記録の削除を記録する */
export async function recordLifeDeletion(date: string): Promise<void> {
  const cur = await loadArray<TombstoneEntry>(LIFE_DELETED_KEY);
  await saveArray(LIFE_DELETED_KEY, [
    ...cur,
    { key: date, at: new Date().toISOString() },
  ]);
}

/** 指定キーの削除記録を取り消す（バックアップからの復元時に使う） */
export async function clearTombstones(
  sobaIds: Iterable<string>,
  lifeDates: Iterable<string>,
): Promise<void> {
  const sobaSet = new Set(sobaIds);
  const lifeSet = new Set(lifeDates);
  if (sobaSet.size > 0) {
    const cur = await loadArray<TombstoneEntry>(SOBA_DELETED_KEY);
    await saveArray(SOBA_DELETED_KEY, cur.filter((e) => !sobaSet.has(e.key)));
  }
  if (lifeSet.size > 0) {
    const cur = await loadArray<TombstoneEntry>(LIFE_DELETED_KEY);
    await saveArray(LIFE_DELETED_KEY, cur.filter((e) => !lifeSet.has(e.key)));
  }
}

function mergeTombstones(a: TombstoneMap, b: TombstoneMap): TombstoneMap {
  const out: TombstoneMap = { ...a };
  for (const [k, at] of Object.entries(b)) {
    if (!out[k] || out[k] < at) out[k] = at;
  }
  return out;
}

function mergeRecords(
  a: RawRecord[],
  b: RawRecord[],
  keyOf: (r: RawRecord) => string,
  stampOf: (r: RawRecord) => string,
  deleted: TombstoneMap,
): RawRecord[] {
  const byKey = new Map<string, RawRecord>();
  for (const r of [...a, ...b]) {
    if (!r || typeof r !== "object") continue;
    const key = keyOf(r);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || stampOf(r) > stampOf(prev)) byKey.set(key, r);
  }
  const out: RawRecord[] = [];
  for (const [key, r] of byKey) {
    const del = deleted[key];
    // 削除より後に作成・更新された記録だけ生かす
    if (del && stampOf(r) <= del) continue;
    out.push(r);
  }
  return out;
}

function sobaKey(r: RawRecord): string {
  return typeof r.id === "string" ? r.id : "";
}
function lifeKey(r: RawRecord): string {
  return typeof r.date === "string" ? r.date : "";
}

/** 2つの DataSet を統合する（削除の記録も考慮） */
export function mergeDataSets(a: DataSet, b: DataSet): DataSet {
  const sobaDel = mergeTombstones(a.deleted.soba, b.deleted.soba);
  const lifeDel = mergeTombstones(a.deleted.life, b.deleted.life);
  return normalizeDataSet({
    soba: mergeRecords(a.soba, b.soba, sobaKey, sobaStamp, sobaDel),
    life: mergeRecords(a.life, b.life, lifeKey, lifeStamp, lifeDel),
    deleted: { soba: sobaDel, life: lifeDel },
  });
}

/** 並び順を決めて比較・保存を安定させる */
export function normalizeDataSet(ds: DataSet): DataSet {
  const soba = [...ds.soba].sort((x, y) => {
    const d = sobaStamp(y).localeCompare(sobaStamp(x));
    return d !== 0 ? d : sobaKey(x).localeCompare(sobaKey(y));
  });
  const life = [...ds.life].sort((x, y) => lifeKey(x).localeCompare(lifeKey(y)));
  const sortMap = (m: TombstoneMap): TombstoneMap =>
    Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  return {
    soba,
    life,
    deleted: { soba: sortMap(ds.deleted.soba), life: sortMap(ds.deleted.life) },
  };
}

/** 内容が同じかどうか（normalize 済みを前提に比較） */
export function dataSetsEqual(a: DataSet, b: DataSet): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
