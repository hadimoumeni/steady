"""
POST /advise — severity classification, treatment lookup, and Claude conclusion.

Severity + treatment options + timeline are computed in Python.
Claude is called only for a 2-3 sentence plain-English conclusion, streamed via SSE.
"""

import json
import os
from pathlib import Path

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter()

PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "advice_prompt.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class AdviseRequest(BaseModel):
    times: list[int]
    median: list[float]
    p10: list[float]
    p90: list[float]
    iob_units: float = 0
    min_median: float
    min_p10: float
    danger_probability: float = 0
    danger_entry_minutes: int | None = None
    late_hypo_risk: bool = False
    activity_type: str = "rest"
    confidence_score: int = 1


class TreatmentOption(BaseModel):
    action: str
    detail: str
    priority: int  # 1 = most urgent


class TimelineEvent(BaseModel):
    time_min: int
    event: str
    glucose: float


class AdviseResponse(BaseModel):
    severity: str
    treatment_options: list[TreatmentOption]
    timeline: list[TimelineEvent]
    conclusion: str


# ---------------------------------------------------------------------------
# Severity classification — pure Python
# ---------------------------------------------------------------------------

def classify_severity(req: AdviseRequest) -> str:
    if req.min_p10 < 2.8:
        return "critical"
    if req.min_p10 < 3.3 or req.danger_probability > 0.7:
        return "severe"
    if req.min_median < 3.9 or req.danger_probability > 0.4:
        return "moderate"
    if req.min_median < 5.0 or req.danger_probability > 0.15:
        return "mild"
    return "ok"


# ---------------------------------------------------------------------------
# Treatment options — lookup table, no Claude
# ---------------------------------------------------------------------------

TREATMENT_TABLE = {
    "critical": [
        TreatmentOption(action="Immediate fast carbs", detail="15-20g glucose tablets or juice now", priority=1),
        TreatmentOption(action="Stop activity", detail="Cease all exercise immediately", priority=1),
        TreatmentOption(action="Recheck in 10 min", detail="Re-scan CGM or finger prick in 10 minutes", priority=2),
    ],
    "severe": [
        TreatmentOption(action="Fast carbs", detail="15g fast-acting carbs (juice box, glucose tabs)", priority=1),
        TreatmentOption(action="Reduce activity", detail="Switch to rest or light activity", priority=2),
        TreatmentOption(action="Monitor closely", detail="Check glucose every 15 minutes", priority=2),
    ],
    "moderate": [
        TreatmentOption(action="Snack", detail="10-15g medium carbs (half a banana, crackers)", priority=1),
        TreatmentOption(action="Reduce intensity", detail="Lower exercise intensity if active", priority=2),
        TreatmentOption(action="Monitor", detail="Check glucose in 20-30 minutes", priority=3),
    ],
    "mild": [
        TreatmentOption(action="Small snack", detail="5-10g carbs if activity is planned", priority=1),
        TreatmentOption(action="Watch trend", detail="Keep an eye on CGM trend arrows", priority=2),
    ],
    "ok": [
        TreatmentOption(action="Continue as planned", detail="Glucose trajectory looks stable", priority=1),
    ],
}


def get_treatment_options(severity: str, req: AdviseRequest) -> list[TreatmentOption]:
    options = list(TREATMENT_TABLE.get(severity, TREATMENT_TABLE["ok"]))

    # Add late-hypo warning if applicable
    if req.late_hypo_risk:
        options.append(TreatmentOption(
            action="Post-exercise snack",
            detail="Have 15-20g slow carbs within 30 min after activity to prevent delayed hypo",
            priority=2,
        ))

    # Add IOB warning if significant
    if req.iob_units > 0.5:
        options.append(TreatmentOption(
            action="IOB awareness",
            detail=f"{req.iob_units:.1f}U still active — glucose will continue to drop",
            priority=2,
        ))

    options.sort(key=lambda o: o.priority)
    return options


# ---------------------------------------------------------------------------
# Timeline — built from simulation data, no Claude
# ---------------------------------------------------------------------------

