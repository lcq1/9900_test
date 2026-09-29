"""Participant login, consent, progress and answer flow tests."""

from fastapi.testclient import TestClient

from test_researcher_api import experiment_body, register_and_login


def test_complete_participant_flow(client: TestClient) -> None:
    register_and_login(client)
    created = client.post("/api/experiments", json=experiment_body(status="published")).json()["data"]
    experiment_id = created["id"]
    provisioned = client.post(f"/api/experiments/{experiment_id}/participants", json={})
    assert provisioned.status_code == 201
    participant_code = provisioned.json()["data"]["participantCode"]
    client.post("/api/auth/logout")

    login = client.post(
        "/api/auth/participant/login",
        json={"experiment_code": created["code"], "participant_code": participant_code},
    )
    assert login.status_code == 200
    assert login.json()["data"]["user"]["role"] == "participant"

    overview = client.get("/api/participant/experiment").json()["data"]
    assert overview["consentText"] == "I agree."
    assert client.post("/api/participant/consent", json={"accepted": True}).status_code == 200

    overview = client.get("/api/participant/experiment").json()["data"]
    questionnaire_id = overview["currentStageId"]
    assert questionnaire_id
    assert client.get(f"/api/participant/stages/{questionnaire_id}").status_code == 200

    first = client.post(
        f"/api/participant/stages/{questionnaire_id}/responses",
        json={"answerData": {"text": "Answer"}},
    )
    task_id = first.json()["data"]["nextStageId"]
    assert task_id

    second = client.post(
        f"/api/participant/stages/{task_id}/responses",
        json={"answerData": {"text": "Done"}},
    )
    assert second.status_code == 200
    assert second.json()["data"]["nextStageId"] is None
    assert client.get("/api/participant/experiment").json()["data"]["progress"] == 100
