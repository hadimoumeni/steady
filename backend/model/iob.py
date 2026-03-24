"""
Insulin-on-board pharmacokinetic decay model.

Supports four rapid-acting insulin types, each with distinct
onset / peak / duration curves.
"""

INSULIN_PROFILES = {
    "novorapid": {"onset": 0.25, "peak": 1.5, "duration": 4.0},
    "humalog":   {"onset": 0.25, "peak": 1.25, "duration": 4.0},
    "fiasp":     {"onset": 0.08, "peak": 1.0, "duration": 3.5},
    "apidra":    {"onset": 0.25, "peak": 1.0, "duration": 3.5},
}


def calculate_iob(
    units: float,
    mins_ago: float,
    insulin_type: str,
    ait_hours: float,
) -> float:
    """
    Calculate remaining insulin on board using a bilinear activity curve.

    Parameters
    ----------
    units : float — original bolus size (U)
    mins_ago : float — minutes since injection
    insulin_type : str — one of the keys in INSULIN_PROFILES
    ait_hours : float — active insulin time override (hours)

    Returns
    -------
    float — remaining IOB in units
    """
    profile = INSULIN_PROFILES.get(insulin_type)
    if profile is None:
        raise ValueError(f"Unknown insulin type: {insulin_type}")

    ait_min = ait_hours * 60.0
    peak_min = profile["peak"] * 60.0

    if mins_ago <= 0:
        return units
    if mins_ago >= ait_min:
        return 0.0

    # Bilinear activity curve
    if mins_ago <= peak_min:
        activity = 0.75 * (mins_ago / peak_min)
    else:
        activity = 0.75 + 0.25 * ((mins_ago - peak_min) / (ait_min - peak_min))

    return units * (1.0 - activity)


def iob_as_insulin_units_per_minute(
    units: float,
    mins_ago: float,
    insulin_type: str,
    ait_hours: float,
):
    """
    Return a callable f(t) giving the IOB delivery rate (mU/L/min)
    at simulation time *t* (minutes from now).

    The rate is the negative derivative of IOB — how fast insulin is
    entering the plasma from the subcutaneous depot.
    """
    profile = INSULIN_PROFILES.get(insulin_type)
    if profile is None:
        raise ValueError(f"Unknown insulin type: {insulin_type}")

    ait_min = ait_hours * 60.0
    peak_min = profile["peak"] * 60.0

    def rate_fn(t):
        elapsed = mins_ago + t
        if elapsed <= 0 or elapsed >= ait_min:
            return 0.0

        # Derivative of the bilinear activity curve gives a constant rate
        # per segment, multiplied by units to get U/min delivery.
        if elapsed <= peak_min:
            return units * 0.75 / peak_min
        else:
            return units * 0.25 / (ait_min - peak_min)

    return rate_fn
