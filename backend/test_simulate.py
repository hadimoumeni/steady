"""
Verification test for the /simulate endpoint.
"""

import requests
import json

payload = {
    "glucose": 6.8,
    "carbs_g": 30,
    "gi_category": "medium",
    "mins_since_meal": 0,
    "insulin_units": 2.0,
    "insulin_type": "novorapid",
    "mins_since_insulin": 90,
    "activity_type": "mixed",
    "activity_duration_mins": 60,
    "intensity": 1.0,
    "profile": {
        "isf": 2.8,
        "icr": 15,
        "ait_hours": 3.5,
        "weight_kg": 28,
    },
}

resp = requests.post("http://127.0.0.1:1111/simulate", json=payload)
data = resp.json()

print(json.dumps(data, indent=2))

print("\n--- Verification ---")
print(f"Starts at:            {data['median'][0]}")
print(f"min_median:           {data['min_median']}")
print(f"danger_probability:   {data['danger_probability']}")
print(f"late_hypo_risk:       {data['late_hypo_risk']}")
print(f"iob_units:            {data['iob_units']}")
print(f"confidence_score:     {data['confidence_score']}")
print(f"activity_type:        {data['activity_type']}")
