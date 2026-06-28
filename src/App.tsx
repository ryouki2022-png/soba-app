import { useState } from "react";
import "./App.css";
import SobaApp from "./SobaApp";
import WeightApp from "./WeightApp";

type Mode = "home" | "soba" | "weight";

export default function App() {
  const [mode, setMode] = useState<Mode>("home");

  if (mode === "soba") return <SobaApp onHome={() => setMode("home")} />;
  if (mode === "weight") return <WeightApp onHome={() => setMode("home")} />;

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
          onClick={() => setMode("weight")}
        >
          <span className="launch-card__icon">⚖️</span>
          <span className="launch-card__body">
            <span className="launch-card__name">体重記録</span>
            <span className="launch-card__desc">
              0.1kg単位で記録・変化グラフを期間で確認
            </span>
          </span>
          <span className="launch-card__arrow">→</span>
        </button>

        <p className="launcher__foot">データはこの端末内にのみ保存されます</p>
      </div>
    </div>
  );
}
