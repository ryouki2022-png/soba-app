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
const LINK_SAVED_KEY = "kirokunote-synclink-saved-v1";
const FILE_PATH = "kiroku-data.json";
/** 生存信号ファイル。記録が増えなくても「同期は生きている」ことを外から確認できる */
const HEARTBEAT_PATH = "heartbeat.json";
/** 生存信号を書く間隔（これより最近書いていたら書かない） */
const HEARTBEAT_MS = 6 * 24 * 60 * 60 * 1000;
const WATCHED_KEYS = new Set([SOBA_KEY, LIFE_KEY, SOBA_DELETED_KEY, LIFE_DELETED_KEY]);
const DEBOUNCE_MS = 1500;
/** 画面復帰時、前回同期からこれ以上経っていたら同期し直す */
const REFRESH_MS = 60 * 1000;

/** データが同期などで書き換わったときに画面へ知らせるイベント名 */
export const DATA_UPDATED_EVENT = "kirokunote:data-updated";

export interface SyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  /** トークンの有効期限（YYYY-MM-DD、任意）。期限が近づくとホーム画面で知らせる */
  tokenExpiresAt?: string;
}

export interface SyncState {
  configured: boolean;
  owner: string;
  repo: string;
  branch: string;
  tokenExpiresAt: string | null;
  /** 復元リンクを保存（コピー/共有）済みか。未保存ならホームで促す */
  linkSaved: boolean;
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
  tokenExpiresAt: null,
  linkSaved: false,
  phase: "off",
  lastSyncAt: null,
  error: null,
};
const listeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}

/** 現在の同期設定（復元リンクの生成に使う）。未設定なら null */
export function getSyncConfig(): SyncConfig | null {
  return config;
}

/**
 * 同期設定を丸ごと埋め込んだ「復元リンク」を作る。
 * ブラウザのデータが全部消えても、このリンクを開くだけで同期設定が復活し、
 * GitHub から記録が自動で戻ってくる。トークンが入っているので、
 * パスワードと同じ扱いで保管してもらう（メモ帳・パスワード管理など）。
 * トークンは URL のフラグメント（#以降）に入れるためサーバーへは送られない。
 */
export function buildRecoveryLink(cfg: SyncConfig): string {
  const json = JSON.stringify({
    o: cfg.owner,
    r: cfg.repo,
    b: cfg.branch,
    t: cfg.token,
    e: cfg.tokenExpiresAt ?? "",
  });
  const b64 = b64EncodeUtf8(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${location.origin}${location.pathname}#sync=${b64}`;
}

/**
 * 貼り付けられたテキスト（復元リンク全体など）から同期設定を取り出す。
 * リンクをタップすると別ブラウザで開いてしまう iPhone でも、
 * いつも使うアプリの中に「貼り付けて復元」できるようにするための入口。
 */
export function parseRecoveryText(text: string): SyncConfig | null {
  return parseRecoveryHash(text);
}

/** URL の #sync=… から同期設定を取り出す（復元リンクで開かれたとき用） */
function parseRecoveryHash(hash: string): SyncConfig | null {
  const m = /[#&]sync=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const p = JSON.parse(b64DecodeUtf8(padded));
    if (!p || typeof p !== "object") return null;
    const owner = typeof p.o === "string" ? p.o.trim() : "";
    const repo = typeof p.r === "string" ? p.r.trim() : "";
    const branch = typeof p.b === "string" && p.b.trim() ? p.b.trim() : "main";
    const token = typeof p.t === "string" ? p.t.trim() : "";
    const tokenExpiresAt = typeof p.e === "string" && p.e ? p.e : undefined;
    if (!owner || !repo || !token) return null;
    return { owner, repo, branch, token, tokenExpiresAt };
  } catch {
    return null;
  }
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
  // 取りこぼし防止:
  //  - アプリを閉じる/切り替える瞬間: 待機中の同期を即座に実行
  //  - 画面へ戻ってきたとき: しばらく同期していなければ同期し直す
  //  - オフラインから復帰したとき: すぐ同期
  window.addEventListener("visibilitychange", () => {
    if (!config) return;
    if (document.visibilityState === "hidden") {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        void syncNow();
      }
    } else if (document.visibilityState === "visible") {
      const last = state.lastSyncAt ? Date.parse(state.lastSyncAt) : 0;
      if (Date.now() - last > REFRESH_MS) void syncNow();
    }
  });
  window.addEventListener("pagehide", () => {
    if (config && timer) {
      clearTimeout(timer);
      timer = null;
      void syncNow();
    }
  });
  window.addEventListener("online", () => {
    if (config) void syncNow();
  });
  config = await loadObject<SyncConfig>(CONFIG_KEY);

  // 復元リンク（#sync=…）で開かれた場合は、リンク内の設定を取り込む。
  // ブラウザのデータが消えても、リンクを開くだけで同期（＝自動復元）が復活する。
  let viaLink = false;
  const linked = parseRecoveryHash(location.hash);
  if (linked) {
    // トークンが画面に残らないよう、URL からはすぐ消す
    history.replaceState(null, "", location.pathname + location.search);
    const test = await testSyncConfig(linked);
    if (test.ok || !config) {
      // 接続確認に通ったら採用。失敗しても、他に設定が無ければ入れておく
      // （エラー内容はホームのバナーと同期画面に表示される）
      config = linked;
      viaLink = true;
      await saveObject(CONFIG_KEY, linked);
      // リンクから復元できた＝リンクは手元にあるので、「保存して」の案内は不要
      await saveObject(LINK_SAVED_KEY, { savedAt: new Date().toISOString() });
    }
  }

  const status = await loadObject<{ lastSyncAt?: string }>(STATUS_KEY);
  const linkSaved = viaLink || !!(await loadObject<{ savedAt?: string }>(LINK_SAVED_KEY));
  setState({
    configured: !!config,
    owner: config?.owner ?? "",
    repo: config?.repo ?? "",
    branch: config?.branch ?? "",
    tokenExpiresAt: config?.tokenExpiresAt ?? null,
    linkSaved,
    phase: config ? "idle" : "off",
    lastSyncAt: status?.lastSyncAt ?? null,
  });
  if (config) void syncNow();
}

