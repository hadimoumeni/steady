"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  extractToSimulateBody,
  fetchDemo,
  fetchExtract,
  fetchNightscoutCurrent,
  fetchSimulate,
  simulateToAdviseBody,
} from "@/lib/api";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { streamAdvise } from "@/lib/sse";
import type { AdviseResponse, ExtractResponse, Profile, SimulateResponse } from "@/lib/types";
import { AdviceColumn } from "./AdviceColumn";
import { GlucoseChart } from "./GlucoseChart";
import { ScenarioForm } from "./ScenarioForm";

const defaultProfile = (): Profile => ({
  isf: 2.8,
  icr: 15,
  ait_hours: 3.5,
  weight_kg: 28,
});

const showDebug =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_STEADY_DEBUG === "1";

const DEFAULT_SCENARIO_TEXT = `It's 2am. Lena's CGM alarm just went off — 
she's at 4.1 and dropping. She had a big dinner 
about 3 hours ago, maybe 60g of carbs, and took 
4 units of NovoRapid with it. She's groggy but 
awake. What do I do?`;

function mergeMetadata(d: Record<string, unknown>): AdviseResponse {
  return {
    severity: (d.severity as AdviseResponse["severity"]) ?? "safe",
    severity_label: (d.severity_label as string) ?? "",
    immediate_step: (d.immediate_step as string) ?? "",
    recheck_minutes: typeof d.recheck_minutes === "number" ? d.recheck_minutes : 15,
    backup_step: (d.backup_step as string) ?? "",
    escalation: (d.escalation as string) ?? "",
    late_hypo_warning: (d.late_hypo_warning as string | null | undefined) ?? null,
    treatment_options: (d.treatment_options as AdviseResponse["treatment_options"]) ?? [],
    timeline: (d.timeline as AdviseResponse["timeline"]) ?? [],
    conclusion: "",
    ispad_note: (d.ispad_note as string) ?? "",
    disclaimer: (d.disclaimer as string) ?? "",
  };
}

async function streamAdviceIntoState(
  adviseBody: Record<string, unknown>,
  setAdvise: Dispatch<SetStateAction<AdviseResponse | null>>,
  setConclusionStream: Dispatch<SetStateAction<string>>
) {
  setConclusionStream("");
  await streamAdvise(adviseBody, (ev) => {
    if (ev.type === "metadata") {
      const raw = ev.data as unknown as Record<string, unknown>;
      setAdvise(mergeMetadata(raw));
    }
    if (ev.type === "conclusion") {
      setConclusionStream((prev) => prev + ev.text);
    }
  });
}

