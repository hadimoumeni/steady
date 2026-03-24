"""
Steady — FastAPI glucose simulation engine.
"""

import asyncio
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from routes.simulate import router as simulate_router
from routes.extract import router as extract_router
from routes.advise import router as advise_router
from routes.nightscout import router as nightscout_router

DEMO_RESPONSE = {
    "simulate": {
        "times": [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120],
        "median": [6.8, 6.9, 7.0, 6.9, 6.7, 6.4, 6.1, 5.8, 5.5, 5.2, 4.9, 4.7, 4.5, 4.3, 4.2, 4.1, 4.0, 3.9, 3.9, 3.8, 3.9, 4.0, 4.1, 4.2, 4.3],
        "p10": [6.8, 6.7, 6.8, 6.6, 6.3, 5.9, 5.5, 5.1, 4.7, 4.4, 4.1, 3.8, 3.6, 3.4, 3.3, 3.2, 3.1, 3.0, 3.0, 2.9, 3.0, 3.1, 3.2, 3.3, 3.4],
        "p90": [6.8, 7.1, 7.3, 7.2, 7.1, 6.9, 6.7, 6.5, 6.3, 6.1, 5.8, 5.6, 5.4, 5.3, 5.2, 5.1, 5.0, 4.9, 4.9, 4.8, 4.9, 5.0, 5.1, 5.2, 5.3],
        "iob_units": 0.82,
        "min_median": 3.8,
        "min_p10": 2.9,
        "danger_probability": 0.68,
        "danger_entry_minutes": 47,
        "late_hypo_risk": True,
        "activity_type": "mixed",
        "confidence_score": 5,
        "insulin_inferred": True,
        "insulin_inferred_units": 2.0,
    },
    "advise": {
        "severity": "caution",
        "severity_label": "Give carbs before she goes",
        "immediate_step": "Give 15g fast-acting carbs before she leaves",
        "treatment_options": [
            {"name": "Glucose tablets", "amount": "3 tablets", "gi": "fast", "recommended": True},
            {"name": "Orange juice", "amount": "150ml", "gi": "fast", "recommended": True},
            {"name": "Small banana", "amount": "half", "gi": "medium", "recommended": False},
        ],
        "timeline": [
            {"time": "Now", "action": "Give 15g fast carbs then go", "type": "action"},
            {"time": "35 min", "action": "Give 10g fast carbs at halftime", "type": "action"},
            {"time": "60 min", "action": "Check glucose at full time", "type": "check"},
            {"time": "Tonight", "action": "Check before bed — late hypo risk", "type": "warning"},
        ],
        "recheck_minutes": 15,
        "backup_step": "If glucose hasn't risen after 15 minutes give another 15g and contact your diabetes team",
        "escalation": "If Lena is unconscious or cannot swallow do not give food. Call 112 immediately.",
        "ispad_note": "Consistent with ISPAD 2022: pre-exercise glucose warrants 10–15g fast carbs for mixed or aerobic activity.",
        "disclaimer": "Steady is decision support, not medical advice. Always follow your diabetes team's specific guidance.",
        "late_hypo_warning": "Check Lena's glucose before bed tonight. After mixed-intensity football her muscles continue drawing glucose for hours. Consider a slow-release snack at bedtime.",
        "conclusion": (
            "Lena's glucose is predicted to drop into the caution zone around 47 minutes into the match — the insulin from this morning is still partially active which is why the risk is higher than her starting number suggests. Give fast carbs now and she can play safely."
        ),
    },
}

app = FastAPI(title="Steady", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timeout_middleware(request: Request, call_next):
    try:
        return await asyncio.wait_for(call_next(request), timeout=45.0)
    except asyncio.TimeoutError:
        return JSONResponse(
            {"detail": "Request timed out"},
            status_code=504,
        )


app.include_router(simulate_router)
app.include_router(extract_router)
app.include_router(advise_router)
app.include_router(nightscout_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    key = os.environ.get("ANTHROPIC_API_KEY")
    ok = key is not None and str(key).strip() != ""
    return {"ready": ok, "anthropic": ok}


@app.get("/demo")
def demo():
    return DEMO_RESPONSE
