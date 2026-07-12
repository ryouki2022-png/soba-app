// 「☁️ 同期・データ救出」画面
//   1. GitHub 同期の設定（データ消失の根本対策）
//   2. 保存状態の診断とスナップショットからの復元（データ救出）

import { useEffect, useState } from "react";
import {
  buildRecoveryLink,
  getSyncConfig,
  getSyncState,
  setSyncConfig,
  subscribeSync,
  syncNow,
  testSyncConfig,
  type SyncState,
} from "../lib/sync";
import {
  listSnapshots,
  readSnapshot,
  storageReport,
  type SnapshotInfo,
  type StorageReport,
} from "../lib/store";
import { SOBA_KEY, LIFE_KEY } from "../lib/merge";
import { restoreDataSets } from "../lib/backup";

const LEGACY_WEIGHT_KEY = "weight-records-v1";

const KEY_LABELS: Record<string, string> = {
  [SOBA_KEY]: "🍜 そば記録",
  [LIFE_KEY]: "📔 生活記録",
  [LEGACY_WEIGHT_KEY]: "⚖️ 旧・体重記録",
};

interface SyncSettingsProps {
  onBack: () => void;
}

export function SyncSettings({ onBack }: SyncSettingsProps) {
  const [sync, setSync] = useState<SyncState>(getSyncState());
  const [editing, setEditing] = useState(!getSyncState().configured);
  const [owner, setOwner] = useState(sync.owner || "ryouki2022-png");
  const [repo, setRepo] = useState(sync.repo || "kiroku-data");
  const [branch, setBranch] = useState(sync.branch || "main");
  const [token, setToken] = useState("");
  const [expires, setExpires] = useState(sync.tokenExpiresAt ?? "");
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [report, setReport] = useState<StorageReport | null>(null);
  const [snaps, setSnaps] = useState<SnapshotInfo[]>([]);

  useEffect(() => subscribeSync(setSync), []);

  useEffect(() => {
    storageReport([SOBA_KEY, LIFE_KEY, LEGACY_WEIGHT_KEY]).then(setReport);
    listSnapshots().then(setSnaps);
  }, []);

  const handleSave = async () => {
    const cfg = {
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || "main",
      token: token.trim(),
      tokenExpiresAt: expires || undefined,
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      setFormMsg("ユーザー名・リポジトリ名・トークンをすべて入力してください");
      return;
    }
    setBusy(true);
    setFormMsg("接続を確認しています…");
    const test = await testSyncConfig(cfg);
    if (!test.ok) {
      setBusy(false);
      setFormMsg(`❌ ${test.message}`);
      return;
    }
    await setSyncConfig(cfg);
    setToken("");
    setFormMsg("✅ 接続できました。同期しています…");
    const result = await syncNow();
    setBusy(false);
    setEditing(false);
    setFormMsg(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
  };

  const handleDisable = async () => {
    if (!confirm("同期を解除しますか？（GitHub上のデータは残ります）")) return;
    await setSyncConfig(null);
    setEditing(true);
    setFormMsg(null);
  };

  const handleSyncNow = async () => {
    setBusy(true);
    const result = await syncNow();
    setBusy(false);
    setFormMsg(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
    storageReport([SOBA_KEY, LIFE_KEY, LEGACY_WEIGHT_KEY]).then(setReport);
  };

  const handleCopyRecoveryLink = async () => {
    const cfg = getSyncConfig();
    if (!cfg) return;
    const link = buildRecoveryLink(cfg);
    try {
      await navigator.clipboard.writeText(link);
      setLinkMsg("✅ コピーしました。スマホの「メモ」などパスワードと同じ扱いの場所に貼り付けて保存してください。");
    } catch {
      // クリップボードが使えない環境では手動コピー用に表示する
      prompt("このリンクをコピーして、メモなどに保存してください", link);
      setLinkMsg(null);
    }
  };

  const handleRestoreSnapshot = async (s: SnapshotInfo) => {
    if (!confirm(`${s.date} 時点の${KEY_LABELS[s.storageKey] ?? s.storageKey}（${s.count}件）を今のデータに統合しますか？\n（今あるデータは消えません）`)) {
      return;
    }
    const data = await readSnapshot(s.storageKey, s.date);
    if (!data) {
      alert("スナップショットを読み込めませんでした");
      return;
    }
    const result = await restoreDataSets(
      s.storageKey === SOBA_KEY
        ? { soba: data as Record<string, unknown>[] }
        : { life: data as Record<string, unknown>[] },
    );
    alert(
      `復元しました。\nそば：+${result.sobaAdded}件（計${result.total.soba}）\n生活：+${result.lifeAdded}件（計${result.total.life}）`,
    );
    storageReport([SOBA_KEY, LIFE_KEY, LEGACY_WEIGHT_KEY]).then(setReport);
  };

  return (
    <>
      <header className="wheader">
        <button type="button" className="wheader__home" onClick={onBack}>
          ← ホーム
        </button>
        <h1 className="wheader__title">☁️ 同期・データ救出</h1>
        <span className="wheader__spacer" />
      </header>

      {/* ===== GitHub 同期 ===== */}
      <section className="card-panel">
        <h2 className="panel__title">☁️ GitHub 自動同期</h2>
        <p className="sync-note">
          スマホのブラウザは、しばらく使わないと保存データを<strong>丸ごと消す</strong>ことがあります
          （これが「定期的にデータが消える」原因です）。
          GitHub のプライベートリポジトリへ自動保存しておけば、
          端末側が消えても<strong>次に開いたとき自動で復元</strong>されます。
        </p>

        {sync.configured && !editing ? (
          <>
            <div className="sync-status">
              <div className="sync-status__row">
                <span className="sync-status__label">保存先</span>
                <span>
                  {sync.owner}/{sync.repo}（{sync.branch}）
                </span>
              </div>
              <div className="sync-status__row">
                <span className="sync-status__label">状態</span>
                <span>
                  {sync.phase === "syncing" && "🔄 同期中…"}
                  {sync.phase === "idle" && "✅ 同期オン"}
                  {sync.phase === "error" && `⚠️ ${sync.error}`}
                </span>
              </div>
              {sync.lastSyncAt && (
                <div className="sync-status__row">
                  <span className="sync-status__label">最終同期</span>
                  <span>{new Date(sync.lastSyncAt).toLocaleString("ja-JP")}</span>
                </div>
              )}
            </div>
            {formMsg && <p className="sync-msg">{formMsg}</p>}
            <div className="sync-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={handleSyncNow}
              >
                🔄 今すぐ同期
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
                設定を変える
              </button>
              <button type="button" className="btn btn--ghost" onClick={handleDisable}>
                同期を解除
              </button>
            </div>

            <h3 className="sync-subtitle">🔗 復元リンク（もしもの備え・おすすめ）</h3>
            <p className="sync-note sync-note--small">
              ブラウザのデータが丸ごと消えても、<strong>このリンクを一度開くだけ</strong>で
              同期設定が復活し、記録も GitHub から自動で戻ります。
              トークンが入っているので<strong>パスワードと同じ扱い</strong>で、
              スマホの「メモ」やパスワード管理アプリに保存しておいてください。
            </p>
            <div className="sync-actions">
              <button type="button" className="btn btn--ghost" onClick={handleCopyRecoveryLink}>
                📋 復元リンクをコピー
              </button>
            </div>
            {linkMsg && <p className="sync-msg">{linkMsg}</p>}
          </>
        ) : (
          <>
            <details className="sync-guide" open={!sync.configured}>
              <summary>はじめての設定手順（3ステップ・5分）</summary>
              <ol className="sync-guide__steps">
                <li>
                  リポジトリを用意する。<strong>すでに <code>kiroku-data</code> を作ってあれば、この手順は飛ばしてOK</strong>
                  （過去に同期していたデータもそのまま復元されます）。まだ無ければ{" "}
                  <a href="https://github.com/new" target="_blank" rel="noreferrer">
                    github.com/new
                  </a>{" "}
                  で作成。名前は <code>kiroku-data</code>、
                  <strong>必ず「Private」を選ぶ</strong>（Public だと記録が誰でも見えてしまいます）。
                  「Add a README file」にもチェック。
                </li>
                <li>
                  <a
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noreferrer"
                  >
                    トークン作成ページ
                  </a>{" "}
                  でアクセストークンを作る。
                  <ul>
                    <li>
                      Expiration（期限）: <strong>いちばん長いもの（Custom で1年後など）</strong>。
                      選んだ期限の日付を、下の「トークンの有効期限」欄にも入れておくと、
                      切れる前にホーム画面でお知らせします
                    </li>
                    <li>Repository access: 「Only select repositories」→ <code>kiroku-data</code> だけを選ぶ</li>
                    <li>Permissions → Repository permissions → <strong>Contents: Read and write</strong></li>
                  </ul>
                  作成後に表示される <code>github_pat_…</code> をコピー。
                </li>
                <li>下の欄に貼り付けて「保存して同期を開始」。</li>
                <li>
                  保存できたら、表示される<strong>「🔗 復元リンク」をコピーしてメモに保存</strong>。
                  次からはデータが消えてもリンクを開くだけで復活します。
                </li>
              </ol>
            </details>

            <label className="field">
              <span className="field__label">GitHub ユーザー名</span>
              <input
                type="text"
                className="field__input"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
            <label className="field">
              <span className="field__label">リポジトリ名（プライベート推奨）</span>
              <input
                type="text"
                className="field__input"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
            <label className="field">
              <span className="field__label">ブランチ</span>
              <input
                type="text"
                className="field__input"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
            <label className="field">
              <span className="field__label">アクセストークン</span>
              <input
                type="password"
                className="field__input"
                placeholder="github_pat_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">
                トークンの有効期限（任意・切れる前にホームでお知らせ）
              </span>
              <input
                type="date"
                className="field__input"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </label>
            {formMsg && <p className="sync-msg">{formMsg}</p>}
            <div className="sync-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={handleSave}
              >
                保存して同期を開始
              </button>
              {sync.configured && (
                <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
                  キャンセル
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ===== データ救出 ===== */}
      <section className="card-panel">
        <h2 className="panel__title">🛟 データ救出</h2>
        <p className="sync-note">
          「消えた」データが、実は<strong>別の場所に残っている</strong>ことがよくあります。
          iPhone では Safari で開いた場合と、ホーム画面に追加したアプリから開いた場合で
          <strong>保存場所が別々</strong>です。以前データを入れていた開き方
          （Safari で直接 / ホーム画面のアイコン / 別のブラウザ）でこのアプリを開いてみてください。
          データが表示されたら、その画面で上の GitHub 同期をオンにすれば、
          どこから開いても同じデータが使えるようになります。
        </p>

        <h3 className="sync-subtitle">この端末の保存状態</h3>
        {report ? (
          <>
            <table className="diag-table">
              <thead>
                <tr>
                  <th>データ</th>
                  <th>localStorage</th>
                  <th>IndexedDB</th>
                </tr>
              </thead>
              <tbody>
                {report.keys.map((k) => (
                  <tr key={k.key}>
                    <td>{KEY_LABELS[k.key] ?? k.key}</td>
                    <td>{k.ls == null ? "−" : `${k.ls}件`}</td>
                    <td>{k.idb == null ? "−" : `${k.idb}件`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sync-note sync-note--small">
              消えにくい設定（persist）:{" "}
              {report.persisted == null ? "不明" : report.persisted ? "有効 ✅" : "無効（ブラウザが拒否）"}
              {report.usage != null && report.quota != null && (
                <>
                  ／ 使用量: {(report.usage / 1024 / 1024).toFixed(1)}MB /{" "}
                  {(report.quota / 1024 / 1024).toFixed(0)}MB
                </>
              )}
            </p>
          </>
        ) : (
          <p className="sync-note sync-note--small">確認中…</p>
        )}

        <h3 className="sync-subtitle">日ごとの自動スナップショット</h3>
        {snaps.length === 0 ? (
          <p className="sync-note sync-note--small">
            まだスナップショットがありません（記録を保存した日から自動で残ります）
          </p>
        ) : (
          <ul className="snap-list">
            {snaps.map((s) => (
              <li key={`${s.storageKey}:${s.date}`} className="snap-list__row">
                <span>
                  {s.date} — {KEY_LABELS[s.storageKey] ?? s.storageKey}（{s.count}件）
                </span>
                <button
                  type="button"
                  className="btn btn--ghost snap-list__btn"
                  onClick={() => handleRestoreSnapshot(s)}
                >
                  統合して復元
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