export function SteadyApp() {
  const [text, setText] = useState(DEFAULT_SCENARIO_TEXT);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [showProfile, setShowProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [extracted, setExtracted] = useState<ExtractResponse | null>(null);
  const [sim, setSim] = useState<SimulateResponse | null>(null);
  const [advise, setAdvise] = useState<AdviseResponse | null>(null);
  const [conclusionStream, setConclusionStream] = useState("");
  const [loadingConclusion, setLoadingConclusion] = useState(false);

  // Nightscout feed (best-effort) updates automatically on mount.
  // Scenario glucose overrides it after the user runs a new situation.
  const [nightscoutGlucose, setNightscoutGlucose] = useState<number | null>(null);
  const [scenarioGlucose, setScenarioGlucose] = useState<number | null>(null);
  const [cgmLive, setCgmLive] = useState(false);

  const displayGlucose = scenarioGlucose ?? nightscoutGlucose;

  const { supported: voiceSupported, listening: voiceListening, error: voiceError, listen } =
    useSpeechRecognition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ns = await fetchNightscoutCurrent();
        if (!cancelled) {
          setNightscoutGlucose(ns.glucose_mmol);
          setCgmLive(ns.live);
        }
      } catch {
        if (!cancelled) {
          setNightscoutGlucose(null);
          setCgmLive(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetResults = useCallback(() => {
    setError(null);
    setSim(null);
    setAdvise(null);
    setConclusionStream("");
  }, []);

  const onSubmit = useCallback(async () => {
    if (!text.trim()) return;
    resetResults();
    setBusy(true);
    setLoadingConclusion(true);
    try {
      const ex = await fetchExtract(text.trim(), showProfile ? profile : undefined);
      setExtracted(ex);

      // Keep CGM/live indicators in sync with the patient's "current situation"
      // provided by the user (or extracted offline fallback when LLM is unavailable).
      setScenarioGlucose(ex.glucose);
      setCgmLive(false);

      const s = await fetchSimulate(extractToSimulateBody(ex));
      setSim(s);
      await streamAdviceIntoState(simulateToAdviseBody(s), setAdvise, setConclusionStream);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      setExtracted(null);
    } finally {
      setBusy(false);
      setLoadingConclusion(false);
    }
  }, [text, showProfile, profile, resetResults]);

  const onDemo = useCallback(async () => {
    resetResults();
    setExtracted(null);
    setBusy(true);
    setLoadingConclusion(true);
    try {
      const demo = await fetchDemo();
      setSim(demo.simulate);

      // Demo uses simulated glucose; show it as the current situation.
      const start = demo.simulate?.median?.[0];
      if (typeof start === "number" && Number.isFinite(start)) {
        setScenarioGlucose(start);
        setCgmLive(false);
      }

      await streamAdviceIntoState(simulateToAdviseBody(demo.simulate), setAdvise, setConclusionStream);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo failed — is the API running?");
    } finally {
      setBusy(false);
      setLoadingConclusion(false);
    }
  }, [resetResults]);

  const onVoice = useCallback(() => {
    listen((t) => setText((prev) => (prev ? `${prev.trim()} ${t}` : t)));
  }, [listen]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <a
        href="#steady-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">Steady</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Activity decisions for Type 1 diabetes
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted">
          Describe your child&apos;s glucose, food, insulin, and plans in plain English. Steady simulates the next two
          hours and suggests practical steps with uncertainty bands.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
          {displayGlucose != null && (
            <span
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 font-mono text-foreground"
              title={cgmLive ? "Demo Nightscout feed" : "Offline fallback"}
            >
              <span className={cgmLive ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-zinc-400"} />
              CGM {displayGlucose.toFixed(1)} mmol/L
            </span>
          )}
        </div>
      </header>

      <div
        id="steady-main"
        className="mb-6 flex flex-wrap gap-2 rounded-xl border border-border bg-surface-muted/50 p-1"
        role="presentation"
      >
        <div className="rounded-lg bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm">
          Plain English
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <ScenarioForm
            text={text}
            onTextChange={setText}
            profile={profile}
            onProfileChange={setProfile}
            showProfile={showProfile}
            onToggleProfile={() => setShowProfile((v) => !v)}
            onSubmit={onSubmit}
            onDemo={onDemo}
            busy={busy}
            error={error}
            voiceSupported={voiceSupported}
            voiceListening={voiceListening}
            voiceError={voiceError}
            onVoice={onVoice}
          />

          <GlucoseChart sim={sim} liveReading={displayGlucose} />
        </div>

        <AdviceColumn
          advise={advise}
          sim={sim}
          conclusionStreaming={conclusionStream}
          loadingConclusion={loadingConclusion}
        />
      </div>

      {showDebug && extracted && (
        <details className="mt-8 rounded-xl border border-border bg-surface-muted/30 p-4 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Extracted parameters (debug)</summary>
          <pre className="mt-3 overflow-x-auto font-mono text-xs text-muted">
            {JSON.stringify(extracted, null, 2)}
          </pre>
        </details>
      )}

      <footer className="mt-16 border-t border-border pt-8 text-center text-xs text-muted">
        <p>
          Steady is decision support software, not a medical device diagnosis. Always follow your diabetes team&apos;s
          plan and local emergency guidance.
        </p>
      </footer>
    </div>
  );
}
