import { useEffect, useRef, useState } from "react";
import "./App.css";
import SobaApp from "./SobaApp";
import LifeApp from "./LifeApp";
import { requestPersistentStorage } from "./lib/store";
import { exportAllData, importAllData } from "./lib/backup";

type Mode = "home" | "soba" | "life";

export default function App() {
  const [mode, setMode] = useState<Mode>("home");
  const fileRef = useRef<HTMLInputElement>(null);

  // 保存領域を消されにくくするようブラウザに依頼（データ消失対策）
  useEffect(() => {
    requestPersistentStorage();
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
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => handleRestore(e.target.files?.[0])}
          />
        </div>
        <p className="launcher__foot">
          データはこの端末内に保存されます。機種変更や万一の消失に備え、
          ときどき「バックアップ」で保存しておくと安心です。
        </p>
      </div>
    </div>
  );
}
