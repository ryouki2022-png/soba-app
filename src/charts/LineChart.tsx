// 依存ライブラリなしの軽量な折れ線グラフ（SVG）

import { useId, useMemo, useState } from "react";

export interface LinePoint {
  label: string; // X軸ラベル（日付など）
  value: number;
}

interface LineChartProps {
  points: LinePoint[];
  height?: number;
  color?: string;
  /** 値の表示整形（例: kg, ★） */
  formatValue?: (v: number) => string;
  /** Y軸の最小・最大を固定したい場合 */
  yMin?: number;
  yMax?: number;
}

const VB_W = 360;
const PAD = { top: 16, right: 14, bottom: 26, left: 40 };

export function LineChart({
  points,
  height = 220,
  color = "#5a7d4f",
  formatValue = (v) => `${v}`,
  yMin,
  yMax,
}: LineChartProps) {
  const gid = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);

  const layout = useMemo(() => {
    const VB_H = height;
    const innerW = VB_W - PAD.left - PAD.right;
    const innerH = VB_H - PAD.top - PAD.bottom;

    const values = points.map((p) => p.value);
    let lo = yMin ?? Math.min(...values);
    let hi = yMax ?? Math.max(...values);
    if (!isFinite(lo) || !isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    if (lo === hi) {
      // 全部同じ値のときは上下に余白を作る
      lo -= 1;
      hi += 1;
    } else {
      const margin = (hi - lo) * 0.12;
      lo -= margin;
      hi += margin;
    }

    const x = (i: number) =>
      points.length <= 1
        ? PAD.left + innerW / 2
        : PAD.left + (innerW * i) / (points.length - 1);
    const y = (v: number) =>
      PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

    const coords = points.map((p, i) => ({ x: x(i), y: y(p.value), ...p }));

    // Y軸の目盛り（4分割）
    const ticks = Array.from({ length: 5 }, (_, k) => {
      const v = lo + ((hi - lo) * k) / 4;
      return { v, y: y(v) };
    });

    return { VB_H, innerW, innerH, coords, ticks, x, y };
  }, [points, height, yMin, yMax]);

  if (points.length === 0) {
    return <div className="chart-empty">データがありません</div>;
  }

  const { VB_H, coords, ticks } = layout;
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    coords.length > 1
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(
          VB_H - PAD.bottom
        ).toFixed(1)} L${coords[0].x.toFixed(1)},${(VB_H - PAD.bottom).toFixed(
          1,
        )} Z`
      : "";

  // X軸ラベルは最大5個まで間引いて表示
  const labelStep = Math.max(1, Math.ceil(coords.length / 5));

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      role="img"
      onMouseLeave={() => setActive(null)}
    >
      <defs>
        <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* グリッド線とY軸ラベル */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            x2={VB_W - PAD.right}
            y1={t.y}
            y2={t.y}
            stroke="#e3d9c6"
            strokeWidth="1"
          />
          <text
            x={PAD.left - 6}
            y={t.y + 3}
            textAnchor="end"
            className="chart__ylabel"
          >
            {formatValue(Number(t.v.toFixed(1)))}
          </text>
        </g>
      ))}

      {/* 面 */}
      {areaPath && <path d={areaPath} fill={`url(#area-${gid})`} />}
      {/* 線 */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* 点 */}
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={active === i ? 5 : 3}
          fill="#fff"
          stroke={color}
          strokeWidth="2"
        />
      ))}

      {/* X軸ラベル */}
      {coords.map((c, i) =>
        i % labelStep === 0 || i === coords.length - 1 ? (
          <text
            key={i}
            x={c.x}
            y={VB_H - 8}
            textAnchor="middle"
            className="chart__xlabel"
          >
            {c.label}
          </text>
        ) : null,
      )}

      {/* タップ・ホバー検出と吹き出し */}
      {coords.map((c, i) => (
        <rect
          key={`hit-${i}`}
          x={c.x - (layout.innerW / Math.max(coords.length, 1)) / 2}
          y={PAD.top}
          width={Math.max(layout.innerW / Math.max(coords.length, 1), 8)}
          height={layout.innerH}
          fill="transparent"
          onMouseEnter={() => setActive(i)}
          onClick={() => setActive(i)}
        />
      ))}
      {active !== null && coords[active] && (
        <g pointerEvents="none">
          <line
            x1={coords[active].x}
            x2={coords[active].x}
            y1={PAD.top}
            y2={VB_H - PAD.bottom}
            stroke={color}
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <Bubble
            x={coords[active].x}
            y={coords[active].y}
            text={`${coords[active].label} ・ ${formatValue(coords[active].value)}`}
          />
        </g>
      )}
    </svg>
  );
}

function Bubble({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(54, text.length * 7.2);
  const bx = Math.min(Math.max(x - w / 2, 2), VB_W - w - 2);
  const by = Math.max(y - 30, 2);
  return (
    <g>
      <rect x={bx} y={by} width={w} height={20} rx="6" fill="#3a3128" />
      <text
        x={bx + w / 2}
        y={by + 14}
        textAnchor="middle"
        className="chart__bubble"
      >
        {text}
      </text>
    </g>
  );
}