def build_timeline(req: AdviseRequest) -> list[TimelineEvent]:
    events = []
    median = req.median
    times = req.times

    # Start
    events.append(TimelineEvent(time_min=times[0], event="Current reading", glucose=median[0]))

    # Peak glucose
    peak_idx = int(max(range(len(median)), key=lambda i: median[i]))
    if peak_idx > 0:
        events.append(TimelineEvent(time_min=times[peak_idx], event="Peak glucose", glucose=median[peak_idx]))

    # First crossing below 5.0 (getting low)
    for i, g in enumerate(median):
        if g < 5.0 and i > 0 and median[i - 1] >= 5.0:
            events.append(TimelineEvent(time_min=times[i], event="Dropping below 5.0", glucose=round(g, 2)))
            break

    # First crossing below 3.9 (hypo)
    for i, g in enumerate(median):
        if g < 3.9 and i > 0 and median[i - 1] >= 3.9:
            events.append(TimelineEvent(time_min=times[i], event="Hypo threshold crossed", glucose=round(g, 2)))
            break

    # Lowest point
    min_idx = int(min(range(len(median)), key=lambda i: median[i]))
    events.append(TimelineEvent(time_min=times[min_idx], event="Lowest predicted", glucose=median[min_idx]))

    # End
    events.append(TimelineEvent(time_min=times[-1], event="End of simulation", glucose=median[-1]))

    # Deduplicate by time and sort
    seen = set()
    unique = []
    for e in events:
        if e.time_min not in seen:
            seen.add(e.time_min)
            unique.append(e)
    unique.sort(key=lambda e: e.time_min)

    return unique


# ---------------------------------------------------------------------------
# Claude conclusion — the only LLM call, streamed via SSE
# ---------------------------------------------------------------------------

def stream_conclusion(severity: str, req: AdviseRequest, treatment_options, timeline):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    context = {
        "severity": severity,
        "min_median": req.min_median,
        "min_p10": req.min_p10,
        "danger_probability": req.danger_probability,
        "danger_entry_minutes": req.danger_entry_minutes,
        "activity_type": req.activity_type,
        "iob_units": req.iob_units,
        "late_hypo_risk": req.late_hypo_risk,
        "treatment_options": [t.model_dump() for t in treatment_options],
        "timeline": [e.model_dump() for e in timeline],
    }

    client = anthropic.Anthropic(api_key=api_key)

    with client.messages.stream(
        model="claude-sonnet-4-20250514",
        max_tokens=256,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": json.dumps(context)}],
    ) as stream:
        for text in stream.text_stream:
            yield text


def get_conclusion_sync(severity: str, req: AdviseRequest, treatment_options, timeline) -> str:
    """Non-streaming version — collects the full conclusion."""
    parts = []
    for chunk in stream_conclusion(severity, req, treatment_options, timeline):
        parts.append(chunk)
    return "".join(parts)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/advise", response_model=AdviseResponse)
def advise(req: AdviseRequest):
    severity = classify_severity(req)
    treatment_options = get_treatment_options(severity, req)
    timeline = build_timeline(req)
    conclusion = get_conclusion_sync(severity, req, treatment_options, timeline)

    return AdviseResponse(
        severity=severity,
        treatment_options=treatment_options,
        timeline=timeline,
        conclusion=conclusion,
    )


@router.post("/advise/stream")
def advise_stream(req: AdviseRequest):
    severity = classify_severity(req)
    treatment_options = get_treatment_options(severity, req)
    timeline = build_timeline(req)

    def sse_generator():
        # First send the structured data
        structured = {
            "severity": severity,
            "treatment_options": [t.model_dump() for t in treatment_options],
            "timeline": [e.model_dump() for e in timeline],
        }
        yield f"data: {json.dumps({'type': 'metadata', 'data': structured})}\n\n"

        # Then stream the conclusion
        for chunk in stream_conclusion(severity, req, treatment_options, timeline):
            yield f"data: {json.dumps({'type': 'conclusion', 'text': chunk})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
