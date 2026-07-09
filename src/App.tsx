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

export default function App() {
  const [mode, setMode] = useState<Mode>("home");
  const [syncOn, setSyncOn] = useState(getSyncState().configured);
  const fileRef = useRef<HTMLInputElement>(null);

  // スマホの「戻る」ボタンでアプリが閉じずにホームへ戻れるように
  useBackClose(mode !== "home", () => setMode("home"));

  // 保存領域を消されにくくするようブラウザに依頼＋GitHub同期の開始
  useEffect(() => {
    requestPersistentStorage();
    void initSync();
    return subscribeSync((s) => setSyncOn(s.configured));
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

        <button
          type="button"
          className={`sync-banner${syncOn ? " sync-banner--on" : ""}`}
          onClick={() => setMode("sync")}
        >
          {syncOn
            ? "☁️ 同期オン — データは GitHub に自動保存されています"
            : "⚠️ 同期がオフです — タップして設定するとデータが消えなくなります"}
        </button>

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
