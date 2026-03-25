import { useCallback, useEffect, useRef, useState } from "react";
import { postAdvise, postExtract, postSimulate } from "./api";
import { GlucoseChart } from "./components/GlucoseChart";
import type { AdviseResponse, ExtractResponse, SimulateRequest, SimulateResponse } from "./types";

const defaultProfile: SimulateRequest["profile"] = {
  isf: 2.8,
  icr: 15,
  ait_hours: 3.5,
  weight_kg: 28,
};

const LENA_SCENARIO_TEXT =
  "Lena is 6.8 mmol/L, had 30g carbs, 2 units NovoRapid 90 minutes ago, about to play football for an hour";

const LENA_FALLBACK: SimulateRequest = {
  glucose: 6.8,
  carbs_g: 30,
  gi_category: "medium",
  mins_since_meal: 90,
  insulin_units: 2,
  insulin_type: "novorapid",
  mins_since_insulin: 90,
  activity_type: "mixed",
  activity_duration_mins: 60,
  intensity: 1,
  profile: { ...defaultProfile },
};

const PRESETS: { label: string; text: string; fallback: SimulateRequest }[] = [
  {
    label: "Football",
    text: LENA_SCENARIO_TEXT,
    fallback: LENA_FALLBACK,
  },
  {
    label: "Birthday party",
    text: "Lena is 7.0 mmol/L at a birthday party, had cake and sweets — about 50g fast carbs 45 minutes ago with 3 units NovoRapid, now playing games for two hours.",
    fallback: {
      glucose: 7.0,
      carbs_g: 50,
      gi_category: "fast",
      mins_since_meal: 45,
      insulin_units: 3,
      insulin_type: "novorapid",
      mins_since_insulin: 45,
      activity_type: "mixed",
      activity_duration_mins: 120,
      intensity: 0.6,
      profile: { ...defaultProfile },
    },
  },
  {
    label: "Swimming",
    text: "Lena is 6.2 mmol/L, light snack 2 hours ago, no bolus since breakfast. Moderate swim practice for 45 minutes starts now.",
    fallback: {
      glucose: 6.2,
      carbs_g: 0,
      gi_category: "medium",
      mins_since_meal: 120,
      insulin_units: 0,
      insulin_type: "novorapid",
      mins_since_insulin: 300,
      activity_type: "aerobic",
      activity_duration_mins: 45,
      intensity: 1,
      profile: { ...defaultProfile },
    },
  },
  {
    label: "High start",
    text: "Lena is 12.4 mmol/L after breakfast, took 1.5 units NovoRapid correction 40 minutes ago, resting at home this afternoon — no exercise planned.",
    fallback: {
      glucose: 12.4,
      carbs_g: 0,
      gi_category: "medium",
      mins_since_meal: 60,
      insulin_units: 1.5,
      insulin_type: "novorapid",
      mins_since_insulin: 40,
      activity_type: "rest",
      activity_duration_mins: 0,
      intensity: 0.4,
      profile: { ...defaultProfile },
    },
  },
  {
    label: "Rest day",
    text: "Lena is 6.5 mmol/L, quiet day at home, no bolus in the last 4 hours and no planned activity.",
    fallback: {
      glucose: 6.5,
      carbs_g: 0,
      gi_category: "medium",
      mins_since_meal: 180,
      insulin_units: 0,
      insulin_type: "novorapid",
      mins_since_insulin: 240,
      activity_type: "rest",
      activity_duration_mins: 0,
      intensity: 0.4,
      profile: { ...defaultProfile },
    },
  },
];

function mergeExtract(ex: ExtractResponse): SimulateRequest {
  return {
    glucose: ex.glucose,
    carbs_g: ex.carbs_g,
    gi_category: ex.gi_category,
    mins_since_meal: ex.mins_since_meal,
    insulin_units: ex.insulin_units,
    insulin_type: ex.insulin_type,
    mins_since_insulin: ex.mins_since_insulin,
    activity_type: ex.activity_type,
    activity_duration_mins: ex.activity_duration_mins,
    intensity: ex.intensity,
    profile: { ...ex.profile },
  };
}

