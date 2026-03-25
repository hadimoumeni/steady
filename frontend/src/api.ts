import type {
  AdviseResponse,
  ExtractResponse,
  NightscoutCurrent,
  SimulateRequest,
  SimulateResponse,
} from "./types";

function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ?? "";
  if (base) return `${base}${path}`;
  return `/api${path}`;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const err = JSON.parse(text) as { detail?: unknown };
      if (typeof err.detail === "string") detail = err.detail;
      else if (err.detail != null) detail = JSON.stringify(err.detail);
    } catch {
      /* use raw text */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

export async function getHealth(): Promise<{ status: string }> {
  const res = await fetch(apiUrl("/health"));
  return parseJson(res);
}

export async function getReady(): Promise<{ ready: boolean; anthropic: boolean }> {
  const res = await fetch(apiUrl("/ready"));
  return parseJson(res);
}

export async function getNightscoutCurrent(): Promise<NightscoutCurrent> {
  const res = await fetch(apiUrl("/nightscout/current"));
  return parseJson(res);
}

export async function postExtract(text: string): Promise<ExtractResponse> {
  const res = await fetch(apiUrl("/extract"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return parseJson(res);
}

export async function postSimulate(body: SimulateRequest): Promise<SimulateResponse> {
  const res = await fetch(apiUrl("/simulate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

function toAdvisePayload(s: SimulateResponse) {
  return {
    times: s.times,
    median: s.median,
    p10: s.p10,
    p90: s.p90,
    iob_units: s.iob_units,
    min_median: s.min_median,
    min_p10: s.min_p10,
    danger_probability: s.danger_probability,
    danger_entry_minutes: s.danger_entry_minutes,
    late_hypo_risk: s.late_hypo_risk,
    activity_type: s.activity_type,
    confidence_score: s.confidence_score,
  };
}

export async function postAdvise(sim: SimulateResponse): Promise<AdviseResponse> {
  const res = await fetch(apiUrl("/advise"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toAdvisePayload(sim)),
  });
  return parseJson(res);
}
