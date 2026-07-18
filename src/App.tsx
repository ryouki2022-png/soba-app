import { useEffect, useRef, useState } from "react";
import "./App.css";
import SobaApp from "./SobaApp";
import LifeApp from "./LifeApp";
import { requestPersistentStorage } from "./lib/store";
import { exportAllData, importAllData } from "./lib/backup";
import { initSync, subscribeSync, getSyncState } from "./lib/sync";
import { SyncSettings } from "./components/SyncSettings";
import { useBackClose } from "./lib/backstack";

type Mode = "home" | "soba" | "life" | "sync";

// iPhone の Safari でそのまま使っていると、7日間未使用で保存データが
// 削除される。ホーム画面に追加したアプリはこの削除の対象外なので案内する。
function isIOSBrowserNotInstalled(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(ua);
  const standalone =
    (navigator as { standalone?: boolean }).standalone === true ||
    (typeof matchMedia !== "undefined" &&
      matchMedia("(display-mode: standalone)").matches);
  return isIOS && !standalone;
}

// トークンの有効期限までの残り日数（期限未登録なら null）
function tokenDaysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const end = Date.parse(`${expiresAt}T23:59:59`);
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function App() {
  const [mode, setMode] = useState<Mode>("home");
  const [sync, setSync] = useState(getSyncState());
  const fileRef = useRef<HTMLInputElement>(null);

  // スマホの「戻る」ボタンでアプリが閉じずにホームへ戻れるように
  useBackClose(mode !== "home", () => setMode("home"));

  // 保存領域を消されにくくするようブラウザに依頼＋GitHub同期の開始
  useEffect(() => {
    requestPersistentStorage();
    void initSync();
    return subscribeSync(setSync);
  }, []);

  const handleRestore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await importAllData(await file.text());
      alert(
        `復元しました。\nそば：+${result.sobaAdded}件（計${result.total.soba}）\n生活：+${result.lifeAdded}件（計${result.total.life}）`,
      );
    } catch (e) {
      console.error(e);
      alert("復元に失敗しました。正しいバックアップファイル（.json）を選んでください。");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (mode === "soba") return <SobaApp onHome={() => setMode("home")} />;
  if (mode === "life") return <LifeApp onHome={() => setMode("home")} />;
  if (mode === "sync") {
    return (
      <div className="app">
        <SyncSettings onBack={() => setMode("home")} />
      </div>
    );
  }

  return (
    <div className="launcher">
      <div className="launcher__inner">
        <h1 className="launcher__title">きろくノート</h1>
        <p className="launcher__sub">今日はどっちを記録する？</p>

        <button
          type="button"
          className="launch-card launch-card--soba"
          onClick={() => setMode("soba")}
        >
          <span className="launch-card__icon">🍜</span>
          <span className="launch-card__body">
            <span className="launch-card__name">そば記録</span>
            <span className="launch-card__desc">
              食べたそばを記録・お店ごと管理・地図とグラフで振り返り
            </span>
          </span>
          <span className="launch-card__arrow">→</span>
        </button>

        <button
          type="button"
          className="launch-card launch-card--weight"
          onClick={() => setMode("life")}
        >
          <span className="launch-card__icon">📔</span>
          <span className="launch-card__body">
            <span className="launch-card__name">生活記録</span>
            <span className="launch-card__desc">
              体重・食事（朝昼夜おやつ・外食）・勉強時間をまとめて記録
            </span>
          </span>
          <span className="launch-card__arrow">→</span>
        </button>

        {(() => {
          const daysLeft = tokenDaysLeft(sync.configured ? sync.tokenExpiresAt : null);
          const cls = !sync.configured
            ? ""
            : sync.phase === "error" || (daysLeft != null && daysLeft <= 0)
              ? " sync-banner--error"
              : (daysLeft != null && daysLeft <= 21) || !sync.linkSaved
                ? ""
                : " sync-banner--on";
          const label = !sync.configured
            ? "⚠️ 同期がオフです — タップして設定するとデータが消えなくなります"
            : sync.phase === "error"
              ? "🚨 同期が止まっています — タップして確認してください"
              : daysLeft != null && daysLeft <= 0
                ? "🔑 トークンの有効期限が切れました — タップして作り直してください"
                : daysLeft != null && daysLeft <= 21
                  ? `🔑 トークンの期限まであと${daysLeft}日 — 早めに作り直しましょう`
                  : !sync.linkSaved
                    ? "🔗 復元リンクが未保存です — タップして保存（もしもの時に1タップで復活）"
                    : "☁️ 同期オン — データは GitHub に自動保存されています";
          return (
            <button type="button" className={`sync-banner${cls}`} onClick={() => setMode("sync")}>
              {label}
            </button>
          );
        })()}

        {isIOSBrowserNotInstalled() && (
          <div className="install-warn">
            <p className="install-warn__title">
              🚨 この開き方のままだと、データは<strong>7日ごとに消えます</strong>
            </p>
            <p className="install-warn__body">
              iPhoneのSafariは「7日間使わないサイトのデータを全部消す」仕様のためです。
              下の手順で<strong>ホーム画面に追加</strong>すると削除の対象外になり、消えなくなります（30秒）。
            </p>
            <ol className="install-warn__steps">
              <li>画面下の<strong>共有ボタン</strong>（□から↑が出ているマーク）をタップ</li>
              <li><strong>「ホーム画面に追加」</strong>を選んで「追加」</li>
              <li>次からは<strong>ホーム画面の「きろくノート」アイコン</strong>から開く</li>
            </ol>
          </div>
        )}

        <div className="launcher__backup">
          <button type="button" className="launcher__bkbtn" onClick={() => exportAllData()}>
            💾 バックアップ
          </button>
          <button
            type="button"
            className="launcher__bkbtn"
            onClick={() => fileRef.current?.click()}
          >
            📥 復元
          </button>
          <button
            type="button"
            className="launcher__bkbtn"
            onClick={() => setMode("sync")}
          >
            🛟 データ救出
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => handleRestore(e.target.files?.[0])}
          />
        </div>
        <p className="launcher__foot">
          「☁️ 同期」をオンにすると、記録は自動で GitHub に保存され、
          端末側のデータが消えても次に開いたとき自動で復元されます。
        </p>
      </div>
    </div>
  );
}
