"""
POST /advise — severity classification, treatment lookup, and Claude conclusion.

Severity + treatment options + timeline are computed in Python.
Claude is called only for a 2-3 sentence plain-English conclusion, streamed via SSE.
"""

import json
import os
from pathlib import Path
from typing import Any

import anthropic
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter()

PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "advice_prompt.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text()

FALLBACK_CONCLUSION = "Simulation complete. Follow the action plan above."

ISPAD_NOTES = {
    "safe": "Starting glucose is within ISPAD 2022 recommended pre-exercise range (5–10 mmol/L).",
    "caution": "Consistent with ISPAD 2022: pre-exercise glucose warrants 10–15g fast carbs for mixed or aerobic activity.",
    "danger": "ISPAD 2022: glucose below safe threshold — give fast carbs and recheck before starting activity.",
}

DISCLAIMER = (
    "Steady is decision support, not medical advice. Always follow your diabetes team's specific guidance."
)

# Public ISPAD reference shown in UI/metadata
ISPAD_REFERENCE = {
    "title": "ISPAD Clinical Practice Consensus Guidelines",
    "year": 2022,
    "url": "https://www.ispad.org",
}

# Internal classifier → frontend traffic-light band (API always returns one of these)
SEVERITY_MAP = {
    "ok": "safe",
    "mild": "caution",
    "moderate": "caution",
    "severe": "danger",
    "critical": "danger",
}


def public_severity(internal: str) -> str:
    return SEVERITY_MAP.get(internal, "safe")


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
    # Optional fields (propagated from /simulate when the frontend includes them)
    insulin_inferred: bool = False
    insulin_inferred_units: float | None = None


class TreatmentOption(BaseModel):
    action: str
    detail: str
    priority: int  # 1 = most urgent


class TimelineEvent(BaseModel):
    time_min: int
    event: str
    glucose: float


class IspadReference(BaseModel):
    title: str
    year: int
    url: str


class Assumptions(BaseModel):
    insulin_inferred: bool
    insulin_inferred_units: float | None
    meal_timing_assumed: bool
    notes: str | None = None


class AdviseResponse(BaseModel):
    severity: str = Field(
        ...,
        description='Traffic-light band: one of "safe", "caution", "danger"',
    )
    severity_label: str = Field(
        ...,
        description="Short headline for the traffic-light band (plain English)",
    )
    immediate_step: str = Field(
        ...,
        description="Single clearest action to take first",
    )
    recheck_minutes: int = Field(..., description="Suggested minutes until next glucose check")
    backup_step: str = Field(
        ...,
        description="If things do not improve after the recheck window",
    )
    escalation: str = Field(
        ...,
        description="Emergency guidance when oral treatment is unsafe",
    )
    late_hypo_warning: str | None = Field(
        None,
        description="Optional bedtime / delayed-hypo note after long activity",
    )
    treatment_options: list[TreatmentOption]
    timeline: list[TimelineEvent]
    conclusion: str
    ispad_note: str
    disclaimer: str
    ispad_reference: IspadReference
    assumptions: Assumptions


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

    if req.late_hypo_risk:
        options.append(TreatmentOption(
            action="Post-exercise snack",
            detail="Have 15-20g slow carbs within 30 min after activity to prevent delayed hypo",
            priority=2,
        ))

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

BAND_HEADLINE = {
    "safe": "Safe to go",
    "caution": "Give carbs before she goes",
    "danger": "Stop — act before she plays",
}

BACKUP_STEP = (
    "If glucose has not improved after the recheck time, give another 10–15g fast-acting carbs "
    "and contact your diabetes team for next steps."
)

ESCALATION_STEP = (
    "If the child is unconscious, having seizures, or cannot swallow, do not give food by mouth. "
    "Call emergency services immediately."
)


