"use client";

import {
  CartesianGrid,
  ComposedChart,
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
const ANIM_MS = 900;

export function GlucoseChart({ sim }: { sim: SimulateResponse | null }) {
  if (!sim?.median?.length || !sim.times?.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-border bg-surface-muted/50 text-sm text-muted">
        Run a scenario to see the predicted curve.
      </div>
    );
  }

  // Build chart data entirely from the simulate API response — no hardcoded values.
  const chartData = sim.times.map((t, i) => ({
    time: t,
    median: sim.median[i] ?? null,
    p10: sim.p10[i] ?? null,
    p90: sim.p90[i] ?? null,
  }));

  console.log("Chart median[0]:", sim.median[0]);
  console.log("Chart times[0]:", sim.times[0]);

  const dangerAt = sim.danger_entry_minutes;

  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold tracking-tight text-foreground">
        Next 2 hours (mmol/L)
      </h2>

      <div className="h-[300px] w-full" aria-label="Glucose prediction chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
            <defs>
              <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-band)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--chart-band)" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickFormatter={(v: number) => (v === 0 ? "Now" : `${v}`)}
              label={{
                value: "Minutes",
                position: "insideBottom",
                offset: -10,
                fontSize: 11,
                fill: "var(--muted)",
              }}
            />

            {/* Fixed clinical Y axis — always 2 to 12 mmol/L */}
            <YAxis
              domain={[2, 12]}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              width={36}
              tickFormatter={(v: number) => v.toFixed(1)}
            />

            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value.toFixed(2)} mmol/L`]}
              labelFormatter={(t: number) => (t === 0 ? "Now" : `${t} min`)}
            />

            {/* Red danger zone below hypo threshold */}
            <ReferenceArea
              y1={2}
              y2={HYPO}
              fill="var(--danger-bg)"
              fillOpacity={0.35}
              strokeOpacity={0}
            />

            {/* Green target zone */}
            <ReferenceArea
              y1={TARGET_LOW}
              y2={TARGET_HIGH}
              fill="var(--safe-bg)"
              fillOpacity={0.18}
              strokeOpacity={0}
            />

            {/* Hypo threshold line */}
            <ReferenceLine y={HYPO} stroke="var(--danger)" strokeDasharray="4 4" />

            {/* Danger entry time (vertical line) */}
            {dangerAt != null && dangerAt >= 0 && dangerAt <= 120 && (
              <ReferenceLine
                x={dangerAt}
                stroke="var(--accent)"
                strokeDasharray="3 3"
                label={{
                  value: "Hypo risk",
                  position: "insideTop",
                  fill: "var(--muted)",
                  fontSize: 10,
                }}
              />
            )}

            {/* p10 lower bound */}
            <Line
              type="monotone"
              dataKey="p10"
              stroke="var(--chart-line)"
              strokeWidth={1}
              strokeOpacity={0.3}
              strokeDasharray="4 4"
              dot={false}
              name="p10"
              isAnimationActive
              animationDuration={ANIM_MS}
            />

            {/* p90 upper bound */}
            <Line
              type="monotone"
              dataKey="p90"
              stroke="var(--chart-line)"
              strokeWidth={1}
              strokeOpacity={0.3}
              strokeDasharray="4 4"
              dot={false}
              name="p90"
              isAnimationActive
              animationDuration={ANIM_MS}
            />

            {/* Median — the main prediction line */}
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-muted">
        Solid line: median prediction. Dashed lines: p10–p90 uncertainty band. Red zone: below{" "}
        {HYPO} mmol/L (hypo risk).
        {dangerAt != null && ` Dashed vertical: median time to reach hypo threshold.`}
      </p>
    </div>
  );
}
