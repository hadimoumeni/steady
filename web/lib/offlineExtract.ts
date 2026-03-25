import type { ExtractResponse, Profile } from "./types";

const DEFAULT_PROFILE: Profile = {
  isf: 2.8,
  icr: 15,
  ait_hours: 3.5,
  weight_kg: 28,
};

function normalizeText(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

function inferGiCategory(text: string): ExtractResponse["gi_category"] {
  // Keep precedence: fast > medium > slow.
  const fast = /(juice|sweets?|glucose tabs?|glucose\s*tablets?|candy|sugar)/i;
  const medium = /(banana|oats?|rice|bread)/i;
  const slow = /(pasta|lentils|whole\s*grain)/i;

  if (fast.test(text)) return "fast";
  if (medium.test(text)) return "medium";
  if (slow.test(text)) return "slow";
  return "medium";
}

function inferActivity(text: string): {
  activity_type: ExtractResponse["activity_type"];
  activity_duration_mins: number;
  intensity: ExtractResponse["intensity"];
} {
  const activityType: ExtractResponse["activity_type"] = /(football|tennis|basketball)/i.test(text)
    ? "mixed"
    : /(swimming|jogging|cycling)/i.test(text)
      ? "aerobic"
      : /(sprinting|weights?)/i.test(text)
        ? "anaerobic"
        : "rest";

  const durationHours = (() => {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(hour|hours)\b/i);
    return m ? Number(m[1]) * 60 : null;
  })();
  const durationMinutes = (() => {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(minutes?|mins?)\b/i);
    return m ? Number(m[1]) : null;
  })();

  const activity_duration_mins =
    durationHours != null
      ? Math.round(durationHours)
      : durationMinutes != null
        ? Math.round(durationMinutes)
        : 0;

  const intensity: ExtractResponse["intensity"] = /(hard|intense|competitive|very\s+hard)/i.test(text)
    ? 1.6
    : /(normal|moderate)/i.test(text)
      ? 1.0
      : /(gentle|light|easy)/i.test(text)
        ? 0.4
        : 0.4;

  return { activity_type: activityType, activity_duration_mins, intensity };
}

function parseTimeAgoMinutes(text: string): number | null {
  // Examples:
  // - "an hour ago" => 60
  // - "2 hours ago" => 120
  // - "45 minutes ago" => 45
  const anHour = text.match(/\b(an|a)\s+hour\s+ago\b/i);
  if (anHour) return 60;

  const hours = text.match(/(\d+(?:\.\d+)?)\s*hours?\s+ago\b/i);
  if (hours) return Math.round(Number(hours[1]) * 60);

  const minutes = text.match(/(\d+(?:\.\d+)?)\s*minutes?\s+ago\b/i);
  if (minutes) return Math.round(Number(minutes[1]));

  return null;
}

function parseGlucoseMmol(text: string): number | null {
  const mmol = text.match(/(\d+(?:\.\d+)?)\s*mmol\s*\/?\s*l\b/i);
  if (mmol) return Number(mmol[1]);
  // Be conservative: require "mmol".
  const mmol2 = text.match(/(\d+(?:\.\d+)?)\s*mmol\b/i);
  if (mmol2) return Number(mmol2[1]);
  return null;
}

function parseCarbsG(text: string): number | null {
  // Only accept explicit carb amounts (avoid hallucinating from food names).
  const m1 = text.match(/(\d+(?:\.\d+)?)\s*g\s*(?:carbs|carbohydrates)\b/i);
  if (m1) return Number(m1[1]);
  const m2 = text.match(/(\d+(?:\.\d+)?)\s*grams?\s*(?:carbs|carbohydrates)\b/i);
  if (m2) return Number(m2[1]);
  return null;
}

function parseInsulinUnitsAndType(text: string): {
  insulin_units: number;
  insulin_type: ExtractResponse["insulin_type"];
} {
  const insulin_type: ExtractResponse["insulin_type"] = /(fiasp)/i.test(text)
    ? "fiasp"
    : /(humalog)/i.test(text)
      ? "humalog"
      : /(apidra)/i.test(text)
        ? "apidra"
        : "novorapid";

  // Only accept numeric units when "units/u" is mentioned alongside insulin-ish language.
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:units|u)\b/i);
  if (!m) return { insulin_units: 0, insulin_type };

  const maybe = m.index ?? 0;
  const context = text.slice(Math.max(0, maybe - 40), Math.min(text.length, maybe + 40));
  const hasInsulinContext = /(insulin|novorapid|humalog|fiasp|apidra|bolus|took)/i.test(context);
  if (!hasInsulinContext) return { insulin_units: 0, insulin_type };

  const insulin_units = Number(m[1]);
  return Number.isFinite(insulin_units) ? { insulin_units, insulin_type } : { insulin_units: 0, insulin_type };
}

function parseMinsSinceMealMinutes(text: string): number {
  const lower = normalizeText(text);

  // Prefer explicit relative time with "ago".
  const mins = parseTimeAgoMinutes(lower);
  if (mins != null) {
    // If it clearly looks like insulin timing, don't use it as meal timing.
    if (/(insulin|novorapid|humalog|fiasp|apidra)/i.test(lower)) {
      // Heuristic: if insulin keywords exist anywhere, use "ago" as meal only when meal words appear too.
      // This keeps insulin timing from dominating too often.
      if (/(lunch|dinner|breakfast|ate|had|food|meal)\b/i.test(lower)) return mins;
      return 0;
    }
    return mins;
  }

  // "had [food]" without time => treat as "just ate" (0 minutes since meal).
  if (/\b(had|ate|eating)\b/i.test(text)) return 0;

  return 0;
}

function inferInsulinInference(
  insulin_units: number,
  carbs_g: number,
  profile: Profile
): { insulin_inferred: boolean; insulin_inferred_units: number | null; insulin_units: number } {
  if (insulin_units > 0) return { insulin_units, insulin_inferred: false, insulin_inferred_units: null };
  if (carbs_g <= 0) return { insulin_units: 0, insulin_inferred: false, insulin_inferred_units: null };

  if (profile.icr <= 0) return { insulin_units: 0, insulin_inferred: false, insulin_inferred_units: null };
  const inferred = roundTo1(carbs_g / profile.icr);
  return { insulin_units: inferred, insulin_inferred: true, insulin_inferred_units: inferred };
}

function roundTo1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function offlineExtract(text: string, profileOverride?: Partial<Profile>): ExtractResponse {
  const t = normalizeText(text);

  const glucose = parseGlucoseMmol(t) ?? 6.0;
  const carbs_g = parseCarbsG(t) ?? 0;
  const gi_category = inferGiCategory(t);
  const mins_since_meal = parseMinsSinceMealMinutes(t);

  const { activity_type, activity_duration_mins, intensity } = inferActivity(t);

  const { insulin_units: parsed_insulin_units, insulin_type } = parseInsulinUnitsAndType(t);
  const profile: Profile = { ...DEFAULT_PROFILE, ...(profileOverride ?? {}) };

  const inferred = inferInsulinInference(parsed_insulin_units, carbs_g, profile);

  // We don't reliably distinguish meal vs insulin timing offline, so keep mins_since_insulin conservative.
  const mins_since_insulin = inferred.insulin_units > 0 ? 0 : 0;

  return {
    glucose,
    carbs_g,
    gi_category,
    mins_since_meal,
    insulin_units: inferred.insulin_units,
    insulin_type,
    mins_since_insulin,
    activity_type,
    activity_duration_mins,
    intensity,
    profile,
    insulin_inferred: inferred.insulin_inferred,
    insulin_inferred_units: inferred.insulin_inferred_units,
  };
}

