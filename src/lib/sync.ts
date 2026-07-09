// GitHub リポジトリへの自動同期（データ消失の根本対策）
//
// localStorage / IndexedDB はどちらもブラウザ内の保存領域なので、
// iOS Safari の自動削除（7日間未使用）や履歴消去で丸ごと消えることがある。
// この端末の外＝GitHub のプライベートリポジトリに JSON を自動保存しておけば、
// ブラウザ側が消えても次回起動時に自動で復元できる。
//
// 仕組み:
//   - 記録が保存されるたび（数秒のデバウンス後）に同期
//   - 同期 = リモートJSONを取得 → ローカルと統合 → 双方に差分があれば書き戻し
//   - 統合は lib/merge.ts（削除の記録も考慮するので、消した記録は復活しない）
//   - 競合（他端末が同時に書いた）は sha 不一致で検出し、取り直して再試行

import { loadObject, saveObject, setDataChangeListener } from "./store";
import {
  type DataSet,
  SOBA_KEY,
  LIFE_KEY,
  SOBA_DELETED_KEY,
  LIFE_DELETED_KEY,
  loadLocalDataSet,
  applyDataSet,
  mergeDataSets,
  normalizeDataSet,
  dataSetsEqual,
} from "./merge";

const CONFIG_KEY = "kirokunote-sync-config-v1";
const STATUS_KEY = "kirokunote-sync-status-v1";
const FILE_PATH = "kiroku-data.json";
const WATCHED_KEYS = new Set([SOBA_KEY, LIFE_KEY, SOBA_DELETED_KEY, LIFE_DELETED_KEY]);
const DEBOUNCE_MS = 2500;

/** データが同期などで書き換わったときに画面へ知らせるイベント名 */
export const DATA_UPDATED_EVENT = "kirokunote:data-updated";

export interface SyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface SyncState {
  configured: boolean;
  owner: string;
  repo: string;
  branch: string;
  phase: "off" | "idle" | "syncing" | "error";
  lastSyncAt: string | null;
  error: string | null;
}

export interface SyncResult {
  ok: boolean;
  message: string;
}

interface RemoteFile {
  payload: DataSet | null;
  sha: string | null;
}

let config: SyncConfig | null = null;
let initialized = false;
let running = false;
let queued = false;
let applying = false; // 同期による書き込み中は再同期をスケジュールしない
let timer: ReturnType<typeof setTimeout> | null = null;
let state: SyncState = {
  configured: false,
  owner: "",
  repo: "",
  branch: "",
  phase: "off",
  lastSyncAt: null,
  error: null,
};
const listeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

/** アプリ起動時に一度呼ぶ。設定があれば即同期する。 */
export async function initSync(): Promise<void> {
  if (initialized) return;
  initialized = true;
  setDataChangeListener((key) => {
    if (!applying && WATCHED_KEYS.has(key)) scheduleSync();
  });
  config = await loadObject<SyncConfig>(CONFIG_KEY);
  const status = await loadObject<{ lastSyncAt?: string }>(STATUS_KEY);
  setState({
    configured: !!config,
    owner: config?.owner ?? "",
    repo: config?.repo ?? "",
    branch: config?.branch ?? "",
    phase: config ? "idle" : "off",
    lastSyncAt: status?.lastSyncAt ?? null,
  });
  if (config) void syncNow();
}

/** 同期設定を保存する（null で同期を解除） */
export async function setSyncConfig(next: SyncConfig | null): Promise<void> {
  config = next;
  await saveObject(CONFIG_KEY, next);
  setState({
    configured: !!next,
    owner: next?.owner ?? "",
    repo: next?.repo ?? "",
    branch: next?.branch ?? "",
    phase: next ? "idle" : "off",
    error: null,
  });
}

function scheduleSync(): void {
  if (!config) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, DEBOUNCE_MS);
}

/* ===== GitHub Contents API ===== */