def immediate_step_from_first_option(options: list[TreatmentOption]) -> str:
    """
    Immediate step must be derived from the first treatment option (priority-sorted).
    """
    if not options:
        return "Follow your diabetes team's guidance and recheck glucose."

    opt = options[0]
    action = opt.action.lower()
    detail = opt.detail.strip()

    if action in ("immediate fast carbs", "fast carbs"):
        # Detail includes grams and often ends with "now" already.
        detail_no_now = detail
        if detail_no_now.lower().endswith(" now"):
            detail_no_now = detail_no_now[: -len(" now")]
        return f"Give {detail_no_now} now."
    if action == "snack":
        # Detail does not include "now"; add it explicitly.
        return f"Give {detail} now."
    if action == "small snack":
        return f"Give {detail} now."
    if action == "stop activity":
        return "Stop strenuous activity immediately."
    if action == "reduce activity":
        return "Reduce activity intensity immediately."
    if action == "continue as planned":
        return "Safe to go — keep usual monitoring and follow your care plan."

    # Fallback: derive from the selected option.
    return f"{opt.action}: {detail}"


def backup_step_for_band(band: str) -> str:
    # Always reference the frontend's 15-minute recheck window.
    if band == "safe":
        return "If glucose starts trending down unexpectedly, follow your diabetes team's plan and consider checking sooner."
    if band == "caution":
        return (
            "If glucose hasn't improved after 15 minutes, give another 10-15g fast carbs "
            "and contact your diabetes team for next steps."
        )
    return (
        "Stop activity. If glucose hasn't improved after 15 minutes, give another 15-20g fast carbs "
        "and contact your diabetes team for next steps."
    )


def build_action_plan(
    band: str,
    req: AdviseRequest,
    treatment_options: list[TreatmentOption],
) -> dict:
    """Deterministic headlines + timing — no LLM."""
    severity_label = BAND_HEADLINE.get(band, BAND_HEADLINE["safe"])
    immediate = immediate_step_from_first_option(treatment_options)
    recheck = 15

    late = None
    if req.late_hypo_risk:
        late = (
            "After longer aerobic or mixed activity, glucose can fall hours later. "
            "Check before bed and consider a slow-release snack if your team agrees."
        )

    return {
        "severity_label": severity_label,
        "immediate_step": immediate,
        "recheck_minutes": recheck,
        "backup_step": backup_step_for_band(band),
        "escalation": ESCALATION_STEP,
        "late_hypo_warning": late,
    }


def build_timeline(req: AdviseRequest) -> list[TimelineEvent]:
    events = []
    median = req.median
    times = req.times

    events.append(TimelineEvent(time_min=times[0], event="Current reading", glucose=median[0]))

    peak_idx = int(max(range(len(median)), key=lambda i: median[i]))
    if peak_idx > 0:
        events.append(TimelineEvent(time_min=times[peak_idx], event="Peak glucose", glucose=median[peak_idx]))

    for i, g in enumerate(median):
        if g < 5.0 and i > 0 and median[i - 1] >= 5.0:
            events.append(TimelineEvent(time_min=times[i], event="Dropping below 5.0", glucose=round(g, 2)))
            break

    for i, g in enumerate(median):
        if g < 3.9 and i > 0 and median[i - 1] >= 3.9:
            events.append(TimelineEvent(time_min=times[i], event="Hypo threshold crossed", glucose=round(g, 2)))
            break

    min_idx = int(min(range(len(median)), key=lambda i: median[i]))
    events.append(TimelineEvent(time_min=times[min_idx], event="Lowest predicted", glucose=median[min_idx]))

    events.append(TimelineEvent(time_min=times[-1], event="End of simulation", glucose=median[-1]))

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
    print(
        f"Calling Claude for conclusion, key present: {bool(os.environ.get('ANTHROPIC_API_KEY'))}"
    )
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or not str(api_key).strip():
        yield FALLBACK_CONCLUSION
        return

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

    try:
        client = anthropic.Anthropic(api_key=api_key.strip(), timeout=30.0)
        with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=256,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(context)}],
        ) as stream:
            for text in stream.text_stream:
                yield text
    except Exception:
        yield FALLBACK_CONCLUSION


def get_conclusion_sync(severity: str, req: AdviseRequest, treatment_options, timeline) -> str:
    parts = []
    for chunk in stream_conclusion(severity, req, treatment_options, timeline):
        parts.append(chunk)
    return "".join(parts) if parts else FALLBACK_CONCLUSION


