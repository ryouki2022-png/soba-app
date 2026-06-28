// 依存ライブラリなしの軽量な棒グラフ（SVG）

import { useMemo } from "react";

export interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

const VB_W = 360;
const PAD = { top: 16, right: 12, bottom: 28, left: 32 };

export function BarChart({
  data,
  height = 200,
  color = "#5a7d4f",
  formatValue = (v) => `${v}`,
}: BarChartProps) {
  const layout = useMemo(() => {
    const innerW = VB_W - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const max = Math.max(1, ...data.map((d) => d.value));
    const gap = 10;
    const bw = data.length ? (innerW - gap * (data.length - 1)) / data.length : 0;
    const bars = data.map((d, i) => {
      const h = (d.value / max) * innerH;
      return {
        ...d,
        x: PAD.left + i * (bw + gap),
        y: PAD.top + innerH - h,
        w: bw,
        h,
      };
    });
    return { bars, innerH };
  }, [data, height]);

  if (data.length === 0) {
    return <div className="chart-empty">データがありません</div>;
  }

  return (
    <svg className="chart" viewBox={`0 0 ${VB_W} ${height}`} width="100%" role="img">
      {layout.bars.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={Math.max(b.h, 0)}
            rx="5"
            fill={color}
          />
          {b.value > 0 && (
            <text
              x={b.x + b.w / 2}
              y={b.y - 5}
              textAnchor="middle"
              className="chart__barval"
            >
              {formatValue(b.value)}
            </text>
          )}
          <text
            x={b.x + b.w / 2}
            y={height - 9}
            textAnchor="middle"
            className="chart__xlabel"
          >
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
