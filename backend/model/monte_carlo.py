"""
Monte Carlo uncertainty simulation.

Runs 200 perturbed simulations to produce confidence bands
and danger-zone probability estimates.
"""

import numpy as np

from model.bergman import solve_bergman, build_input_functions, P1_DEFAULT, P2_DEFAULT


def run_monte_carlo(params: dict, profile: dict, n_runs: int = 200) -> dict:
    """
    Run Monte Carlo simulation with perturbed parameters.

    Parameters
    ----------
    params : dict — scenario parameters (glucose, carbs_g, etc.)
    profile : dict — patient profile (isf, icr, ait_hours, weight_kg)
    n_runs : int — number of simulation runs

    Returns
    -------
    dict with median, p10, p90 trajectories and danger metrics
    """
    base_glucose = params["glucose"]
    base_carbs = params.get("carbs_g", 0)
    base_isf = profile.get("isf", 2.8)

    trajectories = []
    first_hypo_times = []

    times = np.linspace(0, 120, 25)

    for _ in range(n_runs):
        # Perturb parameters
        p_glucose = np.random.normal(base_glucose, base_glucose * 0.04)
        p_carbs = max(0, np.random.normal(base_carbs, base_carbs * 0.15)) if base_carbs > 0 else 0
        p_isf = max(0.5, np.random.normal(base_isf, base_isf * 0.10))
        p_p1 = max(0.001, np.random.normal(P1_DEFAULT, 0.003))
        p_p2 = max(0.001, np.random.normal(P2_DEFAULT, 0.003))

        # Build perturbed scenario
        perturbed_params = {**params, "carbs_g": p_carbs}
        perturbed_profile = {**profile, "isf": p_isf}

        meal_fn, exercise_fn, iob_fn = build_input_functions(
            perturbed_params, perturbed_profile
        )

        trajectory = solve_bergman(
            initial_bg=p_glucose,
            p1=p_p1,
            p2=p_p2,
            isf=p_isf,
            meal_rate_fn=meal_fn,
            exercise_fn=exercise_fn,
            iob_rate_fn=iob_fn,
            weight_kg=perturbed_profile.get("weight_kg", 70.0),
        )

        trajectories.append(trajectory)

        # Track first hypo event
        hypo_indices = [i for i, g in enumerate(trajectory) if g < 3.9]
        if hypo_indices:
            first_hypo_times.append(times[hypo_indices[0]])

    all_curves = np.array(trajectories)

    median = np.median(all_curves, axis=0).tolist()
    p10 = np.percentile(all_curves, 10, axis=0).tolist()
    p90 = np.percentile(all_curves, 90, axis=0).tolist()

    danger_count = sum(1 for t in trajectories if min(t) < 3.9)
    danger_probability = danger_count / n_runs

    danger_entry_minutes = None
    if first_hypo_times:
        danger_entry_minutes = int(np.median(first_hypo_times))

    return {
        "median": median,
        "p10": p10,
        "p90": p90,
        "danger_probability": round(danger_probability, 3),
        "danger_entry_minutes": danger_entry_minutes,
        "min_median": round(float(min(median)), 2),
        "min_p10": round(float(min(p10)), 2),
    }
