"""Plan-aligned generic Stage, single-route Session and event timeline tests."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from test_researcher_api import register_and_login


def generic_experiment_body() -> dict:
    return {
        "name": "Configurable Stage Study",
        "fullscreenMode": True,
        "dataStorageDescription": "Coded study data is stored separately from identity data.",
        "storageLocation": "Approved university research storage",
        "participantSafetyInformation": "Access is restricted to the research team.",
        "status": "published",
        "stages": [
            {
                "templateType": "static",
                "title": "Welcome",
                "position": 0,
                "components": [{"id": "welcome-copy", "type": "text", "text": "Welcome to the study."}],
                "timeLimit": None,
                "showClock": True,
            },
            {
                "templateType": "questionnaire",
                "title": "Questions",
                "position": 1,
                "components": [
                    {
                        "id": "discipline",
                        "type": "single_choice",
                        "text": "What is your discipline?",
                        "options": ["Computer Science", "Software Engineering"],
                        "required": True,
                    }
                ],
                "timeLimit": 600,
                "copyPasteLogging": True,
            },
        ],
    }


def test_single_route_session_and_idempotent_event_batch(client: TestClient) -> None:
    register_and_login(client)
    created_response = client.post("/api/experiments", json=generic_experiment_body())
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()["data"]
    assert [stage["templateType"] for stage in created["stages"]] == ["static", "questionnaire"]

    provisioned = client.post(f"/api/experiments/{created['id']}/participants", json={})
    participant_code = provisioned.json()["data"]["participantCode"]
    client.post("/api/auth/logout")
    assert client.post(
        "/api/auth/participant/login",
        json={"experiment_code": created["code"], "participant_code": participant_code},
    ).status_code == 200

    session = client.get("/api/participant/session")
    assert session.status_code == 200
    current = session.json()["data"]["currentStage"]
    assert current["title"] == "Welcome"

    event = {
        "stageId": current["id"],
        "eventType": "stage_entered",
        "payload": {"participantCode": "must-not-be-stored", "source": "test"},
        "clientTimestamp": datetime.now(timezone.utc).isoformat(),
        "clientSequence": 0,
    }
    first_batch = client.post("/api/participant/session/events/batch", json={"events": [event]})
    assert first_batch.status_code == 200
    assert first_batch.json()["data"]["accepted"] == 1
    duplicate_batch = client.post("/api/participant/session/events/batch", json={"events": [event]})
    assert duplicate_batch.status_code == 200
    assert duplicate_batch.json()["data"]["accepted"] == 0

    advanced = client.post("/api/participant/session/current-stage/responses", json={"answerData": {}})
    assert advanced.status_code == 200
    assert advanced.json()["data"]["currentStage"]["title"] == "Questions"

    completed = client.post(
        "/api/participant/session/current-stage/responses",
        json={"answerData": {"discipline": "Computer Science"}},
    )
    assert completed.status_code == 200
    assert completed.json()["data"]["status"] == "completed"
    final_session = client.get("/api/participant/session").json()["data"]
    assert final_session["status"] == "completed"
    assert final_session["currentStage"] is None
