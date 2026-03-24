"""ICR inference on /extract (Anthropic mocked)."""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app

CLIENT = TestClient(app)

CLAUDE_JSON = {
    "glucose": 6.8,
    "carbs_g": 30,
    "gi_category": "medium",
    "mins_since_meal": 0,
    "insulin_units": 0,
    "insulin_type": "novorapid",
    "mins_since_insulin": 0,
    "activity_type": "mixed",
    "activity_duration_mins": 60,
    "intensity": 1.0,
    "profile": {
        "isf": 2.8,
        "icr": 10,
        "ait_hours": 3.5,
        "weight_kg": 28,
    },
}


@patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
@patch("routes.extract.anthropic.Anthropic")
def test_extract_icr_inference_merges_request_profile(mock_anthropic_class):
    mock_client = MagicMock()
    mock_anthropic_class.return_value = mock_client
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(CLAUDE_JSON))]
    mock_client.messages.create.return_value = msg

    body = {
        "text": "Lena is at 6.8, had 30g carbs, football for an hour",
        "profile": {"isf": 2.8, "icr": 15, "ait_hours": 3.5, "weight_kg": 28},
    }
    r = CLIENT.post("/extract", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["insulin_inferred"] is True
    assert data["insulin_inferred_units"] == 2.0
    assert data["insulin_units"] == 2.0
    assert data["profile"]["icr"] == 15


@patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
@patch("routes.extract.anthropic.Anthropic")
def test_extract_no_inference_when_insulin_present(mock_anthropic_class):
    payload = {**CLAUDE_JSON, "insulin_units": 2.0}
    mock_client = MagicMock()
    mock_anthropic_class.return_value = mock_client
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(payload))]
    mock_client.messages.create.return_value = msg

    r = CLIENT.post("/extract", json={"text": "x"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["insulin_inferred"] is False
    assert data["insulin_inferred_units"] is None
    assert data["insulin_units"] == 2.0


def test_simulate_icr_inference():
    body = {
        "glucose": 6.8,
        "carbs_g": 30,
        "insulin_units": 0,
        "activity_type": "mixed",
        "activity_duration_mins": 60,
        "intensity": 1.0,
        "profile": {"isf": 2.8, "icr": 15, "ait_hours": 3.5, "weight_kg": 28},
    }
    r = CLIENT.post("/simulate", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["insulin_inferred"] is True
    assert data["insulin_inferred_units"] == 2.0
