import { useEffect, useMemo, useState } from "react";
import type { LifeRecord, MealSlot } from "./life/types";
import { MEAL_SLOTS, emptyMeals, outsideCount } from "./life/types";
import { loadLife, roundWeight, saveLife, upsertLife } from "./life/storage";
import { loadRecords as loadSoba } from "./storage";
import type { SobaRecord } from "./types";
import { LineChart } from "./charts/LineChart";
import { BarChart } from "./charts/BarChart";
import { daysAgoStr, todayStr } from "./lib/date";

interface LifeAppProps {
  onHome: () => void;
}

type Tab = "log" | "graph" | "history";
type Range = "7" | "30" | "90" | "all";

const RANGES: { key: Range; label: string }[] = [
  { key: "7", label: "1週間" },
  { key: "30", label: "1ヶ月" },
  { key: "90", label: "3ヶ月" },
  { key: "all", label: "全期間" },
];

function today(): string {
  return todayStr();
}
function mmdd(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}
function fmtKg(v: number): string {
  return v.toFixed(1);
}
function fmtStudy(min: number): string {
  if (min <= 0) return "0分";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h ? `${h}時間` : ""}${m ? `${m}分` : h ? "" : "0分"}`;
}

export default function LifeApp({ onHome }: LifeAppProps) {
  const [records, setRecords] = useState<LifeRecord[]>([]);
  const [soba, setSoba] = useState<SobaRecord[]>([]);
  const [tab, setTab] = useState<Tab>("log");
  const [range, setRange] = useState<Range>("30");

  // 入力中の下書き
  const [date, setDate] = useState<string>(today());
  const [weight, setWeight] = useState<number | null>(null);
  const [meals, setMeals] = useState(emptyMeals());
  const [studyMinutes, setStudyMinutes] = useState(0);
  const [note, setNote] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    loadLife().then((r) => alive && setRecords(r));
    loadSoba().then((r) => alive && setSoba(r));
    return () => {
      alive = false;
    };
  }, []);

  // 日付に対応する既存記録を下書きへ読み込む
  useEffect(() => {
    const r = records.find((x) => x.date === date);
    if (r) {
      setWeight(r.weight);
      setMeals(r.meals);
      setStudyMinutes(r.studyMinutes);
      setNote(r.note);
    } else {
      // 新しい日付：体重は直近の値を初期表示、その他は空
      const last = [...records].reverse().find((x) => x.weight != null);
      setWeight(last?.weight ?? null);
      setMeals(emptyMeals());
      setStudyMinutes(0);
      setNote("");
    }
  }, [date, records]);

  const persist = (next: LifeRecord[]) => {
    setRecords(next);
    saveLife(next);
  };

  const adjustWeight = (delta: number) => {
    setWeight((w) => roundWeight(Math.min(635, Math.max(0, (w ?? 60) + delta))));
  };

  const sobaOfDay = useMemo(
    () => soba.filter((s) => s.date === date),
    [soba, date],
  );

  const handleSave = () => {
    const entry: LifeRecord = {
      date,
      weight: weight != null ? roundWeight(weight) : null,
      meals,
      studyMinutes,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    };
    persist(upsertLife(records, entry));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  const handleDelete = (d: string) => {
    if (!confirm(`${d} の記録を削除しますか？`)) return;
    persist(records.filter((r) => r.date !== d));
  };

  return (
    <div className="app life">
      <header className="wheader">
        <button type="button" className="wheader__home" onClick={onHome}>
          ← ホーム
        </button>
        <h1 className="wheader__title">📔 生活記録</h1>
        <span className="wheader__spacer" />
      </header>

      <div className="tabs">
        {(
          [
            ["log", "✍️ 記録"],
            ["graph", "📊 グラフ"],
            ["history", "📅 履歴"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={`tabs__btn${tab === t ? " tabs__btn--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "log" && (
        <LogTab
          date={date}
          setDate={setDate}
          weight={weight}
          setWeight={setWeight}
          adjustWeight={adjustWeight}
          meals={meals}
          setMeals={setMeals}
          studyMinutes={studyMinutes}
          setStudyMinutes={setStudyMinutes}
          note={note}
          setNote={setNote}
          sobaOfDay={sobaOfDay}
          justSaved={justSaved}
          onSave={handleSave}
        />
      )}

      {tab === "graph" && (
        <GraphTab
          records={records}
          soba={soba}
          range={range}
          setRange={setRange}
        />
      )}

      {tab === "history" && (
        <HistoryTab
          records={records}
          soba={soba}
          onPick={(d) => {
            setDate(d);
            setTab("log");
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

/* ===== 記録タブ ===== */
interface LogTabProps {
  date: string;
  setDate: (d: string) => void;
  weight: number | null;
  setWeight: (w: number | null) => void;
  adjustWeight: (d: number) => void;
  meals: Record<MealSlot, { note: string; outside: boolean }>;
  setMeals: (m: Record<MealSlot, { note: string; outside: boolean }>) => void;
  studyMinutes: number;
  setStudyMinutes: (m: number) => void;
  note: string;
  setNote: (s: string) => void;
  sobaOfDay: SobaRecord[];
  justSaved: boolean;
  onSave: () => void;
}

function LogTab(p: LogTabProps) {
  const setMeal = (slot: MealSlot, patch: Partial<{ note: string; outside: boolean }>) =>
    p.setMeals({ ...p.meals, [slot]: { ...p.meals[slot], ...patch } });

  return (
    <>
      <section className="card-panel">
        <label className="field">
          <span className="field__label">日付</span>
          <input
            type="date"
            className="field__input"
            value={p.date}
            max={today()}
            onChange={(e) => p.setDate(e.target.value)}
          />
        </label>

        <span className="field__label">体重（kg）</span>
        <div className="stepper">
          <button type="button" className="stepper__btn" onClick={() => p.adjustWeight(-0.1)} aria-label="0.1減らす">
            −
          </button>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            className="stepper__value"
            placeholder="--.-"
            value={p.weight ?? ""}
            onChange={(e) =>
              p.setWeight(e.target.value === "" ? null : Number(e.target.value))
            }
          />
          <button type="button" className="stepper__btn" onClick={() => p.adjustWeight(0.1)} aria-label="0.1増やす">
            ＋
          </button>
        </div>
        <div className="stepper__quick">
          <button type="button" onClick={() => p.adjustWeight(-1)}>−1.0</button>
          <button type="button" onClick={() => p.adjustWeight(-0.5)}>−0.5</button>
          <button type="button" onClick={() => p.adjustWeight(0.5)}>+0.5</button>
          <button type="button" onClick={() => p.adjustWeight(1)}>+1.0</button>
        </div>
      </section>

      {/* 食事 */}
      <section className="card-panel">
        <h2 className="panel__title">🍽 食事</h2>
        {p.sobaOfDay.length > 0 && (
          <div className="soba-link">
            🍜 この日のそば記録：
            {p.sobaOfDay.map((s) => (
              <span key={s.id} className="soba-link__chip">
                {s.shopName}（外食）
              </span>
            ))}
          </div>
        )}
        {MEAL_SLOTS.map((slot) => {
          const meal = p.meals[slot.key];
          return (
            <div key={slot.key} className="meal-row">
              <span className="meal-row__label">
                {slot.icon} {slot.label}
              </span>
              <input
                type="text"
                className="field__input meal-row__note"
                placeholder="食べたもの"
                value={meal.note}
                onChange={(e) => setMeal(slot.key, { note: e.target.value })}
              />
              <button
                type="button"
                className={`meal-row__out${meal.outside ? " meal-row__out--on" : ""}`}
                onClick={() => setMeal(slot.key, { outside: !meal.outside })}
              >
                外食
              </button>
            </div>
          );
        })}
      </section>

      {/* 勉強時間 */}
      <section className="card-panel">
        <h2 className="panel__title">📚 勉強時間</h2>
        <div className="study-display">{fmtStudy(p.studyMinutes)}</div>
        <div className="stepper__quick study-quick">
          <button type="button" onClick={() => p.setStudyMinutes(Math.max(0, p.studyMinutes - 30))}>−30分</button>
          <button type="button" onClick={() => p.setStudyMinutes(p.studyMinutes + 15)}>+15分</button>
          <button type="button" onClick={() => p.setStudyMinutes(p.studyMinutes + 30)}>+30分</button>
          <button type="button" onClick={() => p.setStudyMinutes(p.studyMinutes + 60)}>+1時間</button>
        </div>
        <div className="study-direct">
          <input
            type="number"
            inputMode="numeric"
            className="field__input"
            placeholder="分で直接入力"
            value={p.studyMinutes || ""}
            onChange={(e) => p.setStudyMinutes(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
          />
          <span className="study-direct__unit">分</span>
        </div>
      </section>

      {/* メモ */}
      <section className="card-panel">
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">ひとことメモ</span>
          <input
            type="text"
            className="field__input"
            placeholder="体調・気づきなど"
            value={p.note}
            onChange={(e) => p.setNote(e.target.value)}
          />
        </label>
      </section>

      <button
        type="button"
        className={`btn btn--primary wsave${p.justSaved ? " wsave--done" : ""}`}
        onClick={p.onSave}
      >
        {p.justSaved ? "✓ 保存しました" : "この日の記録を保存"}
      </button>
    </>
  );
}

/* ===== グラフタブ ===== */
function GraphTab({
  records,
  soba,
  range,
  setRange,
}: {
  records: LifeRecord[];
  soba: SobaRecord[];
  range: Range;
  setRange: (r: Range) => void;
}) {
  const filtered = useMemo(() => {
    if (range === "all") return records;
    const fromStr = daysAgoStr(Number(range));
    return records.filter((r) => r.date >= fromStr);
  }, [records, range]);

  const weightPoints = filtered
    .filter((r) => r.weight != null)
    .map((r) => ({ label: mmdd(r.date), value: r.weight as number }));

  const studyBars = filtered
    .filter((r) => r.studyMinutes > 0)
    .slice(-14)
    .map((r) => ({ label: mmdd(r.date), value: Math.round((r.studyMinutes / 60) * 10) / 10 }));

  const sobaDates = useMemo(() => new Set(soba.map((s) => s.date)), [soba]);

  const summary = useMemo(() => {
    const studyTotal = filtered.reduce((s, r) => s + r.studyMinutes, 0);
    const studyDays = filtered.filter((r) => r.studyMinutes > 0).length;
    const eatOutDays = filtered.filter(
      (r) => outsideCount(r) > 0 || sobaDates.has(r.date),
    ).length;
    return {
      avgStudy: studyDays ? Math.round(studyTotal / studyDays) : 0,
      studyTotal,
      eatOutDays,
    };
  }, [filtered, sobaDates]);

  return (
    <>
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

      <div className="stats" style={{ marginBottom: 16 }}>
        <div className="stat">
          <span className="stat__value">{fmtStudy(summary.avgStudy)}</span>
          <span className="stat__label">平均勉強/日</span>
        </div>
        <div className="stat">
          <span className="stat__value">{Math.round((summary.studyTotal / 60) * 10) / 10}h</span>
          <span className="stat__label">合計勉強</span>
        </div>
        <div className="stat">
          <span className="stat__value">{summary.eatOutDays}</span>
          <span className="stat__label">外食した日</span>
        </div>
      </div>

      <section className="card-panel">
        <h2 className="panel__title">⚖️ 体重の変化</h2>
        {weightPoints.length >= 1 ? (
          <LineChart points={weightPoints} formatValue={fmtKg} color="#3f86c4" />
        ) : (
          <p className="chart-empty">この期間の体重記録がありません</p>
        )}
      </section>

      <section className="card-panel">
        <h2 className="panel__title">📚 勉強時間（時間）</h2>
        {studyBars.length >= 1 ? (
          <BarChart data={studyBars} color="#5a7d4f" formatValue={(v) => `${v}`} />
        ) : (
          <p className="chart-empty">この期間の勉強記録がありません</p>
        )}
      </section>
    </>
  );
}

/* ===== 履歴タブ ===== */
function HistoryTab({
  records,
  soba,
  onPick,
  onDelete,
}: {
  records: LifeRecord[];
  soba: SobaRecord[];
  onPick: (d: string) => void;
  onDelete: (d: string) => void;
}) {
  const sobaDates = useMemo(() => new Set(soba.map((s) => s.date)), [soba]);
  const history = useMemo(() => [...records].reverse(), [records]);

  if (history.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">📅</div>
        <p className="empty__text">まだ記録がありません</p>
      </div>
    );
  }

  return (
    <ul className="lhistory">
      {history.map((r) => {
        const out = outsideCount(r) + (sobaDates.has(r.date) ? 1 : 0);
        return (
          <li key={r.date} className="lhistory__row">
            <button type="button" className="lhistory__main" onClick={() => onPick(r.date)}>
              <span className="lhistory__date">{r.date}</span>
              <span className="lhistory__badges">
                {r.weight != null && (
                  <span className="lbadge lbadge--w">{fmtKg(r.weight)}kg</span>
                )}
                {r.studyMinutes > 0 && (
                  <span className="lbadge lbadge--s">📚 {fmtStudy(r.studyMinutes)}</span>
                )}
                {out > 0 && <span className="lbadge lbadge--o">🍴 外食</span>}
              </span>
            </button>
            <button
              type="button"
              className="whistory__del"
              onClick={() => onDelete(r.date)}
              aria-label="削除"
            >
              🗑
            </button>
          </li>
        );
      })}
    </ul>
  );
}
