/** Mirrors backend Pydantic models (steady/backend/routes). */

export type Profile = {
  isf: number;
  icr: number;
  ait_hours: number;
  weight_kg: number;
};

export type ExtractResponse = {
  glucose: number;
  carbs_g: number;
  gi_category: string;
  mins_since_meal: number;
  insulin_units: number;
  insulin_type: string;
  mins_since_insulin: number;
  activity_type: string;
  activity_duration_mins: number;
  intensity: number;
  profile: Profile;
  insulin_inferred: boolean;
  insulin_inferred_units: number | null;
};

export type SimulateResponse = {
  times: number[];
  median: number[];
  p10: number[];
  p90: number[];
  iob_units: number;
  min_median: number;
  min_p10: number;
  danger_probability: number;
  danger_entry_minutes: number | null;
  late_hypo_risk: boolean;
  activity_type: string;
  confidence_score: number;
  insulin_inferred: boolean;
  insulin_inferred_units: number | null;
};

export type TreatmentOption = {
  action: string;
  detail: string;
  priority: number;
};

export type TimelineEvent = {
  time_min: number;
  event: string;
  glucose: number;
};

export type AdviseResponse = {
  severity: "safe" | "caution" | "danger";
  severity_label: string;
  immediate_step: string;
  recheck_minutes: number;
  backup_step: string;
  escalation: string;
  late_hypo_warning: string | null;
  treatment_options: TreatmentOption[];
  timeline: TimelineEvent[];
  conclusion: string;
  ispad_note: string;
  disclaimer: string;
};

export type NightscoutCurrent = {
  glucose_mmol: number;
  trend: string;
  live: boolean;
};

export type DemoPayload = {
  simulate: SimulateResponse;
  advise: Record<string, unknown>;
};

/** Manual entry — maps to POST /simulate body. */
export type ManualScenario = {
  glucose: number;
  carbs_g: number;
  gi_category: "fast" | "medium" | "slow";
  mins_since_meal: number;
  insulin_units: number;
  insulin_type: "novorapid" | "humalog" | "fiasp" | "apidra";
  mins_since_insulin: number;
  activity_type: "aerobic" | "mixed" | "anaerobic" | "rest";
  activity_duration_mins: number;
  intensity: number;
  profile: Profile;
};
