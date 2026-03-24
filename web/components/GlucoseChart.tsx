"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimulateResponse } from "@/lib/types";

const HYPO = 3.9;
const TARGET_LOW = 4.0;
const TARGET_HIGH = 10.0;

const ANIM_MS = 1100;

type Row = {
  time: number;
  bandLow: number;
  bandHeight: number;
  median: number;
  p10: number;
  p90: number;
};

function buildRows(sim: SimulateResponse): Row[] {
  return sim.times.map((t, i) => {
    const p10 = sim.p10[i] ?? 0;
    const p90 = sim.p90[i] ?? 0;
    return {
      time: t,
      bandLow: p10,
      bandHeight: Math.max(0, p90 - p10),
      median: sim.median[i] ?? 0,
      p10,
      p90,
    };
  });
}

export function GlucoseChart({
  sim,
  liveReading,
}: {
  sim: SimulateResponse | null;
  liveReading?: number | null;
}) {
  if (!sim) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-border bg-surface-muted/50 text-sm text-muted">
        Run a scenario to see the predicted curve.
      </div>
    );
  }

  const data = buildRows(sim);
  const yMin = Math.max(1.5, Math.min(...sim.p10) - 0.5);
  const yMax = Math.min(30, Math.max(...sim.p90) + 1.5);
  const dangerAt = sim.danger_entry_minutes;

  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Next 2 hours (mmol/L)
        </h2>
        {liveReading != null && (
          <span className="text-sm text-muted">
            Live CGM:{" "}
            <span className="font-mono font-medium text-foreground">{liveReading.toFixed(1)}</span>
          </span>
        )}
      </div>
      <div className="h-[300px] w-full" aria-label="Glucose prediction chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-band)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-band)" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickFormatter={(v) => (v === 0 ? "Now" : `${v}`)}
              label={{ value: "Minutes", position: "insideBottom", offset: -2, fontSize: 11, fill: "var(--muted)" }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              width={36}
              tickFormatter={(v) => v.toFixed(1)}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [value.toFixed(2), name]}
              labelFormatter={(t) => (t === 0 ? "Now" : `${t} min`)}
            />
            <ReferenceArea
              y1={yMin}
              y2={HYPO}
              fill="var(--danger-bg)"
              fillOpacity={0.35}
              strokeOpacity={0}
            />
            <ReferenceArea
              y1={TARGET_LOW}
              y2={TARGET_HIGH}
              fill="var(--safe-bg)"
              fillOpacity={0.2}
              strokeOpacity={0}
            />
            <ReferenceLine y={HYPO} stroke="var(--danger)" strokeDasharray="4 4" />
            {dangerAt != null && dangerAt >= 0 && dangerAt <= 120 && (
              <ReferenceLine
                x={dangerAt}
                stroke="var(--accent)"
                strokeDasharray="3 3"
                label={{
                  value: "Hypo risk (median run)",
                  position: "insideTop",
                  fill: "var(--muted)",
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="bandLow"
              stackId="band"
              stroke="none"
              fill="transparent"
              isAnimationActive
              animationDuration={ANIM_MS}
            />
            <Area
              type="monotone"
              dataKey="bandHeight"
              stackId="band"
              stroke="none"
              fill="url(#bandFill)"
              isAnimationActive
              animationDuration={ANIM_MS}
            />
            <Line
              type="monotone"
              dataKey="median"
              stroke="var(--chart-line)"
              strokeWidth={2.5}
              dot={false}
              name="Median"
              isAnimationActive
              animationDuration={ANIM_MS}
            />
            <Line
              type="monotone"
              dataKey="p10"
              stroke="var(--chart-line)"
              strokeWidth={1}
              strokeOpacity={0.35}
              strokeDasharray="4 4"
              dot={false}
              name="p10"
              isAnimationActive
              animationDuration={ANIM_MS}
            />
            <Line
              type="monotone"
              dataKey="p90"
              stroke="var(--chart-line)"
              strokeWidth={1}
              strokeOpacity={0.35}
              strokeDasharray="4 4"
              dot={false}
              name="p90"
              isAnimationActive
              animationDuration={ANIM_MS}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">
        Shaded band: p10–p90 from Monte Carlo runs. Red zone: below {HYPO} mmol/L (hypo risk).
        {dangerAt != null && ` Dashed vertical: median time to cross hypo in runs that hypo.`}
      </p>
    </div>
  );
}
