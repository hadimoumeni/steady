"""
Bergman Minimal Model for glucose-insulin dynamics.

Three-compartment ODE system:
  G(t) — plasma glucose concentration (mmol/L)
  X(t) — remote insulin action
  I(t) — plasma insulin concentration (mU/L)
"""

import numpy as np
from scipy.integrate import solve_ivp

from model.meal_absorption import meal_rate as _meal_rate
from model.exercise import exercise_uptake as _exercise_uptake
from model.iob import iob_as_insulin_units_per_minute

# Fixed constants
Gb = 4.5        # Basal glucose (mmol/L)
Ib = 8.0        # Basal insulin (mU/L)
P1_DEFAULT = 0.028
P2_DEFAULT = 0.025
N = 0.093       # Insulin clearance rate (1/min)
GAMMA = 0.08    # Pancreatic insulin response (low for T1D)
G_THRESHOLD = 4.5

T_POINTS = 25
T_MAX = 120


def bergman_odes(t, y, params):
    """
    Bergman minimal model ODEs with meal, insulin, and exercise inputs.

    Parameters
    ----------
    t : float — current time (min)
    y : array — [G, X, I] state vector
    params : dict — contains model parameters and input functions
    """
    G, X, I = y

    p1 = params["p1"]
    p2 = params["p2"]
    p3 = params["p3"]

    mr = params["meal_rate_fn"](t)
    eu = params["exercise_fn"](t, G)
    iob_rate_u_per_min = params["iob_rate_fn"](t)

    # Convert IOB rate from U/min to mU/L/min via insulin distribution volume
    vi_L = 0.05 * params["weight_kg"]
    iob_rate = iob_rate_u_per_min * 1000.0 / vi_L

    dGdt = -p1 * (G - Gb) - X * G + mr - eu
    dXdt = -p2 * X + p3 * (I - Ib)
    dIdt = -N * (I - Ib) + GAMMA * max(0.0, G - G_THRESHOLD) + iob_rate

    return [dGdt, dXdt, dIdt]


def solve_bergman(
    initial_bg: float,
    p1: float,
    p2: float,
    isf: float,
    meal_rate_fn,
    exercise_fn,
    iob_rate_fn,
    weight_kg: float = 70.0,
) -> list[float]:
    """
    Solve the Bergman model over 120 minutes.

    Returns
    -------
    list of 25 glucose values (mmol/L), clamped to [1.5, 30].
    """
    p3 = 0.000013 * (isf / 2.8)

    params = {
        "p1": p1,
        "p2": p2,
        "p3": p3,
        "meal_rate_fn": meal_rate_fn,
        "exercise_fn": exercise_fn,
        "iob_rate_fn": iob_rate_fn,
        "weight_kg": weight_kg,
    }

    y0 = [initial_bg, 0.0, Ib]
    t_eval = np.linspace(0, T_MAX, T_POINTS)

    sol = solve_ivp(
        bergman_odes,
        [0, T_MAX],
        y0,
        t_eval=t_eval,
        args=(params,),
        method="RK45",
        max_step=1.0,
    )

    glucose = np.clip(sol.y[0], 1.5, 30.0)
    return glucose.tolist()


def build_input_functions(scenario: dict, profile: dict):
    """
    Build the three callable input functions from a scenario dict.

    Returns (meal_rate_fn, exercise_fn, iob_rate_fn)
    """
    carbs_g = scenario.get("carbs_g", 0)
    gi_category = scenario.get("gi_category", "medium")
    mins_since_meal = scenario.get("mins_since_meal", 0)

    insulin_units = scenario.get("insulin_units", 0)
    insulin_type = scenario.get("insulin_type", "novorapid")
    mins_since_insulin = scenario.get("mins_since_insulin", 0)
    ait_hours = profile.get("ait_hours", 3.5)

    activity_type = scenario.get("activity_type", "rest")
    duration_mins = scenario.get("activity_duration_mins", 0)
    intensity = scenario.get("intensity", 0.4)
    isf = profile.get("isf", 2.8)

    def mrf(t):
        return _meal_rate(t, carbs_g, gi_category, mins_since_meal)

    def exf(t, glucose):
        return _exercise_uptake(t, glucose, activity_type, duration_mins, intensity, isf)

    iob_fn = iob_as_insulin_units_per_minute(
        insulin_units, mins_since_insulin, insulin_type, ait_hours
    )

    return mrf, exf, iob_fn