function apiUrl(cfg: SyncConfig): string {
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${FILE_PATH}`;
}

function headers(cfg: SyncConfig, accept: string): HeadersInit {
  return {
    Authorization: `Bearer ${cfg.token}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function friendlyHttpError(status: number): string {
  if (status === 401) return "トークンが無効です（期限切れの可能性）。作り直して設定し直してください。";
  if (status === 403) return "アクセスが拒否されました。トークンの権限（Contents: Read and write）を確認してください。";
  if (status === 404) return "リポジトリが見つかりません。リポジトリ名と、トークンの対象リポジトリを確認してください。";
  return `GitHub API エラー（HTTP ${status}）`;
}

function b64EncodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64DecodeUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function parsePayload(text: string): DataSet | null {
  try {
    const p = JSON.parse(text);
    if (!p || typeof p !== "object") return null;
    return normalizeDataSet({
      soba: Array.isArray(p.soba) ? p.soba : [],
      life: Array.isArray(p.life) ? p.life : [],
      deleted: {
        soba: p.deleted && typeof p.deleted.soba === "object" ? p.deleted.soba : {},
        life: p.deleted && typeof p.deleted.life === "object" ? p.deleted.life : {},
      },
    });
  } catch {
    return null;
  }
}

async function pullRemote(cfg: SyncConfig): Promise<RemoteFile> {
  const url = `${apiUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    headers: headers(cfg, "application/vnd.github.object+json"),
  });
  if (res.status === 404) return { payload: null, sha: null };
  if (!res.ok) throw new Error(friendlyHttpError(res.status));
  const obj = await res.json();
  const sha: string | null = typeof obj.sha === "string" ? obj.sha : null;
  let text: string;
  if (typeof obj.content === "string" && obj.content.length > 0) {
    text = b64DecodeUtf8(obj.content);
  } else {
    // 1MB を超えるファイルは content が空で返るので raw で取り直す
    const raw = await fetch(url, { headers: headers(cfg, "application/vnd.github.raw+json") });
    if (!raw.ok) throw new Error(friendlyHttpError(raw.status));
    text = await raw.text();
  }
  return { payload: parsePayload(text), sha };
}

class ConflictError extends Error {}

async function pushRemote(cfg: SyncConfig, ds: DataSet, sha: string | null): Promise<void> {
  const payload = {
    app: "kirokunote",
    version: 2,
    updatedAt: new Date().toISOString(),
    soba: ds.soba,
    life: ds.life,
    deleted: ds.deleted,
  };
  const body: Record<string, unknown> = {
    message: `データ同期: そば${ds.soba.length}件 / 生活${ds.life.length}件`,
    content: b64EncodeUtf8(JSON.stringify(payload)),
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl(cfg), {
    method: "PUT",
    headers: headers(cfg, "application/vnd.github+json"),
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 422) throw new ConflictError();
  if (!res.ok) throw new Error(friendlyHttpError(res.status));
}

/* ===== 同期本体 ===== */

/** 今すぐ同期する。設定済みならアプリ起動時・保存後にも自動で呼ばれる。 */
export async function syncNow(): Promise<SyncResult> {
  if (!config) return { ok: false, message: "同期は設定されていません" };
  if (running) {
    queued = true;
    return { ok: true, message: "同期中です" };
  }
  running = true;
  setState({ phase: "syncing", error: null });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const local = normalizeDataSet(await loadLocalDataSet());
      const remote = await pullRemote(config);
      const merged = remote.payload ? mergeDataSets(local, remote.payload) : local;

      if (!dataSetsEqual(merged, local)) {
        applying = true;
        try {
          await applyDataSet(merged);
        } finally {
          applying = false;
        }
        window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT));
      }

      // 記録も削除の記録も何もないときだけ push を控える（空ファイルを作らない）。
      // 「全部削除した」状態はトゥームストーンが残るので、ちゃんとリモートへ伝わる。
      const totallyEmpty =
        merged.soba.length === 0 &&
        merged.life.length === 0 &&
        Object.keys(merged.deleted.soba).length === 0 &&
        Object.keys(merged.deleted.life).length === 0;
      const needPush =
        !totallyEmpty && (!remote.payload || !dataSetsEqual(merged, remote.payload));
      if (needPush) {
        try {
          await pushRemote(config, merged, remote.sha);
        } catch (e) {
          if (e instanceof ConflictError) continue; // 取り直して再試行
          throw e;
        }
      }

      const lastSyncAt = new Date().toISOString();
      await saveObject(STATUS_KEY, { lastSyncAt });
      setState({ phase: "idle", lastSyncAt, error: null });
      return {
        ok: true,
        message: `同期しました（そば${merged.soba.length}件 / 生活${merged.life.length}件）`,
      };
    }
    throw new Error("他の端末と同時に更新されたため同期できませんでした。少し待ってからもう一度お試しください。");
  } catch (e) {
    const message =
      e instanceof TypeError
        ? "ネットワークに接続できませんでした。オンラインになると次の保存時に再同期されます。"
        : e instanceof Error
          ? e.message
          : "同期に失敗しました";
    setState({ phase: "error", error: message });
    return { ok: false, message };
  } finally {
    running = false;
    if (queued) {
      queued = false;
      scheduleSync();
    }
  }
}

/** 設定内容が正しいか（接続できるか）を確かめる */
export async function testSyncConfig(cfg: SyncConfig): Promise<SyncResult> {
  try {
    await pullRemote(cfg);
    return { ok: true, message: "接続できました" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "接続に失敗しました" };
  }
}
