import { useState } from "react";
import "./App.css";
import SobaApp from "./SobaApp";
import LifeApp from "./LifeApp";

type Mode = "home" | "soba" | "life";

export default function App() {
  const [mode, setMode] = useState<Mode>("home");

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

        <p className="launcher__foot">データはこの端末内にのみ保存されます</p>
      </div>
    </div>
  );
}