function formatStepTime(min: number): string {
  if (min <= 0) return "Now";
  return `${min} min`;
}

function sortedTreatments(ad: AdviseResponse) {
  return [...ad.treatment_options].sort((a, b) => a.priority - b.priority);
}

function backupLine(ad: AdviseResponse): string {
  const s = sortedTreatments(ad);
  if (s.length > 1 && s[1].amount) return s[1].amount;
  return "If glucose has not improved as expected on recheck, follow the plan from your diabetes team or seek urgent advice.";
}

function escalationLine(sev: AdviseResponse["severity"]): string {
  if (sev === "danger") {
    return "If unconscious or unable to swallow safely, do not give food or drink by mouth. Call emergency services immediately.";
  }
  if (sev === "caution") {
    return "Seek urgent medical help if there is confusion, vomiting, seizure, or rapidly worsening symptoms.";
  }
  return "";
}

let autoPipelineStarted = false;

const RECHECK_DEFAULT_SEC = 15 * 60;

export default function App() {
  const [nlText, setNlText] = useState(LENA_SCENARIO_TEXT);
  const [form, setForm] = useState<SimulateRequest>(() => structuredClone(LENA_FALLBACK));
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [simulateResult, setSimulateResult] = useState<SimulateResponse | null>(null);
  const [adviseResult, setAdviseResult] = useState<AdviseResponse | null>(null);

  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recheckRemaining, setRecheckRemaining] = useState<number | null>(null);
  const recheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runPipeline = useCallback(async (text: string, baseline: SimulateRequest) => {
    setPipelineLoading(true);
    setError(null);
    let params = structuredClone(baseline);

    try {
      const ex = await postExtract(text);
      params = mergeExtract(ex);
      setForm(params);
    } catch {
      params = structuredClone(baseline);
      setForm(baseline);
    }

    try {
      const sim = await postSimulate(params);
      setSimulateResult(sim);
      // /advise runs after /simulate; conclusion is LLM text when ANTHROPIC_API_KEY is set on the server.
      const adv = await postAdvise(sim);
      setAdviseResult(adv);
    } catch (e) {
      setSimulateResult(null);
      setAdviseResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPipelineLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoPipelineStarted) return;
    autoPipelineStarted = true;
    void runPipeline(LENA_SCENARIO_TEXT, LENA_FALLBACK);
  }, [runPipeline]);

  useEffect(() => {
    return () => {
      if (recheckTimerRef.current) clearInterval(recheckTimerRef.current);
    };
  }, []);

  function stopRecheckTimer() {
    if (recheckTimerRef.current) {
      clearInterval(recheckTimerRef.current);
      recheckTimerRef.current = null;
    }
  }

  function startRecheckTimer() {
    stopRecheckTimer();
    setRecheckRemaining(RECHECK_DEFAULT_SEC);
    recheckTimerRef.current = setInterval(() => {
      setRecheckRemaining((prev) => {
        if (prev === null || prev <= 1) {
          stopRecheckTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function formatCountdown(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function updateField<K extends keyof SimulateRequest>(key: K, value: SimulateRequest[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateProfile<K extends keyof SimulateRequest["profile"]>(key: K, value: SimulateRequest["profile"][K]) {
    setForm((f) => ({
      ...f,
      profile: { ...f.profile, [key]: value },
    }));
  }

  const displayGlucose = simulateResult?.median[0] ?? form.glucose;
  const displayIob = simulateResult?.iob_units ?? null;
  const predictedLow = simulateResult?.min_median ?? null;
  const hypoRiskPct = simulateResult ? simulateResult.danger_probability * 100 : null;

  const firstT = adviseResult ? sortedTreatments(adviseResult)[0] : null;
  const escalation = adviseResult ? escalationLine(adviseResult.severity) : "";

  const signalClass =
    adviseResult?.severity === "safe"
      ? "signal signal--safe"
      : adviseResult?.severity === "caution"
        ? "signal signal--caution"
        : adviseResult?.severity === "danger"
          ? "signal signal--danger"
          : "signal signal--safe";

  return (
    <div className="layout">
      <div className="panel">
        <div className="brand">
          <h1>Steady</h1>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="nl-block">
          <label htmlFor="scenario" className="sr-only">
            Scenario
          </label>
          <textarea
            id="scenario"
            className="nl-textarea"
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            placeholder="Describe glucose, food, insulin, and planned activity…"
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pipelineLoading}
              onClick={() => void runPipeline(nlText, form)}
            >
              {pipelineLoading ? "Running…" : "Run Simulation"}
            </button>
          </div>
        </div>

        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="pill"
              disabled={pipelineLoading}
              onClick={() => {
                setNlText(p.text);
                setForm(structuredClone(p.fallback));
                void runPipeline(p.text, p.fallback);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Glucose</div>
            <div className="value">
              {displayGlucose.toFixed(1)}
              <span className="unit">mmol/L</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="label">IOB</div>
            <div className="value">
              {displayIob != null ? (
                <>
                  {displayIob.toFixed(2)}
                  <span className="unit">U</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Predicted low</div>
            <div className="value">
              {predictedLow != null ? (
                <>
                  {predictedLow.toFixed(1)}
                  <span className="unit">mmol/L</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Hypo risk</div>
            <div className="value">
              {hypoRiskPct != null ? (
                <>
                  {hypoRiskPct.toFixed(0)}
                  <span className="unit">%</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>

        {simulateResult && <GlucoseChart data={simulateResult} />}

        <button type="button" className="advanced-toggle" onClick={() => setAdvancedOpen((o) => !o)}>
          <span>Advanced</span>
          <span aria-hidden>{advancedOpen ? "−" : "+"}</span>
        </button>
        {advancedOpen && (
          <div className="advanced-body">
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="glucose">Glucose (mmol/L)</label>
                <input
                  id="glucose"
                  type="number"
                  step="0.1"
                  value={form.glucose}
                  onChange={(e) => updateField("glucose", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="carbs">Carbs (g)</label>
                <input
                  id="carbs"
                  type="number"
                  step="1"
                  value={form.carbs_g}
                  onChange={(e) => updateField("carbs_g", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="gi">GI category</label>
                <select
                  id="gi"
                  value={form.gi_category}
                  onChange={(e) => updateField("gi_category", e.target.value as SimulateRequest["gi_category"])}
                >
                  <option value="fast">fast</option>
                  <option value="medium">medium</option>
                  <option value="slow">slow</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="msm">Mins since meal</label>
                <input
                  id="msm"
                  type="number"
                  step="1"
                  value={form.mins_since_meal}
                  onChange={(e) => updateField("mins_since_meal", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="ins">Insulin (U)</label>
                <input
                  id="ins"
                  type="number"
                  step="0.1"
                  value={form.insulin_units}
                  onChange={(e) => updateField("insulin_units", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="itype">Insulin type</label>
                <select
                  id="itype"
                  value={form.insulin_type}
                  onChange={(e) => updateField("insulin_type", e.target.value as SimulateRequest["insulin_type"])}
                >
                  <option value="novorapid">novorapid</option>
                  <option value="humalog">humalog</option>
                  <option value="fiasp">fiasp</option>
                  <option value="apidra">apidra</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="msi">Mins since insulin</label>
                <input
                  id="msi"
                  type="number"
                  step="1"
                  value={form.mins_since_insulin}
                  onChange={(e) => updateField("mins_since_insulin", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="act">Activity</label>
                <select
                  id="act"
                  value={form.activity_type}
                  onChange={(e) => updateField("activity_type", e.target.value as SimulateRequest["activity_type"])}
                >
                  <option value="rest">rest</option>
                  <option value="aerobic">aerobic</option>
                  <option value="mixed">mixed</option>
                  <option value="anaerobic">anaerobic</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="dur">Duration (min)</label>
                <input
                  id="dur"
                  type="number"
                  step="1"
                  value={form.activity_duration_mins}
                  onChange={(e) => updateField("activity_duration_mins", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="int">Intensity</label>
                <input
                  id="int"
                  type="number"
                  step="0.1"
                  value={form.intensity}
                  onChange={(e) => updateField("intensity", Number(e.target.value))}
                />
              </div>
            </div>
            <p className="section-label" style={{ marginTop: "0.75rem" }}>
              Profile
            </p>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="isf">ISF</label>
                <input
                  id="isf"
                  type="number"
                  step="0.1"
                  value={form.profile.isf}
                  onChange={(e) => updateProfile("isf", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="icr">ICR (g/U)</label>
                <input
                  id="icr"
                  type="number"
                  step="0.5"
                  value={form.profile.icr}
                  onChange={(e) => updateProfile("icr", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="ait">AIT (h)</label>
                <input
                  id="ait"
                  type="number"
                  step="0.1"
                  value={form.profile.ait_hours}
                  onChange={(e) => updateProfile("ait_hours", Number(e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="w">Weight (kg)</label>
                <input
                  id="w"
                  type="number"
                  step="0.1"
                  value={form.profile.weight_kg}
                  onChange={(e) => updateProfile("weight_kg", Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel panel--side">
        {adviseResult && (
          <>
            <div className={signalClass}>
              {adviseResult.severity === "safe" && "SAFE"}
              {adviseResult.severity === "caution" && "CAUTION"}
              {adviseResult.severity === "danger" && "DANGER"}
            </div>

            {firstT && (
              <>
                <p className="immediate-step">{firstT.name}</p>
                <p className="immediate-detail">{firstT.amount}</p>
              </>
            )}

            <h2 className="section-label" style={{ marginTop: 0 }}>
              Treatment options
            </h2>
            <div className="treatment-cards">
              {sortedTreatments(adviseResult).map((t, i) => (
                <div key={`${t.name}-${i}`} className="treatment-card">
                  <div className="name">{t.name}</div>
                  <div className="amount">{t.amount}</div>
                </div>
              ))}
            </div>

            <h2 className="section-label">Action timeline</h2>
            <ul className="timeline-list">
              {adviseResult.timeline.map((ev, i) => (
                <li key={`${ev.time_min}-${ev.event}-${i}`}>
                  <span className="ts">{formatStepTime(ev.time_min)}</span>
                  <span className="action">{ev.event}</span>
                </li>
              ))}
            </ul>

            {adviseResult.conclusion && (
              <p className="conclusion-note">{adviseResult.conclusion}</p>
            )}

            <div className="recheck-box">
              <div>
                <div className="label">Recheck timer</div>
                <div className="timer">
                  {recheckRemaining == null
                    ? "15:00"
                    : recheckRemaining <= 0
                      ? "0:00"
                      : formatCountdown(recheckRemaining)}
                </div>
              </div>
              <button type="button" className="btn btn-ghost" onClick={startRecheckTimer}>
                Start
              </button>
            </div>

            <p className="backup">{backupLine(adviseResult)}</p>
            {escalation && <p className="escalation">{escalation}</p>}

            <div className="footer-notes">
              <p className="ispad">{adviseResult.ispad_note}</p>
              <p>{adviseResult.disclaimer}</p>
              <p className="ispad-citation">
                Aligned with ISPAD 2022 exercise guidelines for pediatric T1D. Decision support only — not medical
                advice.
              </p>
            </div>
          </>
        )}

        {!adviseResult && !pipelineLoading && (
          <p className="immediate-detail" style={{ marginTop: "2rem" }}>
            Run a simulation to see guidance here.
          </p>
        )}
      </div>
    </div>
  );
}
