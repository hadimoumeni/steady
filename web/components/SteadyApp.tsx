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
import { defaultManualScenario, manualToSimulateBody } from "@/lib/manualDefaults";
import { streamAdvise } from "@/lib/sse";
import type { AdviseResponse, ExtractResponse, Profile, SimulateResponse } from "@/lib/types";
import { AdviceColumn } from "./AdviceColumn";
import { GlucoseChart } from "./GlucoseChart";
import { ManualScenarioForm } from "./ManualScenarioForm";
import { ScenarioForm } from "./ScenarioForm";

const defaultProfile = (): Profile => ({
  isf: 2.8,
  icr: 15,
  ait_hours: 3.5,
  weight_kg: 28,
});

const showDebug =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_STEADY_DEBUG === "1";

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
  const [inputMode, setInputMode] = useState<"natural" | "manual">("natural");
  const [text, setText] = useState("");
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [manual, setManual] = useState(() => defaultManualScenario(defaultProfile()));
  const [showProfile, setShowProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [extracted, setExtracted] = useState<ExtractResponse | null>(null);
  const [sim, setSim] = useState<SimulateResponse | null>(null);
  const [advise, setAdvise] = useState<AdviseResponse | null>(null);
  const [conclusionStream, setConclusionStream] = useState("");
  const [loadingConclusion, setLoadingConclusion] = useState(false);

  const [liveGlucose, setLiveGlucose] = useState<number | null>(null);
  const [cgmLive, setCgmLive] = useState(false);

  const { supported: voiceSupported, listening: voiceListening, error: voiceError, listen } =
    useSpeechRecognition();

  useEffect(() => {
    setManual((m) => ({ ...m, profile: { ...profile } }));
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ns = await fetchNightscoutCurrent();
        if (!cancelled) {
          setLiveGlucose(ns.glucose_mmol);
          setCgmLive(ns.live);
        }
      } catch {
        if (!cancelled) {
          setLiveGlucose(null);
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
      setLiveGlucose(ex.glucose);
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
        setLiveGlucose(start);
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

  const onManualRun = useCallback(async () => {
    resetResults();
    setExtracted(null);
    setBusy(true);
    setLoadingConclusion(true);
    try {
      const s = await fetchSimulate(manualToSimulateBody(manual));
      setSim(s);
      await streamAdviceIntoState(simulateToAdviseBody(s), setAdvise, setConclusionStream);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed.");
    } finally {
      setBusy(false);
      setLoadingConclusion(false);
    }
  }, [manual, resetResults]);

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
          Describe your child&apos;s glucose, food, insulin, and plans — or enter numbers manually. Steady simulates
          the next two hours and suggests practical steps with uncertainty bands.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
          {inputMode === "natural" && liveGlucose != null && (
            <span
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 font-mono text-foreground"
              title={cgmLive ? "Demo Nightscout feed" : "Offline fallback"}
            >
              <span className={cgmLive ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-zinc-400"} />
              CGM {liveGlucose.toFixed(1)} mmol/L
            </span>
          )}
        </div>
      </header>

      <div
        id="steady-main"
        className="mb-6 flex flex-wrap gap-2 rounded-xl border border-border bg-surface-muted/50 p-1"
        role="tablist"
        aria-label="Input mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={inputMode === "natural"}
          onClick={() => {
            setError(null);
            setInputMode("natural");
          }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            inputMode === "natural"
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          Plain English
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inputMode === "manual"}
          onClick={() => {
            setError(null);
            setInputMode("manual");
          }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            inputMode === "manual"
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          Manual numbers (no AI)
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          {inputMode === "natural" ? (
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
          ) : (
            <ManualScenarioForm value={manual} onChange={setManual} onRun={onManualRun} busy={busy} />
          )}
          {inputMode === "manual" && error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
              {error}
            </p>
          )}
          <GlucoseChart sim={sim} liveReading={inputMode === "natural" ? liveGlucose : null} />
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
