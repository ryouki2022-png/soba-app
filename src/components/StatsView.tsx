// そばの記録をグラフで振り返る

import { useMemo } from "react";
import type { SobaRecord } from "../types";
import { LineChart } from "../charts/LineChart";
import { BarChart } from "../charts/BarChart";

interface StatsViewProps {
  records: SobaRecord[];
}

function mmdd(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function StatsView({ records }: StatsViewProps) {
  const asc = useMemo(
    () => [...records].sort((a, b) => a.date.localeCompare(b.date)),
    [records],
  );

  // 評価の推移
  const ratingPoints = asc.map((r) => ({ label: mmdd(r.date), value: r.rating }));

  // 月別の記録数
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of asc) {
      const key = r.date.slice(0, 7); // YYYY-MM
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([k, v]) => ({ label: `${Number(k.slice(5, 7))}月`, value: v }));
  }, [asc]);

  const summary = useMemo(() => {
    if (records.length === 0) return null;
    const avgKoshi =
      records.reduce((s, r) => s + r.koshi, 0) / records.length;
    const prices = records
      .map((r) => r.price)
      .filter((p): p is number => typeof p === "number");
    const avgPrice = prices.length
      ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      : null;
    const hot = records.filter((r) => r.temperature === "hot").length;
    const cold = records.length - hot;
    return { avgKoshi, avgPrice, hot, cold };
  }, [records]);

  if (records.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">📊</div>
        <p className="empty__text">記録するとグラフが表示されます</p>
      </div>
    );
  }

  return (
    <div className="stats-view">
      {summary && (
        <div className="stats" style={{ marginBottom: 16 }}>
          <div className="stat">
            <span className="stat__value">{summary.avgKoshi.toFixed(1)}</span>
            <span className="stat__label">平均こし</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {summary.avgPrice != null ? `¥${summary.avgPrice}` : "-"}
            </span>
            <span className="stat__label">平均値段</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {summary.hot}/{summary.cold}
            </span>
            <span className="stat__label">温/冷</span>
          </div>
        </div>
      )}

      <section className="card-panel">
        <h2 className="panel__title">評価の推移</h2>
        <LineChart
          points={ratingPoints}
          yMin={0}
          yMax={5}
          color="#e0a32e"
          formatValue={(v) => `${v}`}
        />
      </section>

      <section className="card-panel">
        <h2 className="panel__title">月別の記録数</h2>
        <BarChart data={monthly} formatValue={(v) => `${v}`} />
      </section>
    </div>
  );
}
