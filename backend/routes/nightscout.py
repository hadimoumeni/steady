"""
GET /nightscout/current — latest CGM reading from demo Nightscout (best-effort).
"""

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/nightscout", tags=["nightscout"])

NIGHTSCOUT_DEMO_URL = "https://cgmdemo.nightscout.info/api/v1/entries.json?count=1"


@router.get("/current")
async def nightscout_current():
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(NIGHTSCOUT_DEMO_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data or not isinstance(data, list):
            raise ValueError("empty entries")
        entry = data[0]
        sgv = int(entry["sgv"])
        mmol = round(sgv / 18.0, 1)
        direction = entry.get("direction", "Flat")
        return {"glucose_mmol": mmol, "trend": direction, "live": True}
    except Exception:
        return {"glucose_mmol": 6.8, "trend": "Flat", "live": False}