def _normalize_advise_input(body: dict[str, Any]) -> tuple[AdviseRequest, float | None]:
    """
    Support both:
    - Current UI contract: flat AdviseRequest fields
    - Compatibility envelope used by the provided curl command: {simulation, params, child_name}
    """
    if isinstance(body, dict) and body.get("simulation") is not None and body.get("params") is not None:
        sim = body["simulation"] or {}
        params = body["params"] or {}
        median = sim.get("median") or []
        n = len(median)
        if n >= 2:
            times = [int(i * (120 / (n - 1))) for i in range(n)]
        else:
            times = [0]

        glucose_override = params.get("glucose")

        normalized: dict[str, Any] = {
            "times": times,
            "median": median,
            "p10": sim.get("p10") or [],
            "p90": sim.get("p90") or [],
            "iob_units": sim.get("iob_units", 0.0),
            "min_median": sim.get("min_median"),
            "min_p10": sim.get("min_p10"),
            "danger_probability": sim.get("danger_probability", 0.0),
            "danger_entry_minutes": sim.get("danger_entry_minutes"),
            "late_hypo_risk": sim.get("late_hypo_risk", False),
            "activity_type": params.get("activity_type") or sim.get("activity_type") or "rest",
            "confidence_score": sim.get("confidence_score", 1),
            "insulin_inferred": False,
            "insulin_inferred_units": None,
        }
        return AdviseRequest.model_validate(normalized), glucose_override

    glucose_override = body.get("glucose")
    return AdviseRequest.model_validate(body), glucose_override


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/advise", response_model=AdviseResponse)
def advise(body: dict[str, Any]):
    # Normalize request (supports both current UI contract and the provided curl envelope).
    req, glucose_override = _normalize_advise_input(body)

    median0 = req.median[0] if req.median else None

    # Safety override — handle extreme hypo/hyper directly (before any other logic / Claude).
    if (median0 is not None and median0 < 4.0) or (glucose_override is not None and glucose_override < 4.0):
        now_glucose = float(median0) if median0 is not None else float(glucose_override)
        return AdviseResponse(
            severity="danger",
            severity_label="Already hypoglycemic — act now",
            immediate_step="Give 15g fast carbs immediately. Glucose is already below safe threshold.",
            treatment_options=[
                TreatmentOption(action="Glucose tablets", detail="3 tablets (fast)", priority=1),
                TreatmentOption(action="Orange juice", detail="150ml (fast)", priority=1),
                TreatmentOption(action="Small banana", detail="half (medium)", priority=2),
            ],
            timeline=[
                TimelineEvent(time_min=0, event="Give 15g fast carbs immediately", glucose=now_glucose),
                TimelineEvent(time_min=15, event="Recheck glucose", glucose=now_glucose),
            ],
            recheck_minutes=15,
            backup_step="If glucose has not risen after 15 minutes give another 15g and call your diabetes team",
            escalation="If child is unconscious or cannot swallow do not give food. Call 112 immediately.",
            ispad_note="ISPAD 2022: glucose below 4.0 mmol/L requires immediate fast-acting carbohydrate treatment before any activity.",
            disclaimer="Steady is decision support, not medical advice.",
            conclusion="Glucose is already in the hypoglycemic range. Do not start activity. Give fast carbs now and recheck in 15 minutes.",
            late_hypo_warning=None,
            ispad_reference=IspadReference(**ISPAD_REFERENCE),
            assumptions=Assumptions(
                insulin_inferred=False,
                insulin_inferred_units=None,
                meal_timing_assumed=False,
                notes="Glucose below 4.0 mmol/L — simulation bypassed, immediate treatment required",
            ),
        )

    if (median0 is not None and median0 > 14.0) or (glucose_override is not None and glucose_override > 14.0):
        now_glucose = float(median0) if median0 is not None else float(glucose_override)
        return AdviseResponse(
            severity="caution",
            severity_label="Check for ketones first",
            immediate_step="Check ketone levels before any activity. Glucose is above safe exercise threshold.",
            treatment_options=[],
            timeline=[
                TimelineEvent(time_min=0, event="Check ketone levels", glucose=now_glucose),
                TimelineEvent(
                    time_min=15,
                    event="If ketones clear, light activity only — monitor every 15 min",
                    glucose=now_glucose,
                ),
                TimelineEvent(
                    time_min=15,
                    event="If ketones present, no exercise — contact diabetes team",
                    glucose=now_glucose,
                ),
            ],
            recheck_minutes=15,
            backup_step="If ketones are present do not allow exercise and contact your diabetes team immediately",
            escalation="If child feels unwell, is vomiting, or breathing rapidly call 112 immediately.",
            ispad_note="ISPAD 2022: glucose above 14 mmol/L — check ketones before exercise.",
            disclaimer="Steady is decision support, not medical advice.",
            conclusion="Glucose is above the safe exercise threshold. Check for ketones before any activity. If ketones are clear, light activity is acceptable with close monitoring.",
            late_hypo_warning=None,
            ispad_reference=IspadReference(**ISPAD_REFERENCE),
            assumptions=Assumptions(
                insulin_inferred=False,
                insulin_inferred_units=None,
                meal_timing_assumed=False,
                notes="Glucose above 14.0 mmol/L — ketone check required before simulation",
            ),
        )

    internal = classify_severity(req)
    band = public_severity(internal)
    treatment_options = get_treatment_options(internal, req)
    timeline = build_timeline(req)
    note = ISPAD_NOTES[band]
    conclusion = get_conclusion_sync(internal, req, treatment_options, timeline)
    plan = build_action_plan(band, req, treatment_options)

    assumptions = Assumptions(
        insulin_inferred=req.insulin_inferred,
        insulin_inferred_units=req.insulin_inferred_units,
        meal_timing_assumed=False,
        notes=None,
    )

    return AdviseResponse(
        severity=band,
        severity_label=plan["severity_label"],
        immediate_step=plan["immediate_step"],
        recheck_minutes=plan["recheck_minutes"],
        backup_step=plan["backup_step"],
        escalation=plan["escalation"],
        late_hypo_warning=plan["late_hypo_warning"],
        treatment_options=treatment_options,
        timeline=timeline,
        conclusion=conclusion or FALLBACK_CONCLUSION,
        ispad_note=note,
        disclaimer=DISCLAIMER,
        ispad_reference=IspadReference(**ISPAD_REFERENCE),
        assumptions=assumptions,
    )


