export type GiCategory = "fast" | "medium" | "slow";
export type InsulinType = "novorapid" | "humalog" | "fiasp" | "apidra";
export type ActivityType = "aerobic" | "mixed" | "anaerobic" | "rest";

export interface Profile {
  isf: number;
  icr: number;
  ait_hours: number;
  weight_kg: number;
}

export interface SimulateRequest {
  glucose: number;
  carbs_g: number;
  gi_category: GiCategory;
  mins_since_meal: number;
  insulin_units: number;
  insulin_type: InsulinType;
  mins_since_insulin: number;
  activity_type: ActivityType;
  activity_duration_mins: number;
  intensity: number;
  profile: Profile;
}

export interface SimulateResponse {
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
}

export interface TreatmentOption {
  name: string;
  amount: string;
  priority: number;
}

export interface TimelineEvent {
  time_min: number;
  event: string;
  glucose: number;
}

export interface AdviseResponse {
  severity: "safe" | "caution" | "danger";
  treatment_options: TreatmentOption[];
  timeline: TimelineEvent[];
  conclusion: string;
  ispad_note: string;
  disclaimer: string;
}

export interface ExtractResponse {
  glucose: number;
  carbs_g: number;
  gi_category: GiCategory;
  mins_since_meal: number;
  insulin_units: number;
  insulin_type: InsulinType;
  mins_since_insulin: number;
  activity_type: ActivityType;
  activity_duration_mins: number;
  intensity: number;
  profile: Profile;
  insulin_inferred: boolean;
  insulin_inferred_units: number | null;
}

export interface NightscoutCurrent {
  glucose_mmol: number;
  trend: string;
  live: boolean;
}
