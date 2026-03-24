"use client";

import clsx from "clsx";
import type { AdviseResponse, SimulateResponse } from "@/lib/types";

function formatWhen(min: number): string {
  if (min <= 0) return "Now";
  if (min >= 120) return "2 h";
  return `${min} min`;
}

function severityStyles(sev: AdviseResponse["severity"]) {
  switch (sev) {
    case "safe":
      return {
        ring: "bg-emerald-500",
        label: "text-emerald-800 dark:text-emerald-200",
        badge: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
      };
    case "caution":
      return {
        ring: "bg-amber-500",
        label: "text-amber-900 dark:text-amber-100",
        badge: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-50",
      };
    case "danger":
    default:
      return {
        ring: "bg-rose-600",
        label: "text-rose-900 dark:text-rose-100",
        badge: "bg-rose-100 text-rose-950 dark:bg-rose-900/40 dark:text-rose-50",
      };
  }
}

export function AdviceColumn({
  advise,
  sim,
  conclusionStreaming,
  loadingConclusion,
}: {
  advise: AdviseResponse | null;
  sim: SimulateResponse | null;
  conclusionStreaming: string;
  loadingConclusion: boolean;
}) {
  const s = advise?.severity ?? "safe";
  const styles = severityStyles(s);
  const headline = advise?.severity_label;
  const immediate = advise?.immediate_step;
  const recheck = advise?.recheck_minutes;
  const backup = advise?.backup_step;
  const escalation = advise?.escalation;
  const apiLate = advise?.late_hypo_warning;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <span className={clsx("h-3 w-3 rounded-full shadow-sm", styles.ring)} title="Severity" />
          <span className="h-8 w-px bg-border" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Traffic light</p>
          <p className={clsx("text-xl font-semibold capitalize", styles.label)}>{s}</p>
          {headline && <p className="mt-1 text-base font-medium text-foreground">{headline}</p>}
          {sim && (
            <p className="mt-1 text-sm text-muted">
              Danger in sim: {(sim.danger_probability * 100).toFixed(0)}% of runs · min p10{" "}
              {sim.min_p10.toFixed(1)} mmol/L
            </p>
          )}
        </div>
        <span className={clsx("shrink-0 rounded-full px-3 py-1 text-xs font-medium", styles.badge)}>
          ISPAD 2022 note
        </span>
      </div>

      {immediate && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Next step</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{immediate}</p>
          {recheck != null && (
            <p className="mt-2 font-mono text-xs text-muted">
              Suggested recheck: <span className="text-foreground">{recheck} min</span>
            </p>
          )}
        </div>
      )}

      {apiLate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
          <p className="font-medium">Delayed hypoglycaemia</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">{apiLate}</p>
        </div>
      )}

      {!apiLate && sim?.late_hypo_risk && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
          <p className="font-medium">Late hypoglycaemia risk</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            After longer aerobic or mixed activity, glucose can fall hours later. Plan a bedtime check or a slow snack
            if your team agrees.
          </p>
        </div>
      )}

      {advise?.ispad_note && (
        <p className="rounded-xl bg-surface-muted/80 px-4 py-3 text-sm leading-relaxed text-foreground">
          {advise.ispad_note}
        </p>
      )}

      {advise?.treatment_options && advise.treatment_options.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Treatment options</h3>
          <ul className="space-y-2">
            {advise.treatment_options.map((o, i) => (
              <li
                key={`${o.action}-${i}`}
                className="rounded-xl border border-border bg-surface-muted/40 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{o.action}</span>
                <span className="text-muted"> — {o.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {backup && (
        <div className="rounded-xl border border-border bg-surface-muted/50 px-4 py-3 text-sm text-foreground">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">If not improving</p>
          <p className="mt-1 leading-relaxed">{backup}</p>
        </div>
      )}

      {escalation && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-200">Emergency</p>
          <p className="mt-1 leading-relaxed">{escalation}</p>
        </div>
      )}

      {advise?.timeline && advise.timeline.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Timeline</h3>
          <ol className="relative border-l border-border pl-4">
            {advise.timeline.map((e, i) => (
              <li key={`${e.time_min}-${e.event}-${i}`} className="mb-4 last:mb-0">
                <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-border" />
                <p className="text-xs font-medium text-muted">{formatWhen(e.time_min)}</p>
                <p className="text-sm text-foreground">{e.event}</p>
                <p className="font-mono text-xs text-muted">{e.glucose.toFixed(1)} mmol/L</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Summary</h3>
        <div
          className="min-h-[4rem] rounded-xl bg-surface-muted/50 px-4 py-3 text-sm leading-relaxed text-foreground"
          aria-live="polite"
        >
          {loadingConclusion && !conclusionStreaming && (
            <span className="animate-pulse text-muted">Generating summary…</span>
          )}
          {(conclusionStreaming || advise?.conclusion) && (
            <p>{conclusionStreaming || advise?.conclusion}</p>
          )}
          {!loadingConclusion && !conclusionStreaming && !advise?.conclusion && (
            <span className="text-muted">Summary appears after a run.</span>
          )}
        </div>
      </div>

      {advise?.disclaimer && (
        <p className="text-xs leading-relaxed text-muted">{advise.disclaimer}</p>
      )}
    </div>
  );
}
