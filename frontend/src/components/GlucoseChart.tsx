import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimulateResponse } from "../types";

const HYPO_REF = 3.9;
const CHART_BG = "#141414";

type Row = { t: number; p10: number; median: number; p90: number; span: number };

function GlucoseTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload: Row }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Row;
  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 8,
        padding: "8px 12px",
        color: "#fff",
      }}
    >
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{d.t} min</div>
      <div style={{ fontWeight: 600 }}>{d.median.toFixed(1)} mmol/L median</div>
      <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
        {d.p10.toFixed(1)}–{d.p90.toFixed(1)} band
      </div>
    </div>
  );
}

export function GlucoseChart({ data }: { data: SimulateResponse }) {
  const rows: Row[] = data.times.map((t, i) => {
    const p10 = data.p10[i] ?? 0;
    const p90 = data.p90[i] ?? 0;
    return {
      t,
      p10,
      median: data.median[i] ?? 0,
      p90,
      span: Math.max(0, p90 - p10),
    };
  });

  const yMax = Math.max(
    HYPO_REF + 1,
    ...rows.flatMap((r) => [r.p90, r.median]),
    12,
  );

  return (
    <div className="chart-wrap chart-wrap--dark">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 12, right: 8, left: -18, bottom: 4 }}
          style={{ background: CHART_BG }}
        >
          <CartesianGrid strokeDasharray="3 6" stroke="#2a2a2a" vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: "#3d3d3d" }}
            tickLine={false}
            axisLine={{ stroke: "#2a2a2a" }}
            ticks={[0, 30, 60, 90, 120]}
          />
          <YAxis
            domain={[0, Math.ceil(yMax * 10) / 10]}
            tick={{ fontSize: 10, fill: "#3d3d3d" }}
            tickLine={false}
            axisLine={{ stroke: "#2a2a2a" }}
            width={36}
          />
          <Tooltip content={<GlucoseTooltip />} cursor={{ stroke: "#333", strokeDasharray: "4 4" }} />
          <defs>
            <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#1D9E75" stopOpacity={0.06} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="p10"
            stackId="band"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="span"
            stackId="band"
            stroke="none"
            fill="url(#bandFill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="median"
            name="median"
            stroke="#1D9E75"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine y={HYPO_REF} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={1.5} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
