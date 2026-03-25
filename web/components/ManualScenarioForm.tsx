"use client";

import type { ManualScenario, Profile } from "@/lib/types";

type Props = {
  value: ManualScenario;
  onChange: (m: ManualScenario) => void;
  onRun: () => void;
  busy: boolean;
};

const GI = [
  { v: "fast" as const, label: "Fast GI" },
  { v: "medium" as const, label: "Medium GI" },
  { v: "slow" as const, label: "Slow GI" },
];

const INSULIN = [
  { v: "novorapid" as const, label: "Novorapid" },
  { v: "humalog" as const, label: "Humalog" },
  { v: "fiasp" as const, label: "Fiasp" },
  { v: "apidra" as const, label: "Apidra" },
];

const ACTIVITY = [
  { v: "rest" as const, label: "Rest" },
  { v: "aerobic" as const, label: "Aerobic" },
  { v: "mixed" as const, label: "Mixed" },
  { v: "anaerobic" as const, label: "Anaerobic" },
];

const INTENSITY = [
  { v: 0.4, label: "Light (0.4)" },
  { v: 1.0, label: "Moderate (1.0)" },
  { v: 1.6, label: "Intense (1.6)" },
];

export function ManualScenarioForm({ value, onChange, onRun, busy }: Props) {
  const p = value.profile;

  const setProfile = (next: Profile) => onChange({ ...value, profile: next });

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Manual scenario</h2>
        <p className="mt-1 text-sm text-muted">
          Skip AI extraction — numbers go straight to the simulator.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Num label="Current glucose (mmol/L)" v={value.glucose} on={(n) => onChange({ ...value, glucose: n })} step={0.1} disabled={busy} />
        <Num label="Carbs (g)" v={value.carbs_g} on={(n) => onChange({ ...value, carbs_g: n })} step={1} disabled={busy} />
        <Select label="Meal GI" value={value.gi_category} options={GI} on={(v) => onChange({ ...value, gi_category: v })} disabled={busy} />
        <Num label="Minutes since meal" v={value.mins_since_meal} on={(n) => onChange({ ...value, mins_since_meal: n })} step={5} disabled={busy} />
        <Num label="Bolus insulin (U)" v={value.insulin_units} on={(n) => onChange({ ...value, insulin_units: n })} step={0.1} disabled={busy} />
        <Select label="Insulin type" value={value.insulin_type} options={INSULIN} on={(v) => onChange({ ...value, insulin_type: v })} disabled={busy} />
        <Num label="Minutes since insulin" v={value.mins_since_insulin} on={(n) => onChange({ ...value, mins_since_insulin: n })} step={5} disabled={busy} />
        <Select label="Activity" value={value.activity_type} options={ACTIVITY} on={(v) => onChange({ ...value, activity_type: v })} disabled={busy} />
        <Num label="Activity duration (min)" v={value.activity_duration_mins} on={(n) => onChange({ ...value, activity_duration_mins: n })} step={5} disabled={busy} />
        <SelectNum label="Intensity" value={value.intensity} options={INTENSITY} on={(v) => onChange({ ...value, intensity: v })} disabled={busy} />
      </div>

      <div className="rounded-xl border border-border bg-surface-muted/40 p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Child profile</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Num label="ISF" v={p.isf} on={(n) => setProfile({ ...p, isf: n })} step={0.1} disabled={busy} />
          <Num label="ICR (g/U)" v={p.icr} on={(n) => setProfile({ ...p, icr: n })} step={0.5} disabled={busy} />
          <Num label="AIT (h)" v={p.ait_hours} on={(n) => setProfile({ ...p, ait_hours: n })} step={0.25} disabled={busy} />
          <Num label="Weight (kg)" v={p.weight_kg} on={(n) => setProfile({ ...p, weight_kg: n })} step={0.5} disabled={busy} />
        </div>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={busy}
        className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Running…" : "Run simulation"}
      </button>
    </div>
  );
}

function Num({
  label,
  v,
  on,
  step,
  disabled,
}: {
  label: string;
  v: number;
  on: (n: number) => void;
  step: number;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type="number"
        value={Number.isFinite(v) ? v : ""}
        step={step}
        onChange={(e) => on(parseFloat(e.target.value) || 0)}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  on,
  disabled,
}: {
  label: string;
  value: T;
  options: { v: T; label: string }[];
  on: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => on(e.target.value as T)}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectNum({
  label,
  value,
  options,
  on,
  disabled,
}: {
  label: string;
  value: number;
  options: { v: number; label: string }[];
  on: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => on(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
