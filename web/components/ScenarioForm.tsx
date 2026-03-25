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
  onRunText: (scenarioText: string) => Promise<void>;
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
  onRunText,
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
        One short paragraph: current glucose, food, insulin, and planned activity (e.g. football for 60 minutes).
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
          placeholder={`It's 2am. Lena's CGM alarm just went off —
she's at 4.1 and dropping. She had a big dinner
about 3 hours ago, maybe 60g of carbs, and took
4 units of NovoRapid with it. She's groggy but
awake. What do I do?`}
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

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onRunText(
              `It's after school. Lena wants to play football
with her friends for an hour. She's at 6.8, had
lunch 90 minutes ago — about 30g of carbs — and
took 2 units of NovoRapid with it. Is it safe
for her to play?`
            )
          }
          className="rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted/80 disabled:opacity-50"
        >
          Football
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onRunText(
              "We're at a birthday party. Lena ate cake and juice about 20 minutes ago — probably 60g of fast carbs. She took 3 units of NovoRapid about 20 minutes ago. Her glucose is 6.2 and she wants to run around with the other kids for the next 2 hours."
            )
          }
          className="rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted/80 disabled:opacity-50"
        >
          Birthday
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onRunText(
              "Lena had porridge for breakfast 45 minutes ago, about 35g of carbs. She took 2 units of NovoRapid about 3 hours ago. Her glucose is 7.4 right now. She has swimming training in 10 minutes — 45 minutes in the pool at moderate pace."
            )
          }
          className="rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted/80 disabled:opacity-50"
        >
          Swimming
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onRunText(
              "Lena's glucose is 8.0 mmol/L right now. She drank juice about 20 minutes ago, around 260g of fast carbs. She took 1 unit of NovoRapid about 5 hours ago. She's going to rest for the afternoon. Is this safe?"
            )
          }
          className="rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted/80 disabled:opacity-50"
        >
          High start
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onRunText(
              "Lena's glucose is 8.5 mmol/L right now. She ate a big fast meal about 20 minutes ago, around 260g of fast carbs. She took 1 unit of NovoRapid about 5 hours ago. She's just going to watch TV and rest for the afternoon. No activity planned."
            )
          }
          className="rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted/80 disabled:opacity-50"
        >
          Rest day
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
