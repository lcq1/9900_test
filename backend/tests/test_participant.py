"""Participant lookup, submission and retrieval tests."""

from __future__ import annotations


def _make_experiment(client, headers, code="ZZZ1"):
    return client.post(
        "/api/experiments",
        json={"name": "E", "code": code, "stages": []},
        headers=headers,
    )


def _submit_payload(experiment_code="ZZZ1"):
    return {
        "experimentCode": experiment_code,
        "participantCode": "abc",
        "finishedAt": None,
        "answers": [
            {"componentId": "c1", "value": "hello"},
            {"componentId": "c2", "value": ["a", "b"]},
        ],
        "events": [
            {
                "seq": 0,
                "type": "stage_view",
                "timestamp": "2026-01-01T00:00:00Z",
                "epochMs": 1000,
                "perfMs": 5,
                "stageId": "s1",
                "detail": {"x": 1},
            },
            {
                "seq": 1,
                "type": "answer",
                "timestamp": "2026-01-01T00:00:01Z",
                "epochMs": 2000,
                "perfMs": 3,
                "stageId": None,
                "detail": None,
            },
        ],
    }


def test_lookup_and_submit_roundtrip(client, auth_headers):
    created = _make_experiment(client, auth_headers)
    assert created.status_code == 201
    code = created.json()["code"]

    # lookup requires auth
    assert (
        client.get(
            f"/api/participant/lookup?code={code.lower()}&participant=abc"
        ).status_code
        == 401
    )

    r = client.get(
        f"/api/participant/lookup?code={code.lower()}&participant=abc",
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["code"] == code

    # case-insensitive code match
    r = client.get(
        f"/api/participant/lookup?code={code.lower()}&participant=abcde",
        headers=auth_headers,
    )
    assert r.status_code == 200

    # missing experiment
    r = client.get(
        "/api/participant/lookup?code=NOPE&participant=abc", headers=auth_headers
    )
    assert r.status_code == 404

    # participant code too short
    r = client.get(
        f"/api/participant/lookup?code={code}&participant=ab", headers=auth_headers
    )
    assert r.status_code == 400

    # submit session
    r = client.post(
        "/api/participant/sessions", json=_submit_payload(code), headers=auth_headers
    )
    assert r.status_code == 201
    data = r.json()
    assert data["id"]
    assert data["startedAt"]
    assert data["experimentCode"] == code
    assert data["participantCode"] == "abc"
    assert len(data["answers"]) == 2
    assert data["answers"][0]["value"] == "hello"
    assert data["answers"][1]["value"] == ["a", "b"]
    assert len(data["events"]) == 2
    assert data["events"][0]["seq"] == 0
    assert data["events"][0]["type"] == "stage_view"
    assert data["events"][0]["stageId"] == "s1"
    assert data["events"][0]["detail"] == {"x": 1}
    assert data["events"][1]["stageId"] is None
    assert data["events"][1]["detail"] is None
    session_id = data["id"]

    # retrieve
    r = client.get(f"/api/participant/sessions/{session_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["events"][0]["seq"] == 0

    # list
    r = client.get("/api/participant/sessions", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1

    # missing session
    r = client.get("/api/participant/sessions/nope", headers=auth_headers)
    assert r.status_code == 404


def test_participant_requires_auth(client):
    assert client.get("/api/participant/sessions").status_code == 401


def test_publication_requires_consent_and_content():
    import pytest
    from fastapi import HTTPException
    from app.researcher.service import validate_publication
    with pytest.raises(HTTPException): validate_publication([])
    with pytest.raises(HTTPException): validate_publication([{"id": "a", "type": "short_answer"}] * 2)
    validate_publication([{"id": "c", "type": "consent", "name": "Consent", "components": [{"type": "text", "label": "Consent text"}]}, {"id": "t", "type": "short_answer", "name": "Task", "components": [{"type": "text", "label": "Task text"}]}])
