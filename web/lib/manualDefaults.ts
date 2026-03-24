import type { ManualScenario, Profile } from "./types";

export function defaultManualScenario(profile: Profile): ManualScenario {
  return {
    glucose: 6.2,
    carbs_g: 0,
    gi_category: "medium",
    mins_since_meal: 60,
    insulin_units: 0,
    insulin_type: "novorapid",
    mins_since_insulin: 120,
    activity_type: "mixed",
    activity_duration_mins: 60,
    intensity: 1.0,
    profile: { ...profile },
  };
}

export function manualToSimulateBody(m: ManualScenario): Record<string, unknown> {
  return {
    glucose: m.glucose,
    carbs_g: m.carbs_g,
    gi_category: m.gi_category,
    mins_since_meal: m.mins_since_meal,
    insulin_units: m.insulin_units,
    insulin_type: m.insulin_type,
    mins_since_insulin: m.mins_since_insulin,
    activity_type: m.activity_type,
    activity_duration_mins: m.activity_duration_mins,
    intensity: m.intensity,
    profile: m.profile,
  };
}
