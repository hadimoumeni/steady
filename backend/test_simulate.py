"""
Verification tests for /simulate, /extract, and /advise endpoints.
"""

import json
import requests

BASE = "http://127.0.0.1:8000"

extract_ok = False
advise_ok = False

# ── 1. POST /simulate ─────────────────────────────────────────────────────

print("=" * 60)
print("TEST 1: POST /simulate")
print("=" * 60)

simulate_payload = {
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

resp = requests.post(f"{BASE}/simulate", json=simulate_payload)
sim_data = resp.json()

print(f"Status: {resp.status_code}")
print(f"  median[0]:          {sim_data['median'][0]}")
print(f"  min_median:         {sim_data['min_median']}")
print(f"  danger_probability: {sim_data['danger_probability']}")
print(f"  late_hypo_risk:     {sim_data['late_hypo_risk']}")
print(f"  iob_units:          {sim_data['iob_units']}")
print(f"  confidence_score:   {sim_data['confidence_score']}")
print(f"  activity_type:      {sim_data['activity_type']}")

assert resp.status_code == 200, "simulate failed"
assert len(sim_data["median"]) == 25, "expected 25 points"
assert sim_data["late_hypo_risk"] is True
print("  ✓ PASSED\n")


# ── 2. POST /extract ─────────────────────────────────────────────────────

print("=" * 60)
print("TEST 2: POST /extract")
print("=" * 60)

extract_payload = {
    "text": "Lena is 6.8 right now. She ate 30g of rice 10 minutes ago and took 2 units of NovoRapid an hour and a half ago. She's about to play football for an hour at moderate intensity. She weighs 28kg, ISF is 2.8, ICR is 15."
}

resp = requests.post(f"{BASE}/extract", json=extract_payload)

if resp.status_code == 500 and "ANTHROPIC_API_KEY" in resp.text:
    print("  ⚠ Skipped — ANTHROPIC_API_KEY not set")
    print("  (Set it in backend/.env to test this endpoint)\n")
    extract_ok = False
else:
    ext_data = resp.json()
    print(f"Status: {resp.status_code}")
    print(json.dumps(ext_data, indent=2))

    assert resp.status_code == 200, f"extract failed: {resp.text}"
    assert ext_data["glucose"] == 6.8
    assert ext_data["carbs_g"] == 30
    assert ext_data["activity_type"] == "mixed"
    print("  ✓ PASSED\n")
    extract_ok = True


# ── 3. POST /advise ─────────────────────────────────────────────────────

print("=" * 60)
print("TEST 3: POST /advise")
print("=" * 60)

advise_payload = sim_data  # feed simulation output directly

resp = requests.post(f"{BASE}/advise", json=advise_payload)
adv_data = resp.json()
print(f"Status: {resp.status_code}")
print(f"  severity:           {adv_data['severity']}")
print(f"  treatment_options:  {len(adv_data['treatment_options'])} options")
for opt in adv_data["treatment_options"]:
    print(f"    [{opt['priority']}] {opt['action']}: {opt['detail']}")
print(f"  timeline:           {len(adv_data['timeline'])} events")
for evt in adv_data["timeline"]:
    print(f"    t={evt['time_min']}min: {evt['event']} ({evt['glucose']} mmol/L)")
print(f"  conclusion:         {adv_data['conclusion'][:120]}...")

assert resp.status_code == 200, f"advise failed: {resp.text}"
assert adv_data["severity"] in ("safe", "caution", "danger")
assert len(adv_data["treatment_options"]) > 0
assert len(adv_data["timeline"]) >= 2
assert len(adv_data["conclusion"]) > 0
assert adv_data.get("ispad_note"), "ispad_note should be non-empty"
assert adv_data.get("disclaimer"), "disclaimer should be non-empty"
print("  ✓ PASSED\n")
advise_ok = True


# ── 4. Demo, Nightscout, Ready ─────────────────────────────────────────────

print("\n=== TEST /demo ===")
r = requests.get(f"{BASE}/demo")
d = r.json()
assert "simulate" in d
assert "advise" in d
assert d["advise"]["severity"] == "caution"
assert d["advise"]["ispad_note"] != ""
assert d["advise"]["disclaimer"] != ""
print("PASS: /demo")

print("\n=== TEST /nightscout/current ===")
r = requests.get(f"{BASE}/nightscout/current")
d = r.json()
assert "glucose_mmol" in d
assert "live" in d
assert isinstance(d["glucose_mmol"], float)
print(f"Nightscout: {d['glucose_mmol']} mmol/L live={d['live']}")
print("PASS: /nightscout/current")

print("\n=== TEST /ready ===")
r = requests.get(f"{BASE}/ready")
d = r.json()
assert "ready" in d
assert "anthropic" in d
print(f"Ready: {d}")
print("PASS: /ready")

print("\n=== ALL BACKEND TESTS COMPLETE ===")

# ── Summary ───────────────────────────────────────────────────────────────

print("=" * 60)
print("SUMMARY")
print("=" * 60)
print("  /simulate: ✓ PASSED")
print(f"  /extract:  {'✓ PASSED' if extract_ok else '⚠ SKIPPED (no API key)'}")
print(f"  /advise:   {'✓ PASSED' if advise_ok else '⚠ SKIPPED (no API key)'}")
print("  /demo, /nightscout/current, /ready: ✓ PASSED")