@router.post("/advise/stream")
def advise_stream(req: AdviseRequest):
    internal = classify_severity(req)
    band = public_severity(internal)
    treatment_options = get_treatment_options(internal, req)
    timeline = build_timeline(req)
    note = ISPAD_NOTES[band]
    plan = build_action_plan(band, req, treatment_options)

    assumptions = Assumptions(
        insulin_inferred=req.insulin_inferred,
        insulin_inferred_units=req.insulin_inferred_units,
        meal_timing_assumed=False,
        notes=None,
    )

    def sse_generator():
        structured = {
            "severity": band,
            "severity_label": plan["severity_label"],
            "immediate_step": plan["immediate_step"],
            "recheck_minutes": plan["recheck_minutes"],
            "backup_step": plan["backup_step"],
            "escalation": plan["escalation"],
            "late_hypo_warning": plan["late_hypo_warning"],
            "treatment_options": [t.model_dump() for t in treatment_options],
            "timeline": [e.model_dump() for e in timeline],
            "ispad_note": note,
            "disclaimer": DISCLAIMER,
            "ispad_reference": IspadReference(**ISPAD_REFERENCE).model_dump(),
            "assumptions": assumptions.model_dump(),
        }
        yield f"data: {json.dumps({'type': 'metadata', 'data': structured})}\n\n"

        try:
            for chunk in stream_conclusion(internal, req, treatment_options, timeline):
                yield f"data: {json.dumps({'type': 'conclusion', 'text': chunk})}\n\n"
        except Exception:
            yield f"data: {json.dumps({'type': 'conclusion', 'text': FALLBACK_CONCLUSION})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
