"""
POST /extract — Claude NLP extraction of simulation parameters from natural language.
"""

import json
import os
from pathlib import Path

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "extraction_prompt.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text()


class Profile(BaseModel):
    isf: float = 2.8
    icr: float = 15.0
    ait_hours: float = 3.5
    weight_kg: float = 28.0


class ExtractRequest(BaseModel):
    text: str = Field(..., description="Natural language scenario description")
    profile: Profile | None = Field(
        None,
        description="Optional profile overrides (merged on top of extracted profile)",
    )


class ExtractResponse(BaseModel):
    glucose: float = 6.0
    carbs_g: float = 0
    gi_category: str = "medium"
    mins_since_meal: float = 0
    insulin_units: float = 0
    insulin_type: str = "novorapid"
    mins_since_insulin: float = 0
    activity_type: str = "rest"
    activity_duration_mins: float = 0
    intensity: float = 0.4
    profile: Profile = Field(default_factory=Profile)
    insulin_inferred: bool = False
    insulin_inferred_units: float | None = None


@router.post("/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": req.text}],
    )

    raw = message.content[0].text.strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = [line for line in lines if not line.startswith("```")]
        raw = "\n".join(lines)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=422,
            detail=f"Claude returned invalid JSON: {raw[:200]}",
        )

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail="Claude JSON must be an object")

    # Merge optional request profile on top of extracted profile
    if req.profile is not None:
        base_prof = parsed.get("profile")
        if not isinstance(base_prof, dict):
            base_prof = {}
        defaults = Profile().model_dump()
        override = req.profile.model_dump(exclude_unset=True)
        merged = {**defaults, **base_prof, **override}
        parsed["profile"] = merged

    data = ExtractResponse.model_validate(parsed)

    if data.insulin_units == 0 and data.carbs_g > 0:
        if data.profile.icr <= 0:
            raise HTTPException(
                status_code=422,
                detail="profile.icr must be positive for carb-based insulin inference",
            )
        insulin_units = round(data.carbs_g / data.profile.icr, 1)
        insulin_inferred = True
        insulin_inferred_units = insulin_units
        data = data.model_copy(
            update={
                "insulin_units": insulin_units,
                "insulin_inferred": insulin_inferred,
                "insulin_inferred_units": insulin_inferred_units,
            }
        )
    else:
        data = data.model_copy(
            update={
                "insulin_inferred": False,
                "insulin_inferred_units": None,
            }
        )

    return data
