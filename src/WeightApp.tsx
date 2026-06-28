import { useEffect, useMemo, useState } from "react";
import type { WeightRecord } from "./weight/types";
import {
  loadWeights,
  roundWeight,
  saveWeights,
  upsertWeight,
} from "./weight/storage";
import { LineChart } from "./charts/LineChart";

interface WeightAppProps {
  onHome: () => void;
}

type Range = "7" | "30" | "90" | "all";

const RANGES: { key: Range; label: string }[] = [
  { key: "7", label: "1週間" },
  { key: "30", label: "1ヶ月" },
  { key: "90", label: "3ヶ月" },
  { key: "all", label: "全期間" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtKg(v: number): string {
  return `${v.toFixed(1)}`;
}

function mmdd(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function deltaText(d: number): string {
  if (d === 0) return "±0.0";
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}`;
}

export default function WeightApp({ onHome }: WeightAppProps) {
  const [records, setRecords] = useState<WeightRecord[]>([]);
  const [date, setDate] = useState<string>(today());
  const [weight, setWeight] = useState<number>(60);
  const [note, setNote] = useState<string>("");
  const [range, setRange] = useState<Range>("30");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const loaded = loadWeights();
    setRecords(loaded);
    // 直近の記録があれば初期値に使う（入力の手間を減らす）
    if (loaded.length > 0) setWeight(loaded[loaded.length - 1].weight);
  }, []);

  const persist = (next: WeightRecord[]) => {
    setRecords(next);
    saveWeights(next);
  };

  // 入力中の日付に既存記録があれば、その値を表示に反映
  useEffect(() => {
    const existing = records.find((r) => r.date === date);
    if (existing) {
      setWeight(existing.weight);
      setNote(existing.note);
    }
  }, [date, records]);

  const adjust = (delta: number) => {
    setWeight((w) => roundWeight(Math.min(635, Math.max(0, w + delta))));
  };

  const handleSave = () => {
    const entry: WeightRecord = {
      date,
      weight: roundWeight(weight),
      note: note.trim(),
      createdAt: new Date().toISOString(),
    };
    persist(upsertWeight(records, entry));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  const handleDelete = (d: string) => {
    if (!confirm(`${d} の記録を削除しますか？`)) return;
    persist(records.filter((r) => r.date !== d));
  };

  // 期間でフィルタしたグラフ用データ
  const filtered = useMemo(() => {
    if (range === "all") return records;
    const days = Number(range);
    const from = new Date();
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().slice(0, 10);
    return records.filter((r) => r.date >= fromStr);
  }, [records, range]);

  const chartPoints = filtered.map((r) => ({
    label: mmdd(r.date),
    value: r.weight,
  }));

  const stats = useMemo(() => {
    if (records.length === 0) return null;
    const latest = records[records.length - 1];
    const prev = records.length >= 2 ? records[records.length - 2] : null;
    const start = filtered.length > 0 ? filtered[0] : records[0];
    const min = Math.min(...records.map((r) => r.weight));
    const max = Math.max(...records.map((r) => r.weight));
    return {
      latest,
      fromPrev: prev ? roundWeight(latest.weight - prev.weight) : null,
      fromStart: roundWeight(latest.weight - start.weight),
      min,
      max,
    };
  }, [records, filtered]);

  const history = useMemo(() => [...records].reverse(), [records]);

  return (
    <div className="app weight">
      <header className="wheader">
        <button type="button" className="wheader__home" onClick={onHome}>
          ← ホーム
        </button>
        <h1 className="wheader__title">⚖️ 体重記録</h1>
        <span className="wheader__spacer" />
      </header>

      {/* 現在の体重サマリー */}
      {stats && (
        <section className="wsummary">
          <div className="wsummary__main">
            <span className="wsummary__value">{fmtKg(stats.latest.weight)}</span>
            <span className="wsummary__unit">kg</span>
          </div>
          <div className="wsummary__date">{stats.latest.date} 時点</div>
          <div className="wsummary__deltas">
            {stats.fromPrev !== null && (
              <Delta label="前回比" value={stats.fromPrev} />
            )}
            <Delta label={`${rangeLabel(range)}比`} value={stats.fromStart} />
          </div>
        </section>
      )}

      {/* 入力フォーム */}
      <section className="card-panel">
        <h2 className="panel__title">記録する</h2>
        <label className="field">
          <span className="field__label">日付</span>
          <input
            type="date"
            className="field__input"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <span className="field__label">体重（kg）</span>
        <div className="stepper">
          <button
            type="button"
            className="stepper__btn"
            onClick={() => adjust(-0.1)}
            aria-label="0.1減らす"
          >
            −
          </button>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            className="stepper__value"
            value={weight}
            onChange={(e) =>
              setWeight(e.target.value === "" ? 0 : Number(e.target.value))
            }
          />
          <button
            type="button"
            className="stepper__btn"
            onClick={() => adjust(0.1)}
            aria-label="0.1増やす"
          >
            ＋
          </button>
        </div>
        <div className="stepper__quick">
          <button type="button" onClick={() => adjust(-1)}>
            −1.0
          </button>
          <button type="button" onClick={() => adjust(-0.5)}>
            −0.5
          </button>
          <button type="button" onClick={() => adjust(0.5)}>
            +0.5
          </button>
          <button type="button" onClick={() => adjust(1)}>
            +1.0
          </button>
        </div>

        <label className="field" style={{ marginTop: 14 }}>
          <span className="field__label">メモ（任意）</span>
          <input
            type="text"
            className="field__input"
            placeholder="運動した、外食 など"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <button
          type="button"
          className={`btn btn--primary wsave${justSaved ? " wsave--done" : ""}`}
          onClick={handleSave}
        >
          {justSaved ? "✓ 保存しました" : "この日の体重を保存"}
        </button>
      </section>

      {/* グラフ */}
      <section className="card-panel">
        <div className="panel__head">
          <h2 className="panel__title">変化グラフ</h2>
        </div>
        <div className="range-tabs">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`range-tabs__btn${range === r.key ? " range-tabs__btn--active" : ""}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {chartPoints.length >= 1 ? (
          <LineChart points={chartPoints} formatValue={(v) => fmtKg(v)} color="#3f86c4" />
        ) : (
          <p className="chart-empty">この期間の記録がありません</p>
        )}
        {stats && (
          <div className="wrange-stats">
            <span>最小 {fmtKg(stats.min)}kg</span>
            <span>最大 {fmtKg(stats.max)}kg</span>
            <span>記録数 {records.length}</span>
          </div>
        )}
      </section>

      {/* 履歴 */}
      <section className="card-panel">
        <h2 className="panel__title">記録リスト</h2>
        {history.length === 0 ? (
          <p className="chart-empty">まだ記録がありません</p>
        ) : (
          <ul className="whistory">
            {history.map((r, i) => {
              const prev = history[i + 1];
              const d = prev ? roundWeight(r.weight - prev.weight) : null;
              return (
                <li key={r.date} className="whistory__row">
                  <button
                    type="button"
                    className="whistory__main"
                    onClick={() => setDate(r.date)}
                    title="タップで編集"
                  >
                    <span className="whistory__date">{r.date}</span>
                    <span className="whistory__weight">{fmtKg(r.weight)}kg</span>
                    {d !== null && (
                      <span
                        className={`whistory__delta whistory__delta--${
                          d > 0 ? "up" : d < 0 ? "down" : "flat"
                        }`}
                      >
                        {deltaText(d)}
                      </span>
                    )}
                    {r.note && <span className="whistory__note">{r.note}</span>}
                  </button>
                  <button
                    type="button"
                    className="whistory__del"
                    onClick={() => handleDelete(r.date)}
                    aria-label="削除"
                  >
                    🗑
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Delta({ label, value }: { label: string; value: number }) {
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "→";
  return (
    <div className={`delta delta--${dir}`}>
      <span className="delta__label">{label}</span>
      <span className="delta__value">
        {arrow} {deltaText(value)}kg
      </span>
    </div>
  );
}

function rangeLabel(r: Range): string {
  return RANGES.find((x) => x.key === r)?.label ?? "開始";
}
