"""
Dalla Man simplified meal absorption model.

Carbohydrate appearance in plasma is modelled as a Gaussian pulse
parameterised by glycaemic-index category.
"""

import math

GI_PARAMS = {
    "fast":   {"peak_time": 20, "sigma": 15, "absorption_factor": 0.007},
    "medium": {"peak_time": 45, "sigma": 30, "absorption_factor": 0.006},
    "slow":   {"peak_time": 70, "sigma": 40, "absorption_factor": 0.004},
}


def meal_rate(
    t: float,
    carbs_g: float,
    gi_category: str,
    mins_since_meal: float,
) -> float:
    """
    Glucose appearance rate at simulation time *t* (minutes).

    Parameters
    ----------
    t : float — simulation time (min from now)
    carbs_g : float — total carbohydrates in meal (g)
    gi_category : str — "fast" | "medium" | "slow"
    mins_since_meal : float — minutes since the meal was eaten (0 = eating now)

    Returns
    -------
    float — glucose appearance rate (mmol/L/min, approximate)
    """
    if carbs_g <= 0:
        return 0.0

    params = GI_PARAMS.get(gi_category)
    if params is None:
        raise ValueError(f"Unknown GI category: {gi_category}")

    peak = params["peak_time"]
    sigma = params["sigma"]
    af = params["absorption_factor"]

    effective_t = t + mins_since_meal
    exponent = -0.5 * ((effective_t - peak) / sigma) ** 2
    rate = carbs_g * af * math.exp(exponent)

    return rate
