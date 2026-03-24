"""
POST /simulate — run glucose simulation with Monte Carlo uncertainty.
"""

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

from model.iob import calculate_iob
from model.monte_carlo import run_monte_carlo

router = APIRouter()


class Profile(BaseModel):
    isf: float = Field(2.8, description="Insulin sensitivity factor (mmol/L per unit)")
    icr: float = Field(15.0, description="Insulin to carb ratio (g per unit)")
    ait_hours: float = Field(3.5, description="Active insulin time (hours)")
    weight_kg: float = Field(28.0, description="Patient weight (kg)")


class SimulateRequest(BaseModel):
    glucose: float = Field(..., description="Current CGM reading (mmol/L)")
    carbs_g: float = Field(0, description="Carbs to eat or recently eaten (g)")
    gi_category: str = Field("medium", description="fast | medium | slow")
    mins_since_meal: float = Field(0, description="Minutes since meal (0 = eating now)")
    insulin_units: float = Field(0, description="Bolus units taken")
    insulin_type: str = Field("novorapid", description="novorapid | humalog | fiasp | apidra")
    mins_since_insulin: float = Field(0, description="Minutes since insulin was given")
    activity_type: str = Field("rest", description="aerobic | mixed | anaerobic | rest")
    activity_duration_mins: float = Field(0, description="Activity duration (min)")
    intensity: float = Field(0.4, description="0.4 (light) | 1.0 (moderate) | 1.6 (intense)")
    profile: Profile = Field(default_factory=Profile)


def compute_confidence_score(req: SimulateRequest) -> int:
    score = 1  # glucose is always provided
    if req.carbs_g > 0:
        score = 2
    if req.insulin_units > 0:
        score = max(score, 3)
    if req.activity_type != "rest" and req.activity_duration_mins > 0:
        score = max(score, 4)
    if score == 4 and req.profile.isf != 2.8:
        score = 5
    return score


@router.post("/simulate")
def simulate(req: SimulateRequest):
    params = req.model_dump()
    profile = params.pop("profile")

    # Run Monte Carlo
    mc_result = run_monte_carlo(params, profile, n_runs=200)

    # Current IOB
    iob_units = 0.0
    if req.insulin_units > 0:
        iob_units = calculate_iob(
            req.insulin_units,
            req.mins_since_insulin,
            req.insulin_type,
            req.profile.ait_hours,
        )

    # Late hypo risk flag
    late_hypo_risk = (
        req.activity_type in ("aerobic", "mixed")
        and req.activity_duration_mins >= 45
    )

    times = np.linspace(0, 120, 25).astype(int).tolist()

    return {
        "times": times,
        "median": [round(v, 2) for v in mc_result["median"]],
        "p10": [round(v, 2) for v in mc_result["p10"]],
        "p90": [round(v, 2) for v in mc_result["p90"]],
        "iob_units": round(iob_units, 2),
        "min_median": mc_result["min_median"],
        "min_p10": mc_result["min_p10"],
        "danger_probability": mc_result["danger_probability"],
        "danger_entry_minutes": mc_result["danger_entry_minutes"],
        "late_hypo_risk": late_hypo_risk,
        "activity_type": req.activity_type,
        "confidence_score": compute_confidence_score(req),
    }
