"""
Exercise perturbation layer.

Three physiological modes — aerobic, mixed, anaerobic — plus rest.
Each mode alters glucose uptake differently during the activity window.
"""


def exercise_uptake(
    t: float,
    glucose: float,
    activity_type: str,
    duration_mins: float,
    intensity: float,
    isf: float,
) -> float:
    """
    Glucose uptake (or release) due to exercise at simulation time *t*.

    Parameters
    ----------
    t : float — simulation time (min)
    glucose : float — current glucose level (mmol/L)
    activity_type : str — "aerobic" | "mixed" | "anaerobic" | "rest"
    duration_mins : float — total activity duration (min)
    intensity : float — 0.4 (light) / 1.0 (moderate) / 1.6 (intense)
    isf : float — insulin sensitivity factor (mmol/L per unit)

    Returns
    -------
    float — glucose uptake rate (mmol/L/min). Positive = glucose drops.
            Negative = glucose rises (adrenaline response).
    """
    isf_factor = isf / 2.8

    if activity_type == "rest":
        return 0.001 * glucose

    # Only apply exercise effect during the activity window
    if t < 0 or t > duration_mins:
        return 0.001 * glucose  # baseline rest uptake outside window

    if activity_type == "aerobic":
        return intensity * 0.008 * glucose * isf_factor

    if activity_type == "mixed":
        if t < 15:
            return -0.003 * intensity * glucose
        else:
            return intensity * 0.007 * glucose * isf_factor

    if activity_type == "anaerobic":
        return -0.003 * intensity * glucose

    return 0.001 * glucose
