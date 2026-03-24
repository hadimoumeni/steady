import { describe, expect, it } from "vitest";
import { manualToSimulateBody } from "./manualDefaults";
import type { ManualScenario } from "./types";

describe("manualToSimulateBody", () => {
  it("maps manual scenario to API body shape", () => {
    const m: ManualScenario = {
      glucose: 6.0,
      carbs_g: 30,
      gi_category: "medium",
      mins_since_meal: 0,
      insulin_units: 2,
      insulin_type: "novorapid",
      mins_since_insulin: 30,
      activity_type: "mixed",
      activity_duration_mins: 45,
      intensity: 1.0,
      profile: { isf: 2.8, icr: 15, ait_hours: 3.5, weight_kg: 30 },
    };
    const b = manualToSimulateBody(m);
    expect(b.glucose).toBe(6);
    expect(b.profile).toEqual(m.profile);
    expect(b.activity_type).toBe("mixed");
  });
});
