import type {
  AdviseResponse,
  DemoPayload,
  ExtractResponse,
  NightscoutCurrent,
  Profile,
  SimulateResponse,
} from "./types";
import { offlineExtract } from "./offlineExtract";

function baseUrl(): string {
  const u = process.env.NEXT_PUBLIC_STEADY_API_URL;
  if (!u || !u.trim()) return "http://127.0.0.1:8000";
  return u.replace(/\/$/, "");
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: string | unknown };
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

export async function fetchExtract(
  text: string,
  profile?: Partial<Profile>
): Promise<ExtractResponse> {
  const res = await fetch(`${baseUrl()}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      profile: profile && Object.keys(profile).length ? profile : undefined,
    }),
  });

  // If the backend can't call the LLM (missing ANTHROPIC_API_KEY), fall back
  // to lightweight regex extraction so the prototype still works.
  if (res.status === 503) {
    console.warn("LLM extraction unavailable; using offline parsing fallback.");
    return offlineExtract(text, profile);
  }

  return parseJson<ExtractResponse>(res);
}

export function extractToSimulateBody(ex: ExtractResponse): Record<string, unknown> {
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
    profile: ex.profile,
  };
}

export async function fetchSimulate(body: Record<string, unknown>): Promise<SimulateResponse> {
  const res = await fetch(`${baseUrl()}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<SimulateResponse>(res);
}

export function simulateToAdviseBody(sim: SimulateResponse): Record<string, unknown> {
  return {
    times: sim.times,
    median: sim.median,
    p10: sim.p10,
    p90: sim.p90,
    iob_units: sim.iob_units,
    min_median: sim.min_median,
    min_p10: sim.min_p10,
    danger_probability: sim.danger_probability,
    danger_entry_minutes: sim.danger_entry_minutes,
    late_hypo_risk: sim.late_hypo_risk,
    activity_type: sim.activity_type,
    confidence_score: sim.confidence_score,
  };
}

export async function fetchAdvise(body: Record<string, unknown>): Promise<AdviseResponse> {
  const res = await fetch(`${baseUrl()}/advise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<AdviseResponse>(res);
}

export async function fetchDemo(): Promise<DemoPayload> {
  const res = await fetch(`${baseUrl()}/demo`);
  return parseJson<DemoPayload>(res);
}

export async function fetchNightscoutCurrent(): Promise<NightscoutCurrent> {
  const res = await fetch(`${baseUrl()}/nightscout/current`);
  return parseJson<NightscoutCurrent>(res);
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${baseUrl()}/health`);
  return parseJson(res);
}