/** 同期設定を保存する（null で同期を解除） */
export async function setSyncConfig(next: SyncConfig | null): Promise<void> {
  config = next;
  await saveObject(CONFIG_KEY, next);
  // 設定が変わると古い復元リンクは使えなくなるので、「保存済み」も一度リセットする
  await saveObject(LINK_SAVED_KEY, null);
  setState({
    configured: !!next,
    owner: next?.owner ?? "",
    repo: next?.repo ?? "",
    branch: next?.branch ?? "",
    tokenExpiresAt: next?.tokenExpiresAt ?? null,
    linkSaved: false,
    phase: next ? "idle" : "off",
    error: null,
  });
}

/** 復元リンクをコピー/共有できたら呼ぶ（ホームの「未保存」案内を消す） */
export async function markRecoveryLinkSaved(): Promise<void> {
  await saveObject(LINK_SAVED_KEY, { savedAt: new Date().toISOString() });
  setState({ linkSaved: true });
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

/**
 * 生存信号を書き込む（失敗しても同期には影響させない）。
 * 週1回 heartbeat.json を更新することで、見張り側が
 * 「記録が増えていないだけ」と「同期が止まっている」を区別できる。
 */
async function pushHeartbeat(cfg: SyncConfig): Promise<void> {
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${HEARTBEAT_PATH}`;
  let sha: string | null = null;
  const res = await fetch(`${url}?ref=${encodeURIComponent(cfg.branch)}`, {
    headers: headers(cfg, "application/vnd.github.object+json"),
  });
  if (res.ok) {
    const obj = await res.json();
    sha = typeof obj.sha === "string" ? obj.sha : null;
  } else if (res.status !== 404) {
    return;
  }
  const body: Record<string, unknown> = {
    message: "生存確認",
    content: b64EncodeUtf8(JSON.stringify({ at: new Date().toISOString() })),
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  await fetch(url, {
    method: "PUT",
    headers: headers(cfg, "application/vnd.github+json"),
    body: JSON.stringify(body),
  });
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
      const prev = await loadObject<{ lastHeartbeatAt?: string }>(STATUS_KEY);
      let lastHeartbeatAt = prev?.lastHeartbeatAt ?? null;
      if (!lastHeartbeatAt || Date.now() - Date.parse(lastHeartbeatAt) > HEARTBEAT_MS) {
        pushHeartbeat(config).catch(() => {});
        lastHeartbeatAt = lastSyncAt;
      }
      await saveObject(STATUS_KEY, { lastSyncAt, lastHeartbeatAt });
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
