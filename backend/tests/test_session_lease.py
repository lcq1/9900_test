"""Occupancy lease: a second live browser tab must not share one session."""
from uuid import uuid4

from app.core import database
from app.participant.models import ParticipantSession
from app.researcher.models import Experiment


def live_experiment(client, headers, code):
    response = client.post(
        "/api/experiments",
        headers=headers,
        json={"name": "Lease", "code": code, "stages": []},
    )
    assert response.status_code == 201
    data = response.json()
    with database.SessionLocal() as db:
        exp = db.get(Experiment, data["id"])
        exp.status = "Live"
        exp.code = code
        exp.stages = [
            {
                "id": "stage-" + code,
                "name": "Study",
                "type": "task",
                "components": [],
                "features": {"ai": True},
            }
        ]
        db.commit()
    return code


def participant_headers(client, code, participant="P01"):
    response = client.post(
        "/api/participant/access",
        json={"experimentCode": code, "participantCode": participant},
    )
    assert response.status_code == 200, response.text
    return {"X-Participant-Token": response.json()["token"]}


def start_body(code, client_id=None):
    body = {
        "experimentCode": code,
        "participantCode": "P01",
        "sessionId": str(uuid4()),
    }
    if client_id:
        body["clientId"] = client_id
    return body


def test_second_tab_is_rejected_but_the_same_tab_can_refresh(client, auth_headers):
    code = live_experiment(client, auth_headers, "LEASE1")
    headers = participant_headers(client, code)
    first = client.post(
        "/api/participant/sessions/start",
        headers=headers,
        json=start_body(code, "tab-A"),
    )
    assert first.status_code == 200, first.text
    session_id = first.json()["sessionId"]

    second = client.post(
        "/api/participant/sessions/start",
        headers=headers,
        json=start_body(code, "tab-B"),
    )
    assert second.status_code == 409
    assert "another browser tab" in second.json()["detail"]

    refresh = client.post(
        "/api/participant/sessions/start",
        headers=headers,
        json=start_body(code, "tab-A"),
    )
    assert refresh.status_code == 200
    assert refresh.json()["sessionId"] == session_id


def test_expired_lease_allows_takeover_and_keeps_saved_progress(client, auth_headers):
    code = live_experiment(client, auth_headers, "LEASE2")
    headers = participant_headers(client, code)
    body = start_body(code, "tab-A")
    first = client.post("/api/participant/sessions/start", headers=headers, json=body)
    assert first.status_code == 200
    session_id = first.json()["sessionId"]

    progress = {
        "sessionId": session_id,
        "updatedAt": 123,
        "stageIndex": 0,
        "answers": {"draft": "kept"},
        "deadlines": {},
    }
    checkpoint = {
        "seq": 0,
        "type": "progress_checkpoint",
        "timestamp": "2026-11-03T01:00:00Z",
        "epochMs": 1793667600000,
        "perfMs": 0,
        "detail": {"progress": progress},
    }
    saved = client.post(
        "/api/participant/sessions",
        headers=headers,
        json={
            **body,
            "sessionId": session_id,
            "finishedAt": None,
            "answers": [{"componentId": "draft", "value": "kept"}],
            "events": [checkpoint],
        },
    )
    assert saved.status_code == 201, saved.text

    with database.SessionLocal() as db:
        db.get(ParticipantSession, session_id).lease_expires_at = "0"
        db.commit()

    takeover = client.post(
        "/api/participant/sessions/start",
        headers=headers,
        json=start_body(code, "tab-B"),
    )
    assert takeover.status_code == 200, takeover.text
    assert takeover.json()["sessionId"] == session_id
    assert takeover.json()["progress"]["answers"] == {"draft": "kept"}


def test_callers_without_a_client_id_keep_the_legacy_resume_behaviour(client, auth_headers):
    code = live_experiment(client, auth_headers, "LEASE3")
    headers = participant_headers(client, code)
    first = client.post(
        "/api/participant/sessions/start", headers=headers, json=start_body(code)
    )
    assert first.status_code == 200
    resumed = client.post(
        "/api/participant/sessions/start", headers=headers, json=start_body(code)
    )
    assert resumed.status_code == 200
    assert resumed.json()["sessionId"] == first.json()["sessionId"]


def test_a_different_participant_is_not_blocked(client, auth_headers):
    code = live_experiment(client, auth_headers, "LEASE4")
    first = client.post(
        "/api/participant/sessions/start",
        headers=participant_headers(client, code, "P01"),
        json=start_body(code, "tab-A"),
    )
    assert first.status_code == 200
    other = client.post(
        "/api/participant/sessions/start",
        headers=participant_headers(client, code, "P02"),
        json={**start_body(code, "tab-B"), "participantCode": "P02"},
    )
    assert other.status_code == 200
    assert other.json()["sessionId"] != first.json()["sessionId"]
