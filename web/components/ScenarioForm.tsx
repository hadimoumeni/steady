"use client";

import type { Profile } from "@/lib/types";

type Props = {
  text: string;
  onTextChange: (v: string) => void;
  profile: Profile;
  onProfileChange: (p: Profile) => void;
  showProfile: boolean;
  onToggleProfile: () => void;
  onSubmit: () => void;
  onDemo: () => void;
  busy: boolean;
  error: string | null;
  voiceSupported: boolean;
  voiceListening: boolean;
  voiceError: string | null;
  onVoice: () => void;
};

export function ScenarioForm({
  text,
  onTextChange,
  profile,
  onProfileChange,
  showProfile,
  onToggleProfile,
  onSubmit,
  onDemo,
  busy,
  error,
  voiceSupported,
  voiceListening,
  voiceError,
  onVoice,
}: Props) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Describe the situation</h2>
        <button
          type="button"
          onClick={onToggleProfile}
          className="text-sm font-medium text-accent hover:underline"
        >
          {showProfile ? "Hide" : "Edit"} child profile
        </button>
      </div>
      <p className="mb-3 text-sm text-muted">
        Describe the situation in plain English.
      </p>
      <div className="relative">
        <label htmlFor="steady-scenario" className="sr-only">
          Scenario description
        </label>
        <textarea
          id="steady-scenario"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={5}
          placeholder={`It's after school. Lena wants to play football 
with her friends for an hour. She's at 6.8, had 
lunch 90 minutes ago — about 30g of carbs — and 
took 2 units of NovoRapid with it. Is it safe 
for her to play?`}
          className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 pr-24 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          disabled={busy}
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={onVoice}
            disabled={busy || voiceListening}
            className="absolute bottom-3 right-3 rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted/80 disabled:opacity-50"
            title="Speak your scenario (browser speech recognition)"
          >
            {voiceListening ? "Listening…" : "Voice"}
          </button>
        )}
      </div>
      {voiceError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{voiceError}</p>}

      {showProfile && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            label="ISF (mmol/L per U)"
            value={profile.isf}
            onChange={(v) => onProfileChange({ ...profile, isf: v })}
            step={0.1}
            disabled={busy}
          />
          <Field
            label="ICR (g carbs per U)"
            value={profile.icr}
            onChange={(v) => onProfileChange({ ...profile, icr: v })}
            step={0.5}
            disabled={busy}
          />
          <Field
            label="Active insulin time (h)"
            value={profile.ait_hours}
            onChange={(v) => onProfileChange({ ...profile, ait_hours: v })}
            step={0.25}
            disabled={busy}
          />
          <Field
            label="Weight (kg)"
            value={profile.weight_kg}
            onChange={(v) => onProfileChange({ ...profile, weight_kg: v })}
            step={0.5}
            disabled={busy}
          />
        </div>
      )}

      {error && (
        <p
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !text.trim()}
          className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Running…" : "Run Steady"}
        </button>
        <button
          type="button"
          onClick={onDemo}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted/80 disabled:opacity-50"
        >
          Load demo
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
    </label>
  );
}
